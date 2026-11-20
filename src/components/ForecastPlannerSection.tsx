import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Plane,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type {
  EventPlanSummary,
  EventType,
  ForecastResponse,
} from '../../shared/types';
import { formatShortDate } from '../../server/scoring';
import { WeatherGlyph } from './WeatherGlyph';

interface ForecastPlannerSectionProps {
  forecast: ForecastResponse | null;
  plan: EventPlanSummary | null;
  eventType: EventType;
  onEventTypeChange: (type: EventType) => void;
  onTrackDate: (date: string) => void;
}

const EVENT_OPTIONS: { id: EventType; label: string; icon: React.ReactNode }[] = [
  { id: 'wedding', label: 'Outdoor Wedding', icon: <Sparkles className="w-4 h-4" aria-hidden="true" /> },
  { id: 'flight', label: 'Flight', icon: <Plane className="w-4 h-4" aria-hidden="true" /> },
  { id: 'meeting', label: 'Meeting', icon: <Briefcase className="w-4 h-4" aria-hidden="true" /> },
  { id: 'trip', label: 'Sightseeing Trip', icon: <Compass className="w-4 h-4" aria-hidden="true" /> },
];

const SCORE_PILL_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300/70 dark:border-emerald-800',
  yellow:
    'bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300/70 dark:border-amber-800',
  red:
    'bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300/70 dark:border-rose-800',
};

const SCORE_BAR_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-emerald-600 dark:bg-emerald-400',
  yellow: 'bg-amber-500 dark:bg-amber-400',
  red: 'bg-rose-600 dark:bg-rose-400',
};

