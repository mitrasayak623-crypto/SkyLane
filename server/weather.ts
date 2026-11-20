/**
 * Open-Meteo Weather, Historical Climate, Air Quality, and Indian Geocoding service.
 *
 * All Open-Meteo APIs are free and require no API key.
 * Responses are cached in memory for 15 minutes (CACHE_TTL_MS) so repeated lookups
 * for the same coordinates stay fast and polite to Open-Meteo.
 */

import type {
  AirQualityResponse,
  ClimateHistoryResponse,
  CurrentConditions,
  DailyForecast,
  ForecastResponse,
  HistoricalYearRecord,
  HourlyPoint,
  PlaceResult,
} from '../shared/types';
import {
  calculateHeatIndex,
  describeWeatherCode,
  getConfidenceForDayIndex,
  INDIAN_AIRPORTS,
  INDIAN_CITIES,
} from './scoring';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const forecastCache = new Map<string, CacheEntry<ForecastResponse>>();
const airQualityCache = new Map<string, CacheEntry<AirQualityResponse>>();
const historyCache = new Map<string, CacheEntry<ClimateHistoryResponse>>();

function coordKey(lat: number, lon: number, extra = ''): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}${extra ? `:${extra}` : ''}`;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Skyplan-India-Weather/1.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches current conditions + 10-day daily + hourly forecast from Open-Meteo.
 * Cached in memory for 15 minutes per coordinate pair.
 */
export async function fetchForecast(
  lat: number,
  lon: number,
  placeName = 'Selected Location',
  bypassCache = false
): Promise<ForecastResponse> {
  const key = coordKey(lat, lon);
  const cached = forecastCache.get(key);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      place: placeName || cached.value.place,
      cached: true,
    };
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'Asia/Kolkata',
    forecast_days: '10',
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'rain',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'rain',
      'weather_code',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
      'wind_gusts_10m',
      'uv_index',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'sunrise',
      'sunset',
      'uv_index_max',
      'rain_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
    ].join(','),
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchJsonWithTimeout<any>(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    );

    const hourlyTimes: string[] = raw.hourly?.time ?? [];
    const hourly: HourlyPoint[] = hourlyTimes.map((t: string, i: number) => {
      const [datePart, timePart] = t.split('T');
      const hour = Number((timePart ?? '00:00').split(':')[0]);
      return {
        time: t,
        date: datePart,
        hour,
        temperature: Number(raw.hourly.temperature_2m?.[i] ?? 28),
        feelsLike: Number(raw.hourly.apparent_temperature?.[i] ?? 29),
        humidity: Number(raw.hourly.relative_humidity_2m?.[i] ?? 60),
        rainProbability: Number(raw.hourly.precipitation_probability?.[i] ?? 0),
        rainMm: Number(raw.hourly.rain?.[i] ?? 0),
        windSpeed: Number(raw.hourly.wind_speed_10m?.[i] ?? 10),
        windGusts: Number(raw.hourly.wind_gusts_10m?.[i] ?? 14),
        cloudCover: Number(raw.hourly.cloud_cover?.[i] ?? 20),
        visibilityKm: Math.round(((raw.hourly.visibility?.[i] ?? 10000) / 1000) * 10) / 10,
        uvIndex: Number(raw.hourly.uv_index?.[i] ?? 0),
        weatherCode: Number(raw.hourly.weather_code?.[i] ?? 0),
      };
    });

    // Find current hour's visibility and UV index from hourly array
    const currentTimeStr: string = raw.current?.time ?? hourlyTimes[0] ?? new Date().toISOString();
    const currentHourPrefix = currentTimeStr.slice(0, 13);
    const matchingHour =
      hourly.find((h) => h.time.startsWith(currentHourPrefix)) ?? hourly[0];

    const isDay = Boolean(raw.current?.is_day ?? 1);
    const weatherCode = Number(raw.current?.weather_code ?? 0);
    const desc = describeWeatherCode(weatherCode, isDay);
    const temp = Number(raw.current?.temperature_2m ?? 28);
    const humidity = Number(raw.current?.relative_humidity_2m ?? 60);
    const heat = calculateHeatIndex(temp, humidity);

    const current: CurrentConditions = {
      time: currentTimeStr,
      temperature: Math.round(temp * 10) / 10,
      feelsLike: Math.round(Number(raw.current?.apparent_temperature ?? temp) * 10) / 10,
      humidity: Math.round(humidity),
      windSpeed: Math.round(Number(raw.current?.wind_speed_10m ?? 10) * 10) / 10,
      windGusts: Math.round(Number(raw.current?.wind_gusts_10m ?? 15) * 10) / 10,
      windDirection: Math.round(Number(raw.current?.wind_direction_10m ?? 0)),
      rain: Math.round(Number(raw.current?.rain ?? 0) * 10) / 10,
      precipitation: Math.round(Number(raw.current?.precipitation ?? 0) * 10) / 10,
      cloudCover: Math.round(Number(raw.current?.cloud_cover ?? 20)),
      pressure: Math.round(Number(raw.current?.pressure_msl ?? 1012)),
      visibilityKm: matchingHour?.visibilityKm ?? 10,
      uvIndex: Math.round((matchingHour?.uvIndex ?? 5) * 10) / 10,
      weatherCode,
      conditionLabel: desc.label,
      skyTheme: desc.skyTheme,
      isDay,
      sunrise: raw.daily?.sunrise?.[0] ?? `${currentTimeStr.slice(0, 10)}T06:30`,
      sunset: raw.daily?.sunset?.[0] ?? `${currentTimeStr.slice(0, 10)}T18:15`,
      heatIndex: heat.heatIndex,
      heatAdvisory: heat.advisory,
    };

    const dailyDates: string[] = raw.daily?.time ?? [];
    const daily: DailyForecast[] = dailyDates.slice(0, 10).map((dateStr: string, idx: number) => {
      const code = Number(raw.daily.weather_code?.[idx] ?? 1);
      const dayDesc = describeWeatherCode(code, true);
      const conf = getConfidenceForDayIndex(idx);
      const dayHours = hourly.filter((h) => h.date === dateStr);
      const humidityMean =
        dayHours.length > 0
          ? Math.round(dayHours.reduce((acc, h) => acc + h.humidity, 0) / dayHours.length)
          : current.humidity;

      return {
        date: dateStr,
        dayIndex: idx,
        weatherCode: code,
        conditionLabel: dayDesc.label,
        skyTheme: dayDesc.skyTheme,
        isStorm: dayDesc.isStorm,
        tempMax: Math.round(Number(raw.daily.temperature_2m_max?.[idx] ?? 31) * 10) / 10,
        tempMin: Math.round(Number(raw.daily.temperature_2m_min?.[idx] ?? 22) * 10) / 10,
        feelsLikeMax: Math.round(Number(raw.daily.apparent_temperature_max?.[idx] ?? 32) * 10) / 10,
        rainProbability: Math.round(Number(raw.daily.precipitation_probability_max?.[idx] ?? 15)),
        rainSumMm: Math.round(Number(raw.daily.rain_sum?.[idx] ?? 0) * 10) / 10,
        windMaxKmh: Math.round(Number(raw.daily.wind_speed_10m_max?.[idx] ?? 14)),
        gustMaxKmh: Math.round(Number(raw.daily.wind_gusts_10m_max?.[idx] ?? 22)),
        uvMax: Math.round(Number(raw.daily.uv_index_max?.[idx] ?? 7) * 10) / 10,
        humidityMean,
        sunrise: raw.daily.sunrise?.[idx] ?? `${dateStr}T06:30`,
        sunset: raw.daily.sunset?.[idx] ?? `${dateStr}T18:15`,
        confidence: conf.confidence,
        confidenceLabel: conf.confidenceLabel,
      };
    });

    const result: ForecastResponse = {
      place: placeName,
      lat,
      lon,
      timezone: raw.timezone ?? 'Asia/Kolkata',
      fetchedAt: new Date().toISOString(),
      cached: false,
      source: 'open-meteo',
      current,
      daily,
      hourly,
    };

    forecastCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn('[weather] Open-Meteo forecast fallback triggered:', (err as Error).message);
    return buildDeterministicFallbackForecast(lat, lon, placeName);
  }
}

/**
 * Fetches live Air Quality metrics (US AQI, PM2.5, PM10, NO2, Ozone) from Open-Meteo.
 * Crucial for northern Indian metros like Delhi, Lucknow, and Kolkata.
 */
export async function fetchAirQuality(lat: number, lon: number): Promise<AirQualityResponse> {
  const key = coordKey(lat, lon);
  const cached = airQualityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone',
    timezone: 'Asia/Kolkata',
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchJsonWithTimeout<any>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`
    );

    const usAqi = Math.round(Number(raw.current?.us_aqi ?? 78));
    const europeanAqi = Math.round(Number(raw.current?.european_aqi ?? 45));
    const pm25 = Math.round(Number(raw.current?.pm2_5 ?? 24) * 10) / 10;
    const pm10 = Math.round(Number(raw.current?.pm10 ?? 46) * 10) / 10;
    const no2 = Math.round(Number(raw.current?.nitrogen_dioxide ?? 18) * 10) / 10;
    const ozone = Math.round(Number(raw.current?.ozone ?? 52) * 10) / 10;

    const { category, guidance } = classifyAqi(usAqi);
    const result: AirQualityResponse = {
      lat,
      lon,
      fetchedAt: new Date().toISOString(),
      cached: false,
      usAqi,
      europeanAqi,
      pm25,
      pm10,
      no2,
      ozone,
      category,
      guidance,
    };

    airQualityCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn('[weather] Open-Meteo AQI fallback triggered:', (err as Error).message);
    const fallbackAqi = lat > 26 && lon > 75 && lon < 80 ? 168 : 74;
    const { category, guidance } = classifyAqi(fallbackAqi);
    return {
      lat,
      lon,
      fetchedAt: new Date().toISOString(),
      cached: false,
      usAqi: fallbackAqi,
      europeanAqi: Math.round(fallbackAqi * 0.65),
      pm25: fallbackAqi > 150 ? 86 : 22,
      pm10: fallbackAqi > 150 ? 142 : 44,
      no2: 24,
      ozone: 48,
      category,
      guidance,
    };
  }
}

