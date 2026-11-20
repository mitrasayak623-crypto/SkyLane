/**
 * Skyplan AI Planning Agent using `@google/genai` (Gemini) with Function Calling.
 *
 * Given a natural-language planning request like:
 *   "Wedding in Goa Dec 10-25, evenings, outdoors"
 * and a target Indian language code (e.g., "hi-IN", "ta-IN", "bn-IN"),
 * the agent invokes real meteorological tools:
 *   - get_forecast
 *   - score_days_for_event
 *   - get_climate_history
 *   - get_air_quality
 *   - compare_flight_airports
 * and replies strictly in the chosen language in simple everyday words.
 */

import { type Content, type FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import type {
  AgentRecommendResponse,
  AgentToolTrace,
  EventType,
  LanguageCode,
} from '../shared/types';
import {
  INDIAN_AIRPORTS,
  INDIAN_CITIES,
  SUPPORTED_LANGUAGES,
  scoreDayForEvent,
  summarizeEventPlan,
} from './scoring';
import {
  fetchAirQuality,
  fetchClimateHistory,
  fetchForecast,
  searchIndianPlaces,
} from './weather';

const MODEL_NAME = 'gemini-4-hydrogen';

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY to your environment or Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_forecast',
    description:
      'Fetch current weather and 10-day daily forecast for any Indian city, area, or town.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        place: {
          type: Type.STRING,
          description: 'City or area in India, e.g., "Goa", "Jaipur", "Mumbai", "Shimla".',
        },
      },
      required: ['place'],
    },
  },
  {
    name: 'score_days_for_event',
    description:
      'Score each of the next 10 days (0-100) for an event type (wedding, flight, meeting, or trip), including best dates, days to avoid, best hourly time window, and Plan B rule.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        place: {
          type: Type.STRING,
          description: 'Indian city or location name.',
        },
        event_type: {
          type: Type.STRING,
          description: 'One of: wedding, flight, meeting, trip.',
        },
      },
      required: ['place', 'event_type'],
    },
  },
  {
    name: 'get_climate_history',
    description:
      'Fetch 10-year historical rainfall and temperature records for a specific calendar month and day in an Indian city. Essential when planning dates more than 10 days in the future.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        place: {
          type: Type.STRING,
          description: 'Indian city or location name.',
        },
        month: {
          type: Type.INTEGER,
          description: 'Calendar month number 1-12 (e.g., 12 for December).',
        },
        day: {
          type: Type.INTEGER,
          description: 'Calendar day of month 1-28.',
        },
      },
      required: ['place', 'month', 'day'],
    },
  },
  {
    name: 'get_air_quality',
    description:
      'Fetch current Air Quality Index (US AQI), PM2.5, PM10, and health advisory for an Indian city.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        place: {
          type: Type.STRING,
          description: 'Indian city or location name, e.g., "New Delhi", "Mumbai".',
        },
      },
      required: ['place'],
    },
  },
  {
    name: 'compare_flight_airports',
    description:
      'Check live weather, visibility, wind gusts, and flight readiness at both origin and destination Indian airports.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        origin_code: {
          type: Type.STRING,
          description: '3-letter IATA code such as DEL, BOM, BLR, GOI, HYD, MAA, CCU, JAI.',
        },
        destination_code: {
          type: Type.STRING,
          description: '3-letter IATA code such as GOI, BOM, DEL, BLR, COK.',
        },
      },
      required: ['origin_code', 'destination_code'],
    },
  },
];

async function resolveIndianPlace(placeQuery: string): Promise<{
  name: string;
  lat: number;
  lon: number;
}> {
  const results = await searchIndianPlaces(placeQuery);
  if (results.length > 0) {
    return { name: results[0].label, lat: results[0].lat, lon: results[0].lon };
  }
  const fallback = INDIAN_CITIES[0];
  return { name: fallback.label, lat: fallback.lat, lon: fallback.lon };
}

function normalizeEventType(raw: unknown): EventType {
  const val = String(raw ?? '').toLowerCase();
  if (val.includes('wed')) return 'wedding';
  if (val.includes('fli') || val.includes('air')) return 'flight';
  if (val.includes('meet') || val.includes('conf') || val.includes('work')) return 'meeting';
  return 'trip';
}

