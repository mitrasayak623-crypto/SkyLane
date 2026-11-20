/**
 * Shared TypeScript types used by both the Express backend and React frontend.
 * Keeping types in one shared file guarantees API responses match UI props.
 */

export type EventType = 'wedding' | 'flight' | 'meeting' | 'trip';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type SkyTheme =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'storm';

export type LanguageCode =
  | 'en-IN'
  | 'hi-IN'
  | 'ta-IN'
  | 'kn-IN'
  | 'te-IN'
  | 'bn-IN'
  | 'mr-IN'
  | 'gu-IN'
  | 'pa-IN'
  | 'ml-IN'
  | 'or-IN';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  englishName: string;
}

export interface PlaceResult {
  name: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
  label: string;
}

export interface IndianAirport {
  code: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export interface CurrentConditions {
  time: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  rain: number;
  precipitation: number;
  cloudCover: number;
  pressure: number;
  visibilityKm: number;
  uvIndex: number;
  weatherCode: number;
  conditionLabel: string;
  skyTheme: SkyTheme;
  isDay: boolean;
  sunrise: string;
  sunset: string;
  heatIndex: number;
  heatAdvisory: string;
}

export interface DailyForecast {
  date: string;
  dayIndex: number;
  weatherCode: number;
  conditionLabel: string;
  skyTheme: SkyTheme;
  isStorm: boolean;
  tempMax: number;
  tempMin: number;
  feelsLikeMax: number;
  rainProbability: number;
  rainSumMm: number;
  windMaxKmh: number;
  gustMaxKmh: number;
  uvMax: number;
  humidityMean: number;
  sunrise: string;
  sunset: string;
  confidence: ConfidenceLevel;
  confidenceLabel: string;
}

export interface HourlyPoint {
  time: string;
  date: string;
  hour: number;
  temperature: number;
  feelsLike: number;
  humidity: number;
  rainProbability: number;
  rainMm: number;
  windSpeed: number;
  windGusts: number;
  cloudCover: number;
  visibilityKm: number;
  uvIndex: number;
  weatherCode: number;
}

export interface ForecastResponse {
  place: string;
  lat: number;
  lon: number;
  timezone: string;
  fetchedAt: string;
  cached: boolean;
  source: 'open-meteo' | 'fallback';
  current: CurrentConditions;
  daily: DailyForecast[];
  hourly: HourlyPoint[];
}

export interface AirQualityResponse {
  lat: number;
  lon: number;
  fetchedAt: string;
  cached: boolean;
  usAqi: number;
  europeanAqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  ozone: number;
  category: 'Good' | 'Moderate' | 'Sensitive' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';
  guidance: string;
}

export interface HistoricalYearRecord {
  year: number;
  date: string;
  tempMax: number;
  tempMin: number;
  rainMm: number;
  rained: boolean;
  weatherCode: number;
}

export interface ClimateHistoryResponse {
  place: string;
  lat: number;
  lon: number;
  month: number;
  day: number;
  dateLabel: string;
  totalYears: number;
  rainyYears: number;
  rainProbabilityPct: number;
  avgTempMax: number;
  avgTempMin: number;
  maxRecordedRainMm: number;
  summary: string;
  years: HistoricalYearRecord[];
}

export interface HourlyWindow {
  date: string;
  startHour: number;
  endHour: number;
  label: string;
  score: number;
  avgTemp: number;
  maxRainProb: number;
  maxWindKmh: number;
  reason: string;
  planB: string;
}

export interface DaySuitability {
  date: string;
  score: number;
  tone: 'green' | 'yellow' | 'red';
  verdict: 'Ideal' | 'Fair' | 'Avoid';
  confidence: ConfidenceLevel;
  reasons: string[];
  bestWindow: HourlyWindow | null;
}

export interface EventPlanSummary {
  eventType: EventType;
  bestDays: DaySuitability[];
  avoidDays: DaySuitability[];
  days: DaySuitability[];
  headline: string;
  planBRule: string;
}

export interface EventRecord {
  id: number;
  place: string;
  lat: number;
  lon: number;
  date: string;
  event_type: EventType;
  telegram_chat_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface ForecastAlert {
  id: number;
  event_id: number | null;
  place: string;
  event_date: string;
  severity: 'warning' | 'critical';
  summary: string;
  rain_delta: number;
  new_storm: number;
  telegram_sent: number;
  acknowledged: number;
  created_at: string;
}

export interface AccuracyRecord {
  id: number;
  place: string;
  target_date: string;
  predicted_max: number;
  actual_max: number;
  predicted_rain_prob: number;
  actual_rain_mm: number;
  was_accurate: number;
  recorded_at: string;
}

export interface AccuracySummary {
  place: string;
  totalChecked: number;
  accurateCount: number;
  accuracyPercent: number;
  avgTempErrorC: number;
  records: AccuracyRecord[];
}

export interface FlightAirportCheck {
  airport: IndianAirport;
  current: CurrentConditions;
  airQuality: AirQualityResponse | null;
  flightScore: number;
  verdict: 'Smooth' | 'Watch Delays' | 'High Disruption Risk';
  factors: string[];
}

export interface FlightComparisonResponse {
  origin: FlightAirportCheck;
  destination: FlightAirportCheck;
  overallScore: number;
  overallStatus: 'On-Time Likely' | 'Moderate Delay Risk' | 'High Delay Risk';
  advice: string;
}

export interface AgentToolTrace {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentRecommendResponse {
  reply: string;
  language: LanguageCode;
  languageName: string;
  toolsUsed: AgentToolTrace[];
  detectedPlace?: string;
  detectedEventType?: EventType;
}