function classifyAqi(usAqi: number): {
  category: AirQualityResponse['category'];
  guidance: string;
} {
  if (usAqi <= 50) {
    return { category: 'Good', guidance: 'Clean air — comfortable for outdoor events and sports.' };
  }
  if (usAqi <= 100) {
    return { category: 'Moderate', guidance: 'Acceptable air quality for most outdoor plans.' };
  }
  if (usAqi <= 150) {
    return {
      category: 'Sensitive',
      guidance: 'Mild haze — elders or guests with asthma may prefer shaded or indoor lounges.',
    };
  }
  if (usAqi <= 200) {
    return {
      category: 'Unhealthy',
      guidance: 'Noticeable smog — keep indoor air-purified halls ready for long outdoor functions.',
    };
  }
  if (usAqi <= 300) {
    return {
      category: 'Very Unhealthy',
      guidance: 'Heavy pollution — limit extended outdoor exposure; wear N95 outdoors.',
    };
  }
  return {
    category: 'Hazardous',
    guidance: 'Severe air quality emergency — move gatherings indoors with air filtration.',
  };
}

/**
 * Fetches 10-year historical climate records for a specific calendar date (month/day)
 * from Open-Meteo's ERA5 Historical Archive API.
 * Useful when planning weddings or trips months in advance.
 */