async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  context: { defaultPlace?: string; defaultLat?: number; defaultLon?: number }
): Promise<{
  result: Record<string, unknown>;
  detectedPlace?: string;
  detectedEventType?: EventType;
}> {
  if (name === 'get_forecast') {
    const placeName = String(args.place || context.defaultPlace || 'Mumbai');
    const loc = await resolveIndianPlace(placeName);
    const forecast = await fetchForecast(loc.lat, loc.lon, loc.name);
    return {
      detectedPlace: loc.name,
      result: {
        place: forecast.place,
        current: {
          temperature_c: forecast.current.temperature,
          feels_like_c: forecast.current.feelsLike,
          condition: forecast.current.conditionLabel,
          humidity_pct: forecast.current.humidity,
          wind_kmh: forecast.current.windSpeed,
          gusts_kmh: forecast.current.windGusts,
          uv_index: forecast.current.uvIndex,
          heat_index_c: forecast.current.heatIndex,
        },
        next_10_days: forecast.daily.map((d) => ({
          date: d.date,
          condition: d.conditionLabel,
          high_c: d.tempMax,
          low_c: d.tempMin,
          rain_chance_pct: d.rainProbability,
          rain_mm: d.rainSumMm,
          gust_kmh: d.gustMaxKmh,
          confidence: d.confidence,
        })),
      },
    };
  }

  if (name === 'score_days_for_event') {
    const placeName = String(args.place || context.defaultPlace || 'Mumbai');
    const eventType = normalizeEventType(args.event_type);
    const loc = await resolveIndianPlace(placeName);
    const [forecast, aq] = await Promise.all([
      fetchForecast(loc.lat, loc.lon, loc.name),
      fetchAirQuality(loc.lat, loc.lon),
    ]);
    const plan = summarizeEventPlan(forecast.daily, forecast.hourly, eventType, aq.usAqi);
    return {
      detectedPlace: loc.name,
      detectedEventType: eventType,
      result: {
        place: loc.name,
        event_type: eventType,
        headline: plan.headline,
        plan_b_rule: plan.planBRule,
        best_days: plan.bestDays.map((d) => ({
          date: d.date,
          score: d.score,
          verdict: d.verdict,
          confidence: d.confidence,
          reasons: d.reasons,
          best_time_window: d.bestWindow?.label ?? 'Afternoon/Evening',
          window_reason: d.bestWindow?.reason ?? '',
        })),
        avoid_days: plan.avoidDays.map((d) => ({
          date: d.date,
          score: d.score,
          reasons: d.reasons,
        })),
      },
    };
  }

  if (name === 'get_climate_history') {
    const placeName = String(args.place || context.defaultPlace || 'Goa');
    const month = Number(args.month || 12);
    const day = Number(args.day || 15);
    const loc = await resolveIndianPlace(placeName);
    const hist = await fetchClimateHistory(loc.lat, loc.lon, month, day, loc.name);
    return {
      detectedPlace: loc.name,
      result: {
        place: hist.place,
        date_checked: hist.dateLabel,
        rained_years: hist.rainyYears,
        total_years: hist.totalYears,
        rain_probability_pct: hist.rainProbabilityPct,
        avg_high_c: hist.avgTempMax,
        avg_low_c: hist.avgTempMin,
        summary: hist.summary,
      },
    };
  }

  if (name === 'get_air_quality') {
    const placeName = String(args.place || context.defaultPlace || 'New Delhi');
    const loc = await resolveIndianPlace(placeName);
    const aq = await fetchAirQuality(loc.lat, loc.lon);
    return {
      detectedPlace: loc.name,
      result: {
        place: loc.name,
        us_aqi: aq.usAqi,
        category: aq.category,
        pm25: aq.pm25,
        pm10: aq.pm10,
        guidance: aq.guidance,
      },
    };
  }

  if (name === 'compare_flight_airports') {
    const origCode = String(args.origin_code || 'DEL').toUpperCase();
    const destCode = String(args.destination_code || 'BOM').toUpperCase();
    const orig = INDIAN_AIRPORTS.find((a) => a.code === origCode) ?? INDIAN_AIRPORTS[0];
    const dest = INDIAN_AIRPORTS.find((a) => a.code === destCode) ?? INDIAN_AIRPORTS[1];
    const [f1, f2] = await Promise.all([
      fetchForecast(orig.lat, orig.lon, orig.city),
      fetchForecast(dest.lat, dest.lon, dest.city),
    ]);
    const s1 = scoreDayForEvent(f1.daily[0], 'flight');
    const s2 = scoreDayForEvent(f2.daily[0], 'flight');
    return {
      detectedEventType: 'flight',
      result: {
        origin: {
          code: orig.code,
          city: orig.city,
          condition: f1.current.conditionLabel,
          visibility_km: f1.current.visibilityKm,
          gusts_kmh: f1.current.windGusts,
          flight_score: s1.score,
        },
        destination: {
          code: dest.code,
          city: dest.city,
          condition: f2.current.conditionLabel,
          visibility_km: f2.current.visibilityKm,
          gusts_kmh: f2.current.windGusts,
          flight_score: s2.score,
        },
      },
    };
  }

  return { result: { error: `Unknown tool: ${name}` } };
}

