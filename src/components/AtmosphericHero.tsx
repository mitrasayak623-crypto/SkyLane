import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Droplets,
  Eye,
  Gauge,
  Languages,
  MapPin,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import type {
  AirQualityResponse,
  ForecastResponse,
  LanguageCode,
  PlaceResult,
  SkyTheme,
} from '../../shared/types';
import { INDIAN_CITIES, SUPPORTED_LANGUAGES } from '../../server/scoring';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { WeatherGlyph } from './WeatherGlyph';

interface AtmosphericHeroProps {
  forecast: ForecastResponse | null;
  airQuality: AirQualityResponse | null;
  loading: boolean;
  language: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  onSelectPlace: (place: PlaceResult) => void;
  onUseGps: () => void;
  gpsLoading: boolean;
  isSpeaking: boolean;
  onToggleSpeak: () => void;
}

const SKY_BACKGROUNDS: Record<SkyTheme, string> = {
  'clear-day':
    'bg-gradient-to-br from-[#0F4CA8] via-[#1C6DD0] to-[#3B9AE1]',
  'clear-night':
    'bg-gradient-to-br from-[#071126] via-[#0F2147] to-[#1A3463]',
  'partly-cloudy':
    'bg-gradient-to-br from-[#1C4987] via-[#3268A8] to-[#5E8BB8]',
  cloudy:
    'bg-gradient-to-br from-[#2B3B4E] via-[#3F536A] to-[#5C7085]',
  fog:
    'bg-gradient-to-br from-[#374857] via-[#4D6172] to-[#6E8091]',
  rain:
    'bg-gradient-to-br from-[#13293D] via-[#1E425E] to-[#2C5D7A]',
  storm:
    'bg-gradient-to-br from-[#0C1424] via-[#192640] to-[#283652]',
};

const RAIN_DROPS = Array.from({ length: 24 }, (_, idx) => ({
  id: idx,
  left: `${(idx * 4.3 + (idx % 3) * 1.4) % 98}%`,
  delay: `${(idx * 0.13) % 1.4}s`,
  duration: `${0.9 + (idx % 4) * 0.16}s`,
  height: `${44 + (idx % 3) * 18}px`,
}));