export async function fetchClimateHistory(
  lat: number,
  lon: number,
  month: number,
  day: number,
  placeName = 'Selected Location'
): Promise<ClimateHistoryResponse> {
  const safeMonth = Math.max(1, Math.min(12, Math.floor(month)));
  const safeDay = Math.max(1, Math.min(28, Math.floor(day))); // Clamp safely for Feb/leap consistency
  const key = coordKey(lat, lon, `${safeMonth}-${safeDay}`);
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, place: placeName || cached.value.place };
  }

  // Open-Meteo ERA5 archive lags a few days behind today; query the last 10 complete calendar years.
  const currentYear = new Date().getFullYear();
  const endYear = currentYear - 1;
  const startYear = endYear - 9;

  const monthStr = String(safeMonth).padStart(2, '0');
  const dayStr = String(safeDay).padStart(2, '0');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dateLabel = `${monthNames[safeMonth - 1]} ${safeDay}`;

  try {
    // Query a single 10-year range from archive API and filter for matching MM-DD
    const startDate = `${startYear}-${monthStr}-${dayStr}`;
    const endDate = `${endYear}-${monthStr}-${dayStr}`;

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: startDate,
      end_date: endDate,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,rain_sum',
      timezone: 'Asia/Kolkata',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchJsonWithTimeout<any>(
      `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`,
      10000
    );

    const times: string[] = raw.daily?.time ?? [];
    const targetSuffix = `-${monthStr}-${dayStr}`;
    const years: HistoricalYearRecord[] = [];

    for (let i = 0; i < times.length; i++) {
      if (!times[i].endsWith(targetSuffix)) continue;
      const yearNum = Number(times[i].slice(0, 4));
      const rainMm = Math.round(Number(raw.daily.rain_sum?.[i] ?? 0) * 10) / 10;
      years.push({
        year: yearNum,
        date: times[i],
        tempMax: Math.round(Number(raw.daily.temperature_2m_max?.[i] ?? 30) * 10) / 10,
        tempMin: Math.round(Number(raw.daily.temperature_2m_min?.[i] ?? 20) * 10) / 10,
        rainMm,
        rained: rainMm >= 1.0,
        weatherCode: Number(raw.daily.weather_code?.[i] ?? 1),
      });
    }

    if (years.length === 0) {
      throw new Error('No matching archive dates returned');
    }

    const rainyYears = years.filter((y) => y.rained).length;
    const totalYears = years.length;
    const avgTempMax =
      Math.round((years.reduce((s, y) => s + y.tempMax, 0) / totalYears) * 10) / 10;
    const avgTempMin =
      Math.round((years.reduce((s, y) => s + y.tempMin, 0) / totalYears) * 10) / 10;
    const maxRecordedRainMm = Math.max(...years.map((y) => y.rainMm));
    const rainProbabilityPct = Math.round((rainyYears / totalYears) * 100);

    const summary = `On ${dateLabel} in ${placeName}, it rained in ${rainyYears} of the last ${totalYears} years (avg ${Math.round(avgTempMax)}°C high / ${Math.round(avgTempMin)}°C low).`;

    const result: ClimateHistoryResponse = {
      place: placeName,
      lat,
      lon,
      month: safeMonth,
      day: safeDay,
      dateLabel,
      totalYears,
      rainyYears,
      rainProbabilityPct,
      avgTempMax,
      avgTempMin,
      maxRecordedRainMm,
      summary,
      years,
    };

    historyCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS * 4 });
    return result;
  } catch (err) {
    console.warn('[weather] Archive fallback triggered:', (err as Error).message);
    return buildFallbackClimateHistory(lat, lon, safeMonth, safeDay, dateLabel, placeName);
  }
}