export const ForecastPlannerSection: React.FC<ForecastPlannerSectionProps> = ({
  forecast,
  plan,
  eventType,
  onEventTypeChange,
  onTrackDate,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const stripRef = useRef<HTMLDivElement>(null);

  const scrollStrip = (direction: 'left' | 'right') => {
    stripRef.current?.scrollBy({
      left: direction === 'right' ? 380 : -380,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    if (plan?.bestDays[0]?.date) {
      setSelectedDate(plan.bestDays[0].date);
    } else if (forecast?.daily[0]?.date) {
      setSelectedDate(forecast.daily[0].date);
    }
  }, [forecast?.place, eventType, plan?.bestDays[0]?.date]);

  if (!forecast || !plan) {
    return (
      <section id="planner" className="mt-10" aria-label="10-day forecast and event planner">
        <div className="h-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] animate-pulse" />
      </section>
    );
  }

  const activeDayForecast =
    forecast.daily.find((d) => d.date === selectedDate) ?? forecast.daily[0];
  const activeDayScore =
    plan.days.find((d) => d.date === activeDayForecast.date) ?? plan.days[0];
  const activeHours = forecast.hourly.filter((h) => h.date === activeDayForecast.date);

  return (
    <section id="planner" aria-label="10-day forecast and event date planner" className="mt-10 scroll-mt-20 space-y-6">
      {/* Header Row + Single-Line Event Type Segmented Selector */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            10-Day Forecast & Event Planner
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Every day is scored 0–100 using event-specific weather weights, confidence tiers, and hourly timing.
          </p>
        </div>

        {/* Single-row Event-Type Segmented Control */}
        <div
          role="group"
          aria-label="Choose event type to score days"
          className="inline-flex flex-nowrap items-center gap-1 overflow-x-auto max-w-full shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-[#0D1422] p-1"
        >
          {EVENT_OPTIONS.map((opt) => {
            const active = eventType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onEventTypeChange(opt.id)}
                className={`btn-press inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-[#1D5FD6] dark:text-[#7BB8FF] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Best Days / Avoid Days / Plan B Summary Band */}
      <div
        data-testid="event-plan-summary"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-5 sm:p-6"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-2.5">
            <p className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
              {plan.headline}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
              <span>
                <strong className="font-semibold text-emerald-700 dark:text-emerald-400">Best days:</strong>{' '}
                {plan.bestDays.map((d) => `${formatShortDate(d.date)} (${d.score}/100)`).join(' · ')}
              </span>
              {plan.avoidDays.length > 0 && (
                <span>
                  <strong className="font-semibold text-rose-700 dark:text-rose-400">Avoid:</strong>{' '}
                  {plan.avoidDays.map((d) => `${formatShortDate(d.date)} (${d.score}/100)`).join(' · ')}
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-6 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Plan B trigger rule</span>
            </div>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {plan.planBRule}
            </p>
          </div>
        </div>
      </div>

      {/* 10-Day Horizontal Forecast Strip Header + Scroll Controls */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Days 1–5 High · Days 6–7 Medium · Days 8–10 Low confidence</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollStrip('left')}
              aria-label="Scroll earlier forecast days"
              className="btn-press rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollStrip('right')}
              aria-label="Scroll later forecast days"
              className="btn-press rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          ref={stripRef}
          key={`${forecast.place}-${eventType}`}
          data-testid="ten-day-strip"
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
        >
          {forecast.daily.map((day, idx) => {
            const dayScore = plan.days[idx];
            const isSelected = day.date === activeDayForecast.date;
            const dateParts = formatShortDate(day.date);

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                aria-pressed={isSelected}
                style={{ animationDelay: `${idx * 35}ms` }}
                className={`forecast-stagger snap-start flex flex-col justify-between text-left shrink-0 w-[178px] sm:w-[186px] rounded-xl p-4 border transition-colors ${
                  isSelected
                    ? 'border-[#1D5FD6] dark:border-[#5BA4FF] bg-blue-50/50 dark:bg-[#152238]'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {idx === 0 ? 'Today' : dateParts}
                    </span>
                    <WeatherGlyph
                      theme={day.skyTheme}
                      className="w-4 h-4 text-[#1D5FD6] dark:text-[#7BB8FF] shrink-0"
                    />
                  </div>

                  {/* Unboxed quiet confidence text */}
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {day.confidenceLabel}
                  </p>

                  <div className="mt-3 flex items-baseline gap-2 font-mono tabular-nums">
                    <span className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      {Math.round(day.tempMax)}°
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      / {Math.round(day.tempMin)}°
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 truncate">
                    {day.conditionLabel}
                  </p>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                    Rain {day.rainProbability}% · {day.gustMaxKmh} km/h
                  </p>
                </div>

              {/* Requested 0-100 Colored Suitability Score Pill + Animated Bar Reveal */}
              {dayScore && (
                <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-slate-800/70">
                  <div
                    className={`inline-flex items-center justify-between w-full rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${SCORE_PILL_STYLES[dayScore.tone]}`}
                  >
                    <span>{dayScore.score}/100</span>
                    <span>{dayScore.verdict}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`score-reveal h-full rounded-full ${SCORE_BAR_STYLES[dayScore.tone]}`}
                      style={{
                        width: `${dayScore.score}%`,
                        animationDelay: `${idx * 35 + 120}ms`,
                      }}
                    />
                  </div>
                </div>
              )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Deep Dive: Hourly Best Time Window + Reasons + Track Button */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{formatShortDate(activeDayForecast.date)}</span>
              <span aria-hidden="true">·</span>
              <span>{activeDayForecast.confidenceLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{activeDayForecast.conditionLabel}</span>
            </div>
            <h3 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              {activeDayScore.bestWindow
                ? `Best time window: ${activeDayScore.bestWindow.label}`
                : `Day outlook: ${activeDayScore.verdict} (${activeDayScore.score}/100)`}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {activeDayScore.bestWindow
                ? `${activeDayScore.bestWindow.reason}. ${activeDayScore.reasons[0]}`
                : activeDayScore.reasons.join(' · ')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onTrackDate(activeDayForecast.date)}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-[#1D5FD6] hover:bg-[#174EB3] px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0"
          >
            <CalendarCheck className="w-4 h-4" aria-hidden="true" />
            Track this date for alerts
          </button>
        </div>

        {/* Hourly Timeline Bar Chart (shown when hourly points exist for the selected day) */}
        {activeHours.length > 0 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Hourly rain chance & temperature (highlighted slot = best window)
              </span>
              <span className="font-mono tabular-nums">
                Peak UV {activeDayForecast.uvMax}
              </span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
              {activeHours
                .filter((_, idx) => idx % 2 === 0)
                .map((pt) => {
                  const inBest =
                    activeDayScore.bestWindow &&
                    pt.hour >= activeDayScore.bestWindow.startHour &&
                    pt.hour < activeDayScore.bestWindow.endHour;
                  const hourLabel =
                    pt.hour === 0
                      ? '12a'
                      : pt.hour === 12
                        ? '12p'
                        : pt.hour < 12
                          ? `${pt.hour}a`
                          : `${pt.hour - 12}p`;

                  return (
                    <div
                      key={pt.time}
                      className={`rounded-lg p-2 text-center border ${
                        inBest
                          ? 'border-emerald-500/70 bg-emerald-50/70 dark:bg-emerald-950/40'
                          : 'border-slate-200/70 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#0C1320]'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {hourLabel}
                      </div>
                      <div className="mt-1 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {Math.round(pt.temperature)}°
                      </div>
                      <div className="mt-1.5 h-8 w-full flex items-end justify-center">
                        <div
                          className={`w-2.5 rounded-t ${
                            pt.rainProbability >= 50
                              ? 'bg-rose-500'
                              : pt.rainProbability >= 25
                                ? 'bg-amber-500'
                                : 'bg-sky-500/70'
                          }`}
                          style={{ height: `${Math.max(12, pt.rainProbability)}%` }}
                          title={`Rain chance: ${pt.rainProbability}%`}
                        />
                      </div>
                      <div className="mt-1 font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                        {pt.rainProbability}%
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Hourly granularity is available for days 1–7. Days 8–10 show daily range and low-confidence trend scores.
          </p>
        )}
      </div>
    </section>
  );
};
