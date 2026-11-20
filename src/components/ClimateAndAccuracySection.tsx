import React, { useEffect, useState } from 'react';
import { CalendarSearch, CheckCircle2, CloudRain, History, RefreshCw } from 'lucide-react';
import type {
  AccuracySummary,
  ClimateHistoryResponse,
  ForecastResponse,
} from '../../shared/types';

interface ClimateAndAccuracySectionProps {
  forecast: ForecastResponse | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const ClimateAndAccuracySection: React.FC<ClimateAndAccuracySectionProps> = ({
  forecast,
}) => {
  const [month, setMonth] = useState(12);
  const [day, setDay] = useState(15);
  const [history, setHistory] = useState<ClimateHistoryResponse | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const [accuracy, setAccuracy] = useState<AccuracySummary | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Fetch 10-year climate archive whenever city or calendar month/day changes
  useEffect(() => {
    if (!forecast) return;
    let active = true;
    setHistLoading(true);

    const params = new URLSearchParams({
      lat: String(forecast.lat),
      lon: String(forecast.lon),
      month: String(month),
      day: String(day),
      place: forecast.place,
    });

    fetch(`/api/history?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ClimateHistoryResponse | null) => {
        if (active && json) setHistory(json);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHistLoading(false);
      });

    return () => {
      active = false;
    };
  }, [forecast?.lat, forecast?.lon, forecast?.place, month, day]);

  // Fetch SQLite forecast accuracy summary for current city
  useEffect(() => {
    if (!forecast) return;
    let active = true;

    fetch(`/api/accuracy?place=${encodeURIComponent(forecast.place)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: AccuracySummary | null) => {
        if (active && json) setAccuracy(json);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [forecast?.place]);

  const handleLogVerification = async () => {
    if (!forecast) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/accuracy/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place: forecast.place,
          lat: forecast.lat,
          lon: forecast.lon,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.summary) setAccuracy(json.summary);
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section
      id="insights"
      aria-label="10-year climate history and forecast accuracy tracker"
      className="mt-12 scroll-mt-20 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
    >
      {/* Left: 10-Year Climate History for Far-Off Wedding/Trip Dates */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-6 flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                10-Year Climate History
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Planning a wedding or trip months ahead? Inspect how this exact calendar date behaved over the past decade.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="history-month" className="sr-only">
                Month
              </label>
              <select
                id="history-month"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>

              <label htmlFor="history-day" className="sr-only">
                Day of month
              </label>
              <select
                id="history-day"
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {histLoading && !history ? (
            <div className="mt-6 h-40 rounded-xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ) : history ? (
            <div data-testid="climate-history-panel" className="mt-6">
              <p className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                {history.summary}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <CloudRain className="w-4 h-4 text-[#1D5FD6] dark:text-[#5BA4FF]" aria-hidden="true" />
                  Rainy years: {history.rainyYears}/{history.totalYears} ({history.rainProbabilityPct}%)
                </span>
                <span>
                  Avg high {history.avgTempMax}°C / low {history.avgTempMin}°C
                </span>
                <span>Peak rain {history.maxRecordedRainMm.toFixed(1)} mm</span>
              </div>

              {/* 10-Year Historical Bar Breakdown */}
              <div className="mt-6 grid grid-cols-5 sm:grid-cols-10 gap-2">
                {history.years.map((yr) => {
                  const barHeight = yr.rained
                    ? Math.min(100, Math.max(24, Math.round(yr.rainMm * 4)))
                    : 8;
                  return (
                    <div
                      key={yr.year}
                      className="flex flex-col items-center rounded-lg border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0C1320] p-2"
                    >
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {yr.year}
                      </span>
                      <div className="mt-2 h-14 w-full flex items-end justify-center">
                        <div
                          className={`w-3.5 rounded-t ${
                            yr.rained
                              ? 'bg-[#1D5FD6] dark:bg-[#5BA4FF]'
                              : 'bg-slate-300/80 dark:bg-slate-700'
                          }`}
                          style={{ height: `${barHeight}%` }}
                          title={`${yr.date}: ${yr.rainMm} mm rain, max ${yr.tempMax}°C`}
                        />
                      </div>
                      <span className="mt-1.5 font-mono text-[10px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                        {yr.rained ? `${yr.rainMm}mm` : 'Dry'}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                        {Math.round(yr.tempMax)}°
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <p className="mt-5 pt-4 border-t border-slate-200/70 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <CalendarSearch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Powered by Open-Meteo ERA5 historical climate archive (rainy day defined as ≥ 1.0 mm).</span>
        </p>
      </div>

      {/* Right: SQLite Forecast Accuracy Tracker */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Forecast Accuracy
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Saved snapshots compared against observed temperatures and rainfall.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogVerification}
              disabled={verifying || !forecast}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} aria-hidden="true" />
              Log check
            </button>
          </div>

          {accuracy && (
            <div data-testid="accuracy-panel" className="mt-5">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-4xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {accuracy.accuracyPercent}%
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  accurate in {accuracy.place}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {accuracy.accurateCount}/{accuracy.totalChecked} forecasts matched within ±2.5°C & rain outcome · Avg temp delta {accuracy.avgTempErrorC}°C
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium text-right">Pred / Act</th>
                      <th className="py-2 font-medium text-right">Rain</th>
                      <th className="py-2 font-medium text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono tabular-nums">
                    {accuracy.records.slice(0, 6).map((rec) => (
                      <tr key={rec.id}>
                        <td className="py-2 text-slate-700 dark:text-slate-300">
                          {rec.target_date}
                        </td>
                        <td className="py-2 text-right text-slate-700 dark:text-slate-300">
                          {rec.predicted_max.toFixed(0)}° / {rec.actual_max.toFixed(0)}°
                        </td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                          {rec.predicted_rain_prob}% ({rec.actual_rain_mm.toFixed(1)}mm)
                        </td>
                        <td
                          className={`py-2 text-right font-sans font-semibold ${
                            rec.was_accurate
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {rec.was_accurate ? 'Hit' : 'Miss'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Stored locally in SQLite so accuracy improves as you track more cities.</span>
        </p>
      </div>
    </section>
  );
};