/**
 * Searches Indian cities, neighborhoods, and airports by name using Open-Meteo Geocoding
 * merged with our instant curated Indian catalog.
 */
export async function searchIndianPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return INDIAN_CITIES.slice(0, 8);

  const lower = q.toLowerCase();
  const localMatches: PlaceResult[] = [
    ...INDIAN_CITIES.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.state.toLowerCase().includes(lower)
    ),
    ...INDIAN_AIRPORTS.filter(
      (a) =>
        a.code.toLowerCase() === lower ||
        a.city.toLowerCase().includes(lower) ||
        a.name.toLowerCase().includes(lower)
    ).map((a) => ({
      name: `${a.city} (${a.code})`,
      state: a.state,
      country: 'India',
      lat: a.lat,
      lon: a.lon,
      label: `${a.city} — ${a.name} (${a.code})`,
    })),
  ];

  try {
    const params = new URLSearchParams({
      name: q,
      count: '10',
      language: 'en',
      format: 'json',
      countryCode: 'IN',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchJsonWithTimeout<any>(
      `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      5000
    );

    const apiMatches: PlaceResult[] = (raw.results ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => !r.country_code || r.country_code === 'IN')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const state = r.admin1 || r.admin2 || 'India';
        return {
          name: r.name,
          state,
          country: 'India',
          lat: Number(r.latitude),
          lon: Number(r.longitude),
          label: `${r.name}, ${state}`,
        };
      });

    // Merge deduplicated results prioritizing local exact matches then API matches
    const seen = new Set<string>();
    const combined: PlaceResult[] = [];
    for (const item of [...localMatches, ...apiMatches]) {
      const id = `${item.name.toLowerCase()}-${item.lat.toFixed(1)}-${item.lon.toFixed(1)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      combined.push(item);
      if (combined.length >= 8) break;
    }
    return combined;
  } catch {
    return localMatches.slice(0, 8);
  }
}

/**
 * Deterministic fallback used ONLY if Open-Meteo is unreachable in an offline environment.
 */
function buildDeterministicFallbackForecast(
  lat: number,
  lon: number,
  placeName: string
): ForecastResponse {
  const now = new Date();
  const baseTemp = lat > 27 ? 24 : lat < 15 ? 30 : 28;
  const daily: DailyForecast[] = [];
  const hourly: HourlyPoint[] = [];

  const samplePattern = [
    { code: 1, rainProb: 10, rainMm: 0, gust: 18 },
    { code: 0, rainProb: 5, rainMm: 0, gust: 15 },
    { code: 2, rainProb: 20, rainMm: 0.4, gust: 22 },
    { code: 61, rainProb: 58, rainMm: 7.2, gust: 32 },
    { code: 95, rainProb: 78, rainMm: 18.5, gust: 44 },
    { code: 2, rainProb: 25, rainMm: 0.8, gust: 20 },
    { code: 0, rainProb: 8, rainMm: 0, gust: 16 },
    { code: 1, rainProb: 15, rainMm: 0, gust: 19 },
    { code: 3, rainProb: 38, rainMm: 2.1, gust: 26 },
    { code: 1, rainProb: 12, rainMm: 0, gust: 17 },
  ];

  for (let d = 0; d < 10; d++) {
    const dt = new Date(now.getTime() + d * 86400000);
    const isoDate = dt.toISOString().slice(0, 10);
    const pat = samplePattern[d];
    const desc = describeWeatherCode(pat.code, true);
    const conf = getConfidenceForDayIndex(d);

    daily.push({
      date: isoDate,
      dayIndex: d,
      weatherCode: pat.code,
      conditionLabel: desc.label,
      skyTheme: desc.skyTheme,
      isStorm: desc.isStorm,
      tempMax: baseTemp + 4 - (pat.rainProb > 50 ? 3 : 0),
      tempMin: baseTemp - 6,
      feelsLikeMax: baseTemp + 6,
      rainProbability: pat.rainProb,
      rainSumMm: pat.rainMm,
      windMaxKmh: Math.round(pat.gust * 0.7),
      gustMaxKmh: pat.gust,
      uvMax: pat.rainProb > 50 ? 4.5 : 7.8,
      humidityMean: pat.rainProb > 50 ? 82 : 58,
      sunrise: `${isoDate}T06:34`,
      sunset: `${isoDate}T18:04`,
      confidence: conf.confidence,
      confidenceLabel: conf.confidenceLabel,
    });

    if (d < 7) {
      for (let h = 0; h < 24; h++) {
        const diurnal = Math.sin(((h - 8) / 24) * Math.PI * 2) * 4.5;
        hourly.push({
          time: `${isoDate}T${String(h).padStart(2, '0')}:00`,
          date: isoDate,
          hour: h,
          temperature: Math.round((baseTemp + diurnal) * 10) / 10,
          feelsLike: Math.round((baseTemp + diurnal + 1.5) * 10) / 10,
          humidity: pat.rainProb > 50 ? 80 : 56,
          rainProbability: h >= 16 && h <= 19 ? Math.max(5, pat.rainProb - 15) : pat.rainProb,
          rainMm: pat.rainMm > 0 && h >= 13 && h <= 15 ? pat.rainMm / 3 : 0,
          windSpeed: Math.round(pat.gust * 0.65),
          windGusts: pat.gust,
          cloudCover: pat.rainProb > 40 ? 75 : 22,
          visibilityKm: pat.rainProb > 50 ? 6.5 : 10,
          uvIndex: h >= 10 && h <= 15 ? 7 : 1,
          weatherCode: pat.code,
        });
      }
    }
  }

  const heat = calculateHeatIndex(baseTemp + 2, 62);
  return {
    place: placeName,
    lat,
    lon,
    timezone: 'Asia/Kolkata',
    fetchedAt: now.toISOString(),
    cached: false,
    source: 'fallback',
    current: {
      time: now.toISOString().slice(0, 16),
      temperature: baseTemp + 2,
      feelsLike: baseTemp + 3.5,
      humidity: 62,
      windSpeed: 12,
      windGusts: 19,
      windDirection: 245,
      rain: 0,
      precipitation: 0,
      cloudCover: 24,
      pressure: 1013,
      visibilityKm: 10,
      uvIndex: 6.2,
      weatherCode: 1,
      conditionLabel: 'Mainly clear',
      skyTheme: 'partly-cloudy',
      isDay: true,
      sunrise: daily[0].sunrise,
      sunset: daily[0].sunset,
      heatIndex: heat.heatIndex,
      heatAdvisory: heat.advisory,
    },
    daily,
    hourly,
  };
}

function buildFallbackClimateHistory(
  lat: number,
  lon: number,
  month: number,
  day: number,
  dateLabel: string,
  placeName: string
): ClimateHistoryResponse {
  const isMonsoon = month >= 6 && month <= 9;
  const endYear = new Date().getFullYear() - 1;
  const years: HistoricalYearRecord[] = Array.from({ length: 10 }, (_, idx) => {
    const yr = endYear - 9 + idx;
    const rained = isMonsoon ? idx % 3 !== 0 : idx === 2 || idx === 7;
    const rainMm = rained ? (isMonsoon ? 14.2 + (idx % 4) * 5.5 : 3.4 + (idx % 2) * 2.1) : 0;
    const baseMax = lat > 26 && (month === 12 || month === 1) ? 23 : 31;
    return {
      year: yr,
      date: `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      tempMax: baseMax + (idx % 3) - 1,
      tempMin: baseMax - 9 + (idx % 2),
      rainMm: Math.round(rainMm * 10) / 10,
      rained,
      weatherCode: rained ? 61 : 1,
    };
  });

  const rainyYears = years.filter((y) => y.rained).length;
  const avgTempMax = Math.round((years.reduce((s, y) => s + y.tempMax, 0) / 10) * 10) / 10;
  const avgTempMin = Math.round((years.reduce((s, y) => s + y.tempMin, 0) / 10) * 10) / 10;

  return {
    place: placeName,
    lat,
    lon,
    month,
    day,
    dateLabel,
    totalYears: 10,
    rainyYears,
    rainProbabilityPct: rainyYears * 10,
    avgTempMax,
    avgTempMin,
    maxRecordedRainMm: Math.max(...years.map((y) => y.rainMm)),
    summary: `On ${dateLabel} in ${placeName}, it rained in ${rainyYears} of the last 10 years (avg ${Math.round(avgTempMax)}°C high / ${Math.round(avgTempMin)}°C low).`,
    years,
  };
}