/**
 * Main entry point for `/api/recommend`.
 * Executes a multi-turn Gemini tool-calling loop and returns a clean,
 * spoken-friendly explanation strictly in the requested Indian language.
 */
export async function runPlanningAgent(input: {
  query: string;
  language: LanguageCode;
  currentPlace?: string;
  currentLat?: number;
  currentLon?: number;
  eventType?: EventType;
}): Promise<AgentRecommendResponse> {
  const ai = createGeminiClient();
  const langOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === input.language) ?? SUPPORTED_LANGUAGES[0];

  const todayIso = new Date().toISOString().slice(0, 10);
  const systemInstruction = [
    `You are Skyplan, a warm, practical Indian weather and event-date planning advisor.`,
    `Today's date is ${todayIso}. The user's currently viewed city is ${input.currentPlace || 'Mumbai'} (default event type: ${input.eventType || 'wedding'}).`,
    `ALWAYS call the available tools to gather real forecast, suitability scores, 10-year climate history (especially for dates more than 10 days ahead), or air quality before answering.`,
    `CRITICAL LANGUAGE RULE: Reply ONLY in ${langOption.englishName} (${langOption.nativeName}, BCP-47 ${langOption.code}). Do not mix English paragraphs unless the requested language is English.`,
    `STYLE RULE: Write in simple, everyday spoken words suitable for reading aloud via voice synthesis. Avoid markdown tables, asterisks, or technical jargon. Structure your reply cleanly with: (1) Best date(s) and time window, (2) Why those dates work and any dates to avoid, (3) 10-year climate note if planning far ahead, and (4) A clear Plan B rule.`,
  ].join('\n');

  const contents: Content[] = [
    {
      role: 'user',
      parts: [{ text: input.query.trim() }],
    },
  ];

  const toolsUsed: AgentToolTrace[] = [];
  let detectedPlace: string | undefined;
  let detectedEventType: EventType | undefined;

  for (let turn = 0; turn < 4; turn++) {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const modelContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      const reply = (response.text ?? '').trim();
      if (!reply) {
        throw new Error('The AI planning agent returned an empty response.');
      }
      return {
        reply,
        language: langOption.code,
        languageName: langOption.nativeName,
        toolsUsed,
        detectedPlace,
        detectedEventType,
      };
    }

    if (modelContent) {
      contents.push(modelContent);
    }

    const responseParts = [];
    for (const call of functionCalls) {
      const callName = call.name ?? '';
      const callArgs = (call.args ?? {}) as Record<string, unknown>;
      toolsUsed.push({ tool: callName, args: callArgs });

      const executed = await executeAgentTool(callName, callArgs, {
        defaultPlace: input.currentPlace,
        defaultLat: input.currentLat,
        defaultLon: input.currentLon,
      });

      if (executed.detectedPlace) detectedPlace = executed.detectedPlace;
      if (executed.detectedEventType) detectedEventType = executed.detectedEventType;

      responseParts.push({
        functionResponse: {
          id: call.id,
          name: callName,
          response: executed.result,
        },
      });
    }

    contents.push({
      role: 'user',
      parts: responseParts,
    });
  }

  // Final wrap-up call if all 4 tool rounds were used
  const finalResponse = await ai.models.generateContent({
    model: MODEL_NAME,
    contents,
    config: { systemInstruction },
  });

  return {
    reply: (finalResponse.text ?? '').trim(),
    language: langOption.code,
    languageName: langOption.nativeName,
    toolsUsed,
    detectedPlace,
    detectedEventType,
  };
}
