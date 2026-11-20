import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, PlaneLanding, PlaneTakeoff } from 'lucide-react';
import type { FlightAirportCheck, FlightComparisonResponse } from '../../shared/types';
import { INDIAN_AIRPORTS } from '../../server/scoring';
import { WeatherGlyph } from './WeatherGlyph';

export const FlightCheckSection: React.FC = () => {
  const [originCode, setOriginCode] = useState('DEL');
  const [destCode, setDestCode] = useState('GOI');
  const [data, setData] = useState<FlightComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/flights/compare?origin=${originCode}&destination=${destCode}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: FlightComparisonResponse | null) => {
        if (active && json) setData(json);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [originCode, destCode]);

  const handleSwap = () => {
    setOriginCode(destCode);
    setDestCode(originCode);
  };

  return (
    <section
      id="flights"
      aria-label="Flight origin and destination airport weather check"
      className="mt-12 scroll-mt-20"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Flight Weather Check
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Compare runway visibility, crosswind gusts, thunderstorm risk, and haze at both Indian airports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div>
            <label htmlFor="origin-airport" className="sr-only">
              Origin airport
            </label>
            <select
              id="origin-airport"
              value={originCode}
              onChange={(e) => setOriginCode(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111927] px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              {INDIAN_AIRPORTS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.city}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap origin and destination airports"
            className="btn-press rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111927] p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
          </button>

          <div>
            <label htmlFor="dest-airport" className="sr-only">
              Destination airport
            </label>
            <select
              id="dest-airport"
              value={destCode}
              onChange={(e) => setDestCode(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111927] px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              {INDIAN_AIRPORTS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.city}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] overflow-hidden">
        {loading && !data ? (
          <div className="p-8 text-sm text-slate-500 dark:text-slate-400">
            Checking origin and destination airport weather…
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
              <AirportColumn role="Departure" check={data.origin} />
              <AirportColumn role="Arrival" check={data.destination} />
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0D1422] px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-sm text-slate-700 dark:text-slate-200">
                <span className="font-semibold">{data.overallStatus}</span>
                <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
                <span>{data.advice}</span>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Route score {data.overallScore}/100
              </span>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
};

const AirportColumn: React.FC<{ role: 'Departure' | 'Arrival'; check: FlightAirportCheck }> = ({
  role,
  check,
}) => {
  const verdictTone =
    check.flightScore >= 75
      ? 'text-emerald-700 dark:text-emerald-400'
      : check.flightScore >= 50
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-rose-700 dark:text-rose-400';

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {role === 'Departure' ? (
              <PlaneTakeoff className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <PlaneLanding className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{role}</span>
            <span aria-hidden="true">·</span>
            <span>{check.airport.name}</span>
          </div>
          <h3 className="mt-1 font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {check.airport.code} · {check.airport.city}
          </h3>
        </div>

        <div className="text-right">
          <div className={`font-mono text-xl font-semibold tabular-nums ${verdictTone}`}>
            {check.flightScore}/100
          </div>
          <div className={`text-xs font-medium ${verdictTone}`}>{check.verdict}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700 dark:text-slate-300 font-mono tabular-nums">
        <span className="inline-flex items-center gap-1.5 font-sans font-medium">
          <WeatherGlyph theme={check.current.skyTheme} className="w-4 h-4 text-[#1D5FD6] dark:text-[#7BB8FF]" />
          {check.current.conditionLabel}
        </span>
        <span>{Math.round(check.current.temperature)}°C</span>
        <span>Vis {check.current.visibilityKm} km</span>
        <span>Gust {Math.round(check.current.windGusts)} km/h</span>
        {check.airQuality && <span>AQI {check.airQuality.usAqi}</span>}
      </div>

      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        {check.factors.join(' · ')}
      </p>
    </div>
  );
};
