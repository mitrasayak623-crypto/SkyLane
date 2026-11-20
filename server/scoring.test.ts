import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHeatIndex,
  describeWeatherCode,
  detectSuddenForecastChange,
  findBestTimeWindow,
  getConfidenceForDayIndex,
  scoreDayForEvent,
  summarizeEventPlan,
} from './scoring';
import type { DailyForecast, HourlyPoint } from '../shared/types';

function makeDay(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date: '2026-12-12',
    dayIndex: 0,
    weatherCode: 0,
    conditionLabel: 'Clear sky',
    skyTheme: 'clear-day',
    isStorm: false,
    tempMax: 29,
    tempMin: 19,
    feelsLikeMax: 30,
    rainProbability: 5,
    rainSumMm: 0,
    windMaxKmh: 12,
    gustMaxKmh: 18,
    uvMax: 6.5,
    humidityMean: 52,
    sunrise: '2026-12-12T06:48',
    sunset: '2026-12-12T17:58',
    confidence: 'high',
    confidenceLabel: 'High confidence',
    ...overrides,
  };
}

test('confidence tiers map days 1-5 high, 6-7 medium, 8-10 low', () => {
  assert.equal(getConfidenceForDayIndex(0).confidence, 'high');
  assert.equal(getConfidenceForDayIndex(4).confidence, 'high');
  assert.equal(getConfidenceForDayIndex(5).confidence, 'medium');
  assert.equal(getConfidenceForDayIndex(6).confidence, 'medium');
  assert.equal(getConfidenceForDayIndex(7).confidence, 'low');
  assert.equal(getConfidenceForDayIndex(9).confidence, 'low');
});

test('event scoring penalizes rain heavily for outdoor weddings vs meetings', () => {
  const clearDay = makeDay();
  const rainyDay = makeDay({
    rainProbability: 75,
    rainSumMm: 14,
    gustMaxKmh: 38,
    weatherCode: 63,
    conditionLabel: 'Moderate rain',
  });

  const weddingClear = scoreDayForEvent(clearDay, 'wedding');
  const weddingRainy = scoreDayForEvent(rainyDay, 'wedding');
  const meetingRainy = scoreDayForEvent(rainyDay, 'meeting');

  assert.ok(weddingClear.score >= 85, `Expected clear wedding day >= 85, got ${weddingClear.score}`);
  assert.equal(weddingClear.tone, 'green');
  assert.ok(weddingRainy.score < 45, `Expected rainy wedding day < 45, got ${weddingRainy.score}`);
  assert.equal(weddingRainy.tone, 'red');
  assert.ok(
    meetingRainy.score > weddingRainy.score,
    'Indoor business meeting should tolerate moderate rain better than an outdoor wedding'
  );
});

test('flight scoring heavily penalizes storms and dense fog', () => {
  const stormDay = makeDay({ weatherCode: 95, isStorm: true, gustMaxKmh: 52, rainSumMm: 18 });
  const fogDay = makeDay({ weatherCode: 45, conditionLabel: 'Misty fog' });
  const clearDay = makeDay();

  const stormScore = scoreDayForEvent(stormDay, 'flight');
  const fogScore = scoreDayForEvent(fogDay, 'flight');
  const clearScore = scoreDayForEvent(clearDay, 'flight');

  assert.ok(clearScore.score >= 90);
  assert.ok(stormScore.score < 45, `Storm flight score should be < 45, got ${stormScore.score}`);
  assert.ok(fogScore.score < 75, `Fog flight score should drop below 75, got ${fogScore.score}`);
});

test('findBestTimeWindow selects dry evening window for outdoor wedding', () => {
  const date = '2026-12-14';
  const hourly: HourlyPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    date,
    hour,
    temperature: hour >= 16 && hour <= 19 ? 27 : 35,
    feelsLike: 28,
    humidity: 55,
    rainProbability: hour >= 16 && hour <= 19 ? 5 : 65,
    rainMm: hour >= 16 && hour <= 19 ? 0 : 4,
    windSpeed: 10,
    windGusts: 15,
    cloudCover: 20,
    visibilityKm: 10,
    uvIndex: hour >= 16 ? 2 : 8,
    weatherCode: 1,
  }));

  const win = findBestTimeWindow(hourly, date, 'wedding');
  assert.ok(win, 'Expected a best hourly window');
  assert.equal(win.startHour, 16);
  assert.equal(win.endHour, 19);
  assert.match(win.label, /4 PM.*7 PM/);
  assert.ok(win.planB.length > 20);
});

test('detectSuddenForecastChange flags >30-point rain jump and newly appearing storm', () => {
  const prev = [makeDay({ date: '2026-12-15', rainProbability: 15, isStorm: false })];
  const minorShift = [makeDay({ date: '2026-12-15', rainProbability: 35, isStorm: false })];
  const rainSpike = [makeDay({ date: '2026-12-15', rainProbability: 62, isStorm: false })];
  const newStorm = [
    makeDay({
      date: '2026-12-15',
      rainProbability: 25,
      isStorm: true,
      weatherCode: 95,
      conditionLabel: 'Thunderstorm',
    }),
  ];

  assert.equal(detectSuddenForecastChange(prev, minorShift, '2026-12-15').changed, false);

  const spikeResult = detectSuddenForecastChange(prev, rainSpike, '2026-12-15');
  assert.equal(spikeResult.changed, true);
  assert.equal(spikeResult.rainDelta, 47);
  assert.equal(spikeResult.severity, 'critical');

  const stormResult = detectSuddenForecastChange(prev, newStorm, '2026-12-15');
  assert.equal(stormResult.changed, true);
  assert.equal(stormResult.newStorm, true);
});

test('calculateHeatIndex elevates apparent heat when hot and humid', () => {
  const humidHeat = calculateHeatIndex(36, 75);
  assert.ok(humidHeat.heatIndex > 40, `Expected heat index > 40, got ${humidHeat.heatIndex}`);
  const cool = calculateHeatIndex(22, 50);
  assert.equal(cool.heatIndex, 22);
});

test('summarizeEventPlan identifies best 2 days and days to avoid', () => {
  const days = [
    makeDay({ date: '2026-12-10', dayIndex: 0, rainProbability: 5 }),
    makeDay({ date: '2026-12-11', dayIndex: 1, rainProbability: 85, rainSumMm: 22, isStorm: true }),
    makeDay({ date: '2026-12-12', dayIndex: 2, rainProbability: 10 }),
  ];
  const plan = summarizeEventPlan(days, [], 'wedding');
  assert.equal(plan.bestDays.length, 2);
  assert.equal(plan.bestDays[0].date, '2026-12-10');
  assert.equal(plan.avoidDays.length, 1);
  assert.equal(plan.avoidDays[0].date, '2026-12-11');
  assert.equal(describeWeatherCode(95).isStorm, true);
});