function formatClock(isoString: string): string {
  if (!isoString || !isoString.includes('T')) return '--:--';
  const timePart = isoString.split('T')[1].slice(0, 5);
  const [hStr, mStr] = timePart.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return timePart;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

export const AtmosphericHero: React.FC<AtmosphericHeroProps> = ({
  forecast,
  airQuality,
  loading,
  language,
  onLanguageChange,
  onSelectPlace,
  onUseGps,
  gpsLoading,
  isSpeaking,
  onToggleSpeak,
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const currentTemp = forecast?.current.temperature ?? 29;
  const animatedTemp = useAnimatedNumber(currentTemp, 380);
  const skyTheme: SkyTheme = forecast?.current.skyTheme ?? 'partly-cloudy';

  // Close search dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced Indian place search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions(INDIAN_CITIES.slice(0, 6));
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = (await res.json()) as { results: PlaceResult[] };
          setSuggestions(data.results ?? []);
        }
      } catch {
        setSuggestions(
          INDIAN_CITIES.filter((c) => c.label.toLowerCase().includes(trimmed.toLowerCase()))
        );
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  const handleChoose = (place: PlaceResult) => {
    onSelectPlace(place);
    setQuery('');
    setDropdownOpen(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0) {
      handleChoose(suggestions[0]);
    }
  };

  const aqiColor = !airQuality
    ? 'text-slate-700 dark:text-slate-200'
    : airQuality.usAqi <= 50
      ? 'text-emerald-700 dark:text-emerald-400'
      : airQuality.usAqi <= 100
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-rose-700 dark:text-rose-400';

  return (
    <section
      id="forecast"
      aria-label="Current weather and location search"
      className="relative scroll-mt-20"
    >
      {/* Signature Animated Atmospheric Sky Canvas */}
      <div
        data-testid="atmospheric-hero"
        data-sky-theme={skyTheme}
        className={`relative overflow-hidden rounded-2xl ${SKY_BACKGROUNDS[skyTheme]} text-white transition-colors duration-700`}
      >
        {/* Weather-driven living sky layers (isolated strictly to this hero) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {/* Solar glow for clear or partly cloudy daylight */}
          {(skyTheme === 'clear-day' || skyTheme === 'partly-cloudy') && (
            <div
              className="sky-sun-glow absolute -top-24 right-8 h-80 w-80 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(254,240,138,0.45) 0%, rgba(251,191,36,0.18) 42%, rgba(251,191,36,0) 72%)',
              }}
            />
          )}

          {/* Clear night soft starlight shimmer */}
          {skyTheme === 'clear-night' && (
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  'radial-gradient(1.5px 1.5px at 14% 24%, #E2E8F0 90%, transparent), radial-gradient(1.5px 1.5px at 38% 18%, #CBD5E1 90%, transparent), radial-gradient(2px 2px at 72% 28%, #F8FAFC 90%, transparent), radial-gradient(1.5px 1.5px at 84% 16%, #CBD5E1 90%, transparent), radial-gradient(1.5px 1.5px at 56% 42%, #94A3B8 90%, transparent)',
              }}
            />
          )}

          {/* Drifting cloud banks */}
          {(skyTheme === 'partly-cloudy' ||
            skyTheme === 'cloudy' ||
            skyTheme === 'rain' ||
            skyTheme === 'storm') && (
            <>
              <div
                className="sky-cloud-slow absolute -top-12 -left-16 h-56 w-[68%] rounded-full blur-3xl"
                style={{
                  background:
                    skyTheme === 'storm'
                      ? 'rgba(15, 23, 42, 0.55)'
                      : 'rgba(255, 255, 255, 0.16)',
                }}
              />
              <div
                className="sky-cloud-fast absolute top-10 right-[-10%] h-48 w-[58%] rounded-full blur-3xl"
                style={{
                  background:
                    skyTheme === 'storm'
                      ? 'rgba(30, 41, 59, 0.5)'
                      : 'rgba(226, 232, 240, 0.18)',
                }}
              />
            </>
          )}

          {/* Mist & Fog horizontal veil */}
          {skyTheme === 'fog' && (
            <>
              <div
                className="sky-fog-band absolute inset-x-0 bottom-0 h-44 blur-2xl"
                style={{
                  background:
                    'linear-gradient(to top, rgba(226,232,240,0.38), rgba(226,232,240,0))',
                }}
              />
              <div
                className="sky-cloud-slow absolute inset-x-0 top-1/3 h-24 blur-2xl"
                style={{
                  background: 'rgba(241,245,249,0.16)',
                }}
              />
            </>
          )}

          {/* Rain streaks */}
          {(skyTheme === 'rain' || skyTheme === 'storm') && (
            <div className="absolute inset-0">
              {RAIN_DROPS.map((drop) => (
                <span
                  key={drop.id}
                  className="sky-rain-drop absolute top-0 w-px bg-gradient-to-b from-transparent via-sky-200/70 to-transparent"
                  style={{
                    left: drop.left,
                    height: drop.height,
                    animationDelay: drop.delay,
                    animationDuration: drop.duration,
                  }}
                />
              ))}
            </div>
          )}

          {/* Distant sheet lightning illumination */}
          {skyTheme === 'storm' && (
            <div
              className="sky-lightning absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 75% 20%, rgba(224,242,254,0.65), rgba(147,197,253,0.15) 45%, transparent 70%)',
              }}
            />
          )}

          {/* Measured contrast scrim for guaranteed WCAG legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/20 to-slate-950/15" />
        </div>

        {/* Hero Foreground Content */}
        <div className="relative z-10 p-6 sm:p-8 lg:p-10">
          {/* Interactive Controls Row: Indian City Search + GPS + Language + Voice */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div ref={searchBoxRef} className="relative flex-1 max-w-xl">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 z-10 w-4 h-4 text-white/85"
                    aria-hidden="true"
                  />
                  <label htmlFor="city-search-input" className="sr-only">
                    Search any Indian city or area
                  </label>
                  <input
                    id="city-search-input"
                    type="text"
                    value={query}
                    onFocus={() => setDropdownOpen(true)}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setDropdownOpen(true);
                    }}
                    placeholder="Search any Indian city, area, or airport (e.g. Jaipur, Goa, Bandra)"
                    className="w-full rounded-xl border border-white/25 bg-slate-950/35 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/70 backdrop-blur-md focus:bg-slate-950/50 focus:border-white/50"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="button"
                  onClick={onUseGps}
                  disabled={gpsLoading}
                  aria-label="Use my GPS location"
                  className="btn-press inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-slate-950/35 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-slate-950/50 disabled:opacity-60 whitespace-nowrap shrink-0 backdrop-blur-md"
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{gpsLoading ? 'Locating…' : 'Use GPS'}</span>
                </button>
              </form>

              {/* Live Indian City Suggestions Dropdown */}
              {dropdownOpen && (
                <div
                  role="listbox"
                  aria-label="Indian city search suggestions"
                  className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xl"
                >
                  {searching ? (
                    <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      Searching places across India…
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      No matching place found in India. Try a nearby city name.
                    </div>
                  ) : (
                    suggestions.map((item) => (
                      <button
                        key={`${item.label}-${item.lat}-${item.lon}`}
                        type="button"
                        role="option"
                        onClick={() => handleChoose(item)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {item.state}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Language Picker + Voice Read Aloud */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative inline-flex items-center">
                <Languages
                  className="pointer-events-none absolute left-3 z-10 w-4 h-4 text-white/85"
                  aria-hidden="true"
                />
                <label htmlFor="language-select" className="sr-only">
                  Choose Indian language for AI explanation and voice
                </label>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
                  className="rounded-xl border border-white/25 bg-slate-950/35 pl-9 pr-8 py-2.5 text-sm font-medium text-white backdrop-blur-md hover:bg-slate-950/50 cursor-pointer"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option
                      key={lang.code}
                      value={lang.code}
                      className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {lang.nativeName} ({lang.englishName})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={onToggleSpeak}
                className="btn-press inline-flex items-center gap-2 rounded-xl bg-white text-slate-950 px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-4 h-4" aria-hidden="true" />
                    Stop voice
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                    Read forecast aloud
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Primary Meteorological Focal Stage */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
                <span>{forecast ? `${forecast.lat.toFixed(2)}°N, ${forecast.lon.toFixed(2)}°E` : 'India'}</span>
                <span aria-hidden="true">·</span>
                <span>IST (Asia/Kolkata)</span>
                {forecast?.cached && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>15-min cache</span>
                  </>
                )}
              </div>

              <h1 className="mt-1.5 font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white">
                {forecast?.place ?? 'Loading location…'}
              </h1>

              <div className="mt-5 flex flex-wrap items-baseline gap-5">
                <div
                  data-testid="hero-temperature"
                  className="font-display text-6xl sm:text-7xl lg:text-[5.25rem] font-semibold leading-none tracking-tight tabular-nums text-white"
                >
                  {loading && !forecast ? '--' : `${Math.round(animatedTemp)}°`}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xl font-medium text-white">
                    <WeatherGlyph theme={skyTheme} className="w-6 h-6 text-amber-200" />
                    <span>{forecast?.current.conditionLabel ?? 'Fetching sky conditions'}</span>
                  </div>
                  <p className="text-sm text-white/85 tabular-nums">
                    Feels like {forecast ? `${Math.round(forecast.current.feelsLike)}°C` : '--'}
                    <span className="mx-2" aria-hidden="true">·</span>
                    High {forecast?.daily[0] ? `${Math.round(forecast.daily[0].tempMax)}°` : '--'} / Low{' '}
                    {forecast?.daily[0] ? `${Math.round(forecast.daily[0].tempMin)}°` : '--'}
                  </p>
                </div>
              </div>
            </div>

            {/* Right-aligned Sunrise / Sunset + Heat Index summary */}
            <div className="lg:col-span-5 flex flex-col gap-3 lg:items-end lg:text-right">
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/90 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <Sunrise className="w-4 h-4 text-amber-200" aria-hidden="true" />
                  Sunrise {forecast ? formatClock(forecast.current.sunrise) : '--:--'}
                </span>
                <span aria-hidden="true" className="text-white/40">|</span>
                <span className="inline-flex items-center gap-1.5">
                  <Sunset className="w-4 h-4 text-amber-300" aria-hidden="true" />
                  Sunset {forecast ? formatClock(forecast.current.sunset) : '--:--'}
                </span>
              </div>
              {forecast && (
                <p className="text-sm text-white/85 max-w-md">
                  Heat index <span className="font-mono font-semibold tabular-nums">{forecast.current.heatIndex}°C</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  {forecast.current.heatAdvisory}
                </p>
              )}
              {airQuality && (
                <p className="text-sm text-white/85 max-w-md">
                  Air quality <span className="font-mono font-semibold tabular-nums">US AQI {airQuality.usAqi}</span> ({airQuality.category})
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  PM2.5 {airQuality.pm25} µg/m³
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Crisp Hairline Meteorological Readout Strip (All 10+ Core Conditions + AQI) */}
      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927]">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 divide-slate-200/80 dark:divide-slate-800/80">
          <MetricCell
            icon={<Droplets className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Humidity"
            value={forecast ? `${forecast.current.humidity}%` : '--'}
            sub={forecast && forecast.current.humidity > 75 ? 'Humid air' : 'Balanced'}
          />
          <MetricCell
            icon={<Wind className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Wind & Gusts"
            value={forecast ? `${Math.round(forecast.current.windSpeed)} km/h` : '--'}
            sub={forecast ? `Gusts ${Math.round(forecast.current.windGusts)} km/h` : '--'}
          />
          <MetricCell
            icon={<Droplets className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Rain now"
            value={forecast ? `${forecast.current.rain.toFixed(1)} mm` : '--'}
            sub={forecast ? `Cloud cover ${forecast.current.cloudCover}%` : '--'}
          />
          <MetricCell
            icon={<Gauge className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Pressure"
            value={forecast ? `${forecast.current.pressure} hPa` : '--'}
            sub={forecast && forecast.current.pressure < 1006 ? 'Low pressure system' : 'Steady sea-level'}
          />
          <MetricCell
            icon={<Eye className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Visibility"
            value={forecast ? `${forecast.current.visibilityKm} km` : '--'}
            sub={forecast && forecast.current.visibilityKm < 4 ? 'Hazy / foggy' : 'Clear horizon'}
          />
          <MetricCell
            icon={<Sun className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="UV Index"
            value={forecast ? `${forecast.current.uvIndex}` : '--'}
            sub={
              !forecast
                ? '--'
                : forecast.current.uvIndex >= 8
                  ? 'Very high sun'
                  : forecast.current.uvIndex >= 5
                    ? 'Moderate–high'
                    : 'Low exposure'
            }
          />
          <MetricCell
            icon={<Thermometer className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Heat Index"
            value={forecast ? `${forecast.current.heatIndex}°C` : '--'}
            sub={forecast ? `Feels like ${Math.round(forecast.current.feelsLike)}°C` : '--'}
          />
          <MetricCell
            icon={<Compass className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Air Quality"
            value={airQuality ? `${airQuality.usAqi} AQI` : '--'}
            valueClass={aqiColor}
            sub={airQuality ? `${airQuality.category} · PM2.5 ${airQuality.pm25}` : 'Checking air…'}
          />
          <MetricCell
            icon={<Sunrise className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Sunrise"
            value={forecast ? formatClock(forecast.current.sunrise) : '--'}
            sub="First light"
          />
          <MetricCell
            icon={<Sunset className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" />}
            label="Sunset"
            value={forecast ? formatClock(forecast.current.sunset) : '--'}
            sub="Golden hour end"
          />
        </dl>
      </div>
    </section>
  );
};

interface MetricCellProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}

const MetricCell: React.FC<MetricCellProps> = ({ icon, label, value, sub, valueClass }) => (
  <div className="p-4 sm:border-r sm:border-b border-slate-200/70 dark:border-slate-800/70 last:border-r-0">
    <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
      {icon}
      <span>{label}</span>
    </dt>
    <dd
      className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${
        valueClass ?? 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {value}
    </dd>
    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{sub}</p>
  </div>
);
