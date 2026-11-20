/**
 * Pure meteorological & event-suitability scoring rules for Skyplan.
 *
 * Keeping all scoring math, confidence tiers, hourly window selection, Plan B rules,
 * heat index math, and sudden-change alert detection in this pure module lets us
 * unit-test every rule deterministically with `node:test`.
 */

import type {
  ConfidenceLevel,
  DailyForecast,
  DaySuitability,
  EventPlanSummary,
  EventType,
  HourlyPoint,
  HourlyWindow,
  IndianAirport,
  LanguageOption,
  PlaceResult,
  SkyTheme,
} from '../shared/types';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-IN', name: 'English', nativeName: 'English', englishName: 'English' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', englishName: 'Tamil' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', englishName: 'Telugu' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', englishName: 'Bengali' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', englishName: 'Malayalam' },
  { code: 'or-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', englishName: 'Odia' },
];

export const INDIAN_CITIES: PlaceResult[] = [
  { name: 'Mumbai', state: 'Maharashtra', country: 'India', lat: 19.076, lon: 72.8777, label: 'Mumbai, Maharashtra' },
  { name: 'New Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209, label: 'New Delhi, Delhi' },
  { name: 'Bengaluru', state: 'Karnataka', country: 'India', lat: 12.9716, lon: 77.5946, label: 'Bengaluru, Karnataka' },
  { name: 'Goa (Panaji)', state: 'Goa', country: 'India', lat: 15.4909, lon: 73.8278, label: 'Goa (Panaji), Goa' },
  { name: 'Jaipur', state: 'Rajasthan', country: 'India', lat: 26.9124, lon: 75.7873, label: 'Jaipur, Rajasthan' },
  { name: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lon: 80.2707, label: 'Chennai, Tamil Nadu' },
  { name: 'Hyderabad', state: 'Telangana', country: 'India', lat: 17.385, lon: 78.4867, label: 'Hyderabad, Telangana' },
  { name: 'Kolkata', state: 'West Bengal', country: 'India', lat: 22.5726, lon: 88.3639, label: 'Kolkata, West Bengal' },
  { name: 'Pune', state: 'Maharashtra', country: 'India', lat: 18.5204, lon: 73.8567, label: 'Pune, Maharashtra' },
  { name: 'Udaipur', state: 'Rajasthan', country: 'India', lat: 24.5854, lon: 73.7125, label: 'Udaipur, Rajasthan' },
  { name: 'Kochi', state: 'Kerala', country: 'India', lat: 9.9312, lon: 76.2673, label: 'Kochi, Kerala' },
  { name: 'Ahmedabad', state: 'Gujarat', country: 'India', lat: 23.0225, lon: 72.5714, label: 'Ahmedabad, Gujarat' },
  { name: 'Chandigarh', state: 'Chandigarh', country: 'India', lat: 30.7333, lon: 76.7794, label: 'Chandigarh, Punjab & Haryana' },
  { name: 'Bhubaneswar', state: 'Odisha', country: 'India', lat: 20.2961, lon: 85.8245, label: 'Bhubaneswar, Odisha' },
  { name: 'Shimla', state: 'Himachal Pradesh', country: 'India', lat: 31.1048, lon: 77.1734, label: 'Shimla, Himachal Pradesh' },
  { name: 'Varanasi', state: 'Uttar Pradesh', country: 'India', lat: 25.3176, lon: 82.9739, label: 'Varanasi, Uttar Pradesh' },
];

export const INDIAN_AIRPORTS: IndianAirport[] = [
  { code: 'DEL', name: 'Indira Gandhi Intl', city: 'New Delhi', state: 'Delhi', lat: 28.5562, lon: 77.1 },
  { code: 'BOM', name: 'Chhatrapati Shivaji Intl', city: 'Mumbai', state: 'Maharashtra', lat: 19.0896, lon: 72.8656 },
  { code: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', state: 'Karnataka', lat: 13.1986, lon: 77.7066 },
  { code: 'GOI', name: 'Goa Dabolim Intl', city: 'Goa', state: 'Goa', lat: 15.3808, lon: 73.8314 },
  { code: 'HYD', name: 'Rajiv Gandhi Intl', city: 'Hyderabad', state: 'Telangana', lat: 17.2403, lon: 78.4294 },
  { code: 'MAA', name: 'Chennai Intl', city: 'Chennai', state: 'Tamil Nadu', lat: 12.9941, lon: 80.1709 },
  { code: 'CCU', name: 'Netaji Subhas Chandra Bose Intl', city: 'Kolkata', state: 'West Bengal', lat: 22.6547, lon: 88.4467 },
  { code: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', state: 'Rajasthan', lat: 26.8242, lon: 75.8122 },
  { code: 'COK', name: 'Cochin Intl', city: 'Kochi', state: 'Kerala', lat: 10.152, lon: 76.4019 },
  { code: 'AMD', name: 'Sardar Vallabhbhai Patel Intl', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0772, lon: 72.6347 },
  { code: 'PNQ', name: 'Pune Airport', city: 'Pune', state: 'Maharashtra', lat: 18.5822, lon: 73.9197 },
  { code: 'IXC', name: 'Shaheed Bhagat Singh Intl', city: 'Chandigarh', state: 'Chandigarh', lat: 30.6735, lon: 76.7885 },
];

/**
 * Translates WMO weather codes returned by Open-Meteo into human-readable
 * descriptions, sky animation themes, and storm flags.
 */
export function describeWeatherCode(
  code: number,
  isDay = true
): { label: string; skyTheme: SkyTheme; isStorm: boolean } {
  if (code === 0) {
    return { label: isDay ? 'Clear sky' : 'Clear night', skyTheme: isDay ? 'clear-day' : 'clear-night', isStorm: false };
  }
  if (code === 1 || code === 2) {
    return { label: code === 1 ? 'Mainly clear' : 'Partly cloudy', skyTheme: 'partly-cloudy', isStorm: false };
  }
  if (code === 3) {
    return { label: 'Overcast clouds', skyTheme: 'cloudy', isStorm: false };
  }
  if (code === 45 || code === 48) {
    return { label: code === 48 ? 'Rime fog' : 'Misty fog', skyTheme: 'fog', isStorm: false };
  }
  if (code >= 51 && code <= 57) {
    return { label: code >= 55 ? 'Steady drizzle' : 'Light drizzle', skyTheme: 'rain', isStorm: false };
  }
  if (code >= 61 && code <= 67) {
    if (code >= 65) return { label: 'Heavy monsoon rain', skyTheme: 'rain', isStorm: true };
    return { label: code === 63 ? 'Moderate rain' : 'Light rain', skyTheme: 'rain', isStorm: false };
  }
  if (code >= 71 && code <= 77) {
    return { label: 'Snow showers', skyTheme: 'cloudy', isStorm: false };
  }
  if (code >= 80 && code <= 82) {
    if (code === 82) return { label: 'Violent rain showers', skyTheme: 'storm', isStorm: true };
    return { label: code === 81 ? 'Rain showers' : 'Passing showers', skyTheme: 'rain', isStorm: false };
  }
  if (code >= 95) {
    return {
      label: code >= 96 ? 'Thunderstorm with hail' : 'Thunderstorm',
      skyTheme: 'storm',
      isStorm: true,
    };
  }
  return { label: 'Partly cloudy', skyTheme: 'partly-cloudy', isStorm: false };
}

/**
 * Forecast confidence tiers specified for Skyplan:
 * Days 1-5 (index 0..4) -> High
 * Days 6-7 (index 5..6) -> Medium
 * Days 8-10 (index 7..9) -> Low
 */
export function getConfidenceForDayIndex(dayIndex: number): {
  confidence: ConfidenceLevel;
  confidenceLabel: string;
} {
  if (dayIndex <= 4) {
    return { confidence: 'high', confidenceLabel: 'High confidence' };
  }
  if (dayIndex <= 6) {
    return { confidence: 'medium', confidenceLabel: 'Medium confidence' };
  }
  return { confidence: 'low', confidenceLabel: 'Low confidence' };
}

/**
 * Computes Heat Index in Celsius (Rothfusz regression when warm & humid).
 * Especially relevant for humid Indian summers and coastal metros.
 */
export function calculateHeatIndex(tempC: number, humidityPct: number): {
  heatIndex: number;
  advisory: string;
} {
  if (tempC < 26.5 || humidityPct < 40) {
    return {
      heatIndex: Math.round(tempC * 10) / 10,
      advisory: tempC >= 24 ? 'Comfortable warmth' : 'Pleasant air',
    };
  }
  const tF = (tempC * 9) / 5 + 32;
  const r = humidityPct;
  const hiF =
    -42.379 +
    2.04901523 * tF +
    10.14333127 * r -
    0.22475541 * tF * r -
    0.00683783 * tF * tF -
    0.05481717 * r * r +
    0.00122874 * tF * tF * r +
    0.00085282 * tF * r * r -
    0.00000199 * tF * tF * r * r;
  const hiC = Math.round((((hiF - 32) * 5) / 9) * 10) / 10;

  let advisory = 'Mild heat stress';
  if (hiC >= 41) advisory = 'Extreme heat caution — avoid midday outdoors';
  else if (hiC >= 36) advisory = 'High heat index — hydrate & prefer shade';
  else if (hiC >= 32) advisory = 'Warm & muggy afternoon';

  return { heatIndex: Math.max(hiC, tempC), advisory };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Scores a single forecast day (0-100) with event-specific meteorological weights:
 * - Outdoor Wedding: heavily penalizes rain, high gusts, extreme heat/humidity, and poor AQI
 * - Flight: heavily penalizes thunderstorms, high wind gusts, fog/low visibility, heavy rain
 * - Meeting: resilient to mild wind/heat, penalizes torrential rain/storms that disrupt commute
 * - Sightseeing Trip: rewards comfortable daytime temperatures, low rain, moderate UV, good air
 */
export function scoreDayForEvent(
  day: DailyForecast,
  eventType: EventType,
  aqi?: number
): Omit<DaySuitability, 'bestWindow'> {
  let score = 100;
  const reasons: string[] = [];

  if (eventType === 'wedding') {
    // Rain is the #1 wedding breaker
    const rainPenalty = day.rainProbability * 0.62 + Math.min(28, day.rainSumMm * 2.4);
    score -= rainPenalty;
    if (day.rainProbability >= 45 || day.rainSumMm >= 5) {
      reasons.push(`High rain risk (${day.rainProbability}% chance, ${day.rainSumMm.toFixed(1)} mm)`);
    }
    if (day.isStorm) {
      score -= 22;
      reasons.push('Thunderstorm risk for outdoor decor & lighting');
    }
    // Gusts knock down mandaps/canopies
    if (day.gustMaxKmh > 30) {
      score -= Math.min(20, (day.gustMaxKmh - 30) * 0.7);
      reasons.push(`Strong wind gusts up to ${Math.round(day.gustMaxKmh)} km/h`);
    }
    // Heat & mugginess for guests in wedding attire
    if (day.tempMax > 36) {
      score -= Math.min(18, (day.tempMax - 36) * 2.5);
      reasons.push(`Hot daytime peak of ${Math.round(day.tempMax)}°C`);
    } else if (day.tempMin < 10) {
      score -= Math.min(12, (10 - day.tempMin) * 1.5);
      reasons.push(`Chilly evening low of ${Math.round(day.tempMin)}°C`);
    }
    if (day.humidityMean > 80) {
      score -= 8;
      reasons.push(`Sticky humidity (${Math.round(day.humidityMean)}%)`);
    }
    if (aqi && aqi > 180) {
      score -= 10;
      reasons.push(`Poor air quality (AQI ${aqi})`);
    }
  } else if (eventType === 'flight') {
    // Storms, wind gusts, and fog drive Indian flight delays
    if (day.isStorm) {
      score -= 42;
      reasons.push('Convective storm risk may cause holding/diversions');
    }
    if (day.weatherCode === 45 || day.weatherCode === 48) {
      score -= 32;
      reasons.push('Dense fog risk — low runway visibility');
    }
    if (day.gustMaxKmh > 35) {
      score -= Math.min(28, (day.gustMaxKmh - 35) * 0.9);
      reasons.push(`Crosswind gusts up to ${Math.round(day.gustMaxKmh)} km/h`);
    }
    if (day.rainSumMm > 10) {
      score -= Math.min(20, (day.rainSumMm - 10) * 0.8);
      reasons.push(`Heavy rain (${day.rainSumMm.toFixed(1)} mm) slows airport ops`);
    } else if (day.rainProbability > 60) {
      score -= 10;
      reasons.push(`Frequent wet runway showers (${day.rainProbability}%)`);
    }
  } else if (eventType === 'meeting') {
    // Commute disruptions (heavy rain, storms, extreme heatwave, severe AQI)
    if (day.isStorm) {
      score -= 26;
      reasons.push('Stormy commute & traffic slowdown expected');
    }
    if (day.rainSumMm > 15) {
      score -= Math.min(24, (day.rainSumMm - 15) * 0.9);
      reasons.push(`Waterlogging risk from ${day.rainSumMm.toFixed(1)} mm rainfall`);
    } else if (day.rainProbability > 55) {
      score -= 12;
      reasons.push(`Rain showers (${day.rainProbability}%) may delay travel`);
    }
    if (day.tempMax > 41) {
      score -= 14;
      reasons.push(`Severe heat (${Math.round(day.tempMax)}°C) during transit`);
    }
    if (aqi && aqi > 220) {
      score -= 10;
      reasons.push(`Hazardous haze (AQI ${aqi}) impacts outdoor transit`);
    }
  } else {
    // Sightseeing trip: comfort, dry skies, decent UV and air
    const rainPenalty = day.rainProbability * 0.45 + Math.min(24, day.rainSumMm * 1.8);
    score -= rainPenalty;
    if (day.rainProbability >= 50) {
      reasons.push(`Rain likely (${day.rainProbability}%) during outdoor exploration`);
    }
    if (day.isStorm) {
      score -= 22;
      reasons.push('Thunderstorms limit outdoor sightseeing');
    }
    if (day.tempMax > 37) {
      score -= Math.min(22, (day.tempMax - 37) * 2.8);
      reasons.push(`Intense afternoon heat (${Math.round(day.tempMax)}°C)`);
    }
    if (day.uvMax >= 9) {
      score -= 7;
      reasons.push(`Very high UV index (${day.uvMax.toFixed(1)})`);
    }
    if (day.gustMaxKmh > 40) {
      score -= 10;
      reasons.push(`Breezy gusts (${Math.round(day.gustMaxKmh)} km/h)`);
    }
    if (aqi && aqi > 175) {
      score -= 12;
      reasons.push(`Hazy views & poor air (AQI ${aqi})`);
    }
  }

  const finalScore = clamp(score, 5, 99);
  const tone: 'green' | 'yellow' | 'red' =
    finalScore >= 75 ? 'green' : finalScore >= 50 ? 'yellow' : 'red';
  const verdict: 'Ideal' | 'Fair' | 'Avoid' =
    finalScore >= 75 ? 'Ideal' : finalScore >= 50 ? 'Fair' : 'Avoid';

  if (reasons.length === 0) {
    if (eventType === 'wedding') reasons.push('Dry skies, gentle breeze, and comfortable guest temperatures');
    else if (eventType === 'flight') reasons.push('Clear visibility, steady winds, and smooth aviation outlook');
    else if (eventType === 'meeting') reasons.push('Smooth commute conditions with minimal weather disruption');
    else reasons.push('Pleasant temperatures and clear skies for exploring');
  }

  return {
    date: day.date,
    score: finalScore,
    tone,
    verdict,
    confidence: day.confidence,
    reasons,
  };
}

function formatHour12(hour24: number): string {
  const normalized = ((hour24 % 24) + 24) % 24;
  if (normalized === 0) return '12 AM';
  if (normalized === 12) return '12 PM';
  return normalized < 12 ? `${normalized} AM` : `${normalized - 12} PM`;
}

/**
 * Evaluates hourly data for a target date to find the best 3-hour window
 * and produces a clear, actionable Plan B trigger rule.
 */
export function findBestTimeWindow(
  hourly: HourlyPoint[],
  dateStr: string,
  eventType: EventType
): HourlyWindow | null {
  const dayHours = hourly.filter((h) => h.date === dateStr);
  if (dayHours.length < 3) return null;

  // Preferred active hours by event type (e.g., weddings favor afternoon/evening; flights all day)
  const minHour = eventType === 'flight' ? 5 : eventType === 'wedding' ? 10 : 7;
  const maxHour = eventType === 'flight' ? 23 : eventType === 'wedding' ? 22 : 20;

  let best: HourlyWindow | null = null;

  for (let i = 0; i <= dayHours.length - 3; i++) {
    const slice = dayHours.slice(i, i + 3);
    const startH = slice[0].hour;
    const endH = slice[slice.length - 1].hour + 1;
    if (startH < minHour || startH > maxHour - 2) continue;

    const avgTemp = slice.reduce((acc, h) => acc + h.temperature, 0) / slice.length;
    const maxRainProb = Math.max(...slice.map((h) => h.rainProbability));
    const maxWind = Math.max(...slice.map((h) => h.windGusts || h.windSpeed));
    const avgUv = slice.reduce((acc, h) => acc + h.uvIndex, 0) / slice.length;

    let windowScore = 92 - maxRainProb * 0.7;
    if (eventType === 'wedding') {
      // Golden hour & evening bonus (4 PM - 9 PM), penalize midday heat/UV
      if (startH >= 16 && startH <= 19) windowScore += 7;
      if (avgTemp > 29) windowScore -= (avgTemp - 29) * 2.2;
      if (avgUv > 4) windowScore -= (avgUv - 4) * 1.6;
      if (maxWind > 28) windowScore -= (maxWind - 28) * 0.8;
    } else if (eventType === 'flight') {
      windowScore = 99 - maxRainProb * 0.5;
      const minVis = Math.min(...slice.map((h) => h.visibilityKm));
      if (minVis < 3) windowScore -= 30;
      if (maxWind > 35) windowScore -= (maxWind - 35) * 1.1;
    } else if (eventType === 'trip') {
      if (startH >= 7 && startH <= 10 || startH >= 15 && startH <= 18) windowScore += 5;
      if (avgTemp > 33) windowScore -= (avgTemp - 33) * 2.8;
      if (avgUv > 7) windowScore -= 10;
    } else {
      if (startH >= 9 && startH <= 17) windowScore += 6;
    }

    const clampedScore = clamp(windowScore, 10, 99);
    if (!best || clampedScore > best.score) {
      const planB = buildPlanBRule(eventType, maxRainProb, maxWind, avgTemp);
      const reason =
        maxRainProb <= 20
          ? `Dry window (${maxRainProb}% max rain chance) around ${Math.round(avgTemp)}°C`
          : `Lowest rain dip (${maxRainProb}% chance) with ${Math.round(maxWind)} km/h gusts`;

      best = {
        date: dateStr,
        startHour: startH,
        endHour: endH,
        label: `${formatHour12(startH)} – ${formatHour12(endH)}`,
        score: clampedScore,
        avgTemp: Math.round(avgTemp),
        maxRainProb: Math.round(maxRainProb),
        maxWindKmh: Math.round(maxWind),
        reason,
        planB,
      };
    }
  }

  return best;
}

export function buildPlanBRule(
  eventType: EventType,
  rainProb: number,
  windKmh: number,
  tempC: number
): string {
  if (eventType === 'wedding') {
    if (rainProb >= 35) {
      return 'Keep a waterproof shamiana or indoor hall on standby; shift indoors if rain chance stays above 40% within 48 hours.';
    }
    if (windKmh >= 30) {
      return 'Anchor stage trusses and floral arches for gusts; move dining indoors if winds cross 35 km/h.';
    }
    return 'Move ceremonies indoors if rain chance crosses 40% within 48 hours of the pheras.';
  }
  if (eventType === 'flight') {
    return 'Pick an earlier morning departure or keep a 2-hour buffer if gusts exceed 40 km/h or thunderstorm alerts appear 24 hours prior.';
  }
  if (eventType === 'meeting') {
    return 'Switch to a video call or leave 45 minutes early if rainfall crosses 10 mm during peak commute hours.';
  }
  if (tempC >= 35) {
    return 'Schedule indoor museums/cafes between 12 PM – 3 PM and save outdoor walks for sunrise or after 4:30 PM.';
  }
  return 'Swap outdoor spots for covered heritage sites if rain chance climbs above 45% the evening before.';
}

/**
 * Produces the complete 10-day event suitability summary including
 * best 1-2 days, days to avoid, and headline guidance.
 */
export function summarizeEventPlan(
  daily: DailyForecast[],
  hourly: HourlyPoint[],
  eventType: EventType,
  aqi?: number
): EventPlanSummary {
  const scored: DaySuitability[] = daily.map((day, idx) => {
    const base = scoreDayForEvent(day, eventType, idx === 0 ? aqi : undefined);
    const bestWindow = findBestTimeWindow(hourly, day.date, eventType);
    return {
      ...base,
      bestWindow,
    };
  });

  const sortedBest = [...scored].sort((a, b) => {
    // Slightly prefer higher-confidence days on ties
    const confBonusA = a.confidence === 'high' ? 3 : a.confidence === 'medium' ? 1 : 0;
    const confBonusB = b.confidence === 'high' ? 3 : b.confidence === 'medium' ? 1 : 0;
    return b.score + confBonusB - (a.score + confBonusA);
  });

  const bestDays = sortedBest.slice(0, 2);
  const avoidDays = scored.filter((d) => d.score < 55).sort((a, b) => a.score - b.score).slice(0, 3);

  const eventLabel: Record<EventType, string> = {
    wedding: 'outdoor wedding',
    flight: 'flight travel',
    meeting: 'business meeting',
    trip: 'sightseeing trip',
  };

  const topDay = bestDays[0];
  const secondDay = bestDays[1];
  const headline = topDay
    ? `Best dates for your ${eventLabel[eventType]}: ${formatShortDate(topDay.date)} (${topDay.score}/100)${
        secondDay ? ` and ${formatShortDate(secondDay.date)} (${secondDay.score}/100)` : ''
      }.${
        avoidDays.length > 0
          ? ` Avoid ${avoidDays.map((d) => formatShortDate(d.date)).join(', ')} due to weather risk.`
          : ' No severe washout days detected in this 10-day window.'
      }`
    : 'Forecast data unavailable.';

  const planBRule =
    topDay?.bestWindow?.planB ??
    buildPlanBRule(eventType, daily[0]?.rainProbability ?? 20, daily[0]?.gustMaxKmh ?? 18, daily[0]?.tempMax ?? 30);

  return {
    eventType,
    bestDays,
    avoidDays,
    days: scored,
    headline,
    planBRule,
  };
}

export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Compares a previously saved forecast snapshot with a fresh forecast for an event date.
 * Flags an alert if:
 * 1) Rain probability jumps/changes by more than 30 percentage points, OR
 * 2) A storm newly appears on that target date.
 */
export function detectSuddenForecastChange(
  previousDaily: DailyForecast[],
  latestDaily: DailyForecast[],
  targetDate: string
): {
  changed: boolean;
  severity: 'warning' | 'critical';
  rainDelta: number;
  newStorm: boolean;
  summary: string;
} {
  const prev = previousDaily.find((d) => d.date === targetDate) ?? previousDaily[0];
  const next = latestDaily.find((d) => d.date === targetDate) ?? latestDaily[0];

  if (!prev || !next) {
    return { changed: false, severity: 'warning', rainDelta: 0, newStorm: false, summary: '' };
  }

  const rainDelta = Math.round(next.rainProbability - prev.rainProbability);
  const absRainSwing = Math.abs(rainDelta);
  const newStorm = !prev.isStorm && next.isStorm;

  if (absRainSwing > 30 || newStorm) {
    const parts: string[] = [];
    if (newStorm) {
      parts.push(`a ${next.conditionLabel.toLowerCase()} newly appeared`);
    }
    if (absRainSwing > 30) {
      const dir = rainDelta > 0 ? `jumped by +${rainDelta}%` : `dropped by ${rainDelta}%`;
      parts.push(`rain chance ${dir} (now ${next.rainProbability}%)`);
    }
    const summary = `Sudden forecast change for ${formatShortDate(next.date)}: ${parts.join(' and ')}.`;
    return {
      changed: true,
      severity: newStorm || rainDelta > 30 ? 'critical' : 'warning',
      rainDelta,
      newStorm,
      summary,
    };
  }

  return { changed: false, severity: 'warning', rainDelta, newStorm: false, summary: '' };
}
