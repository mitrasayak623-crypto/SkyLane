import React, { useEffect, useState } from 'react';
import {
  BellRing,
  Check,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react';
import type {
  EventRecord,
  EventType,
  ForecastAlert,
  ForecastResponse,
} from '../../shared/types';
import { formatShortDate } from '../../server/scoring';

interface WatchedEventsSectionProps {
  forecast: ForecastResponse | null;
  activeEventType: EventType;
  prefilledDate: string;
  events: EventRecord[];
  alerts: ForecastAlert[];
  onEventsChanged: () => void;
  onSpeakAlert: (text: string) => void;
}

export const WatchedEventsSection: React.FC<WatchedEventsSectionProps> = ({
  forecast,
  activeEventType,
  prefilledDate,
  events,
  alerts,
  onEventsChanged,
  onSpeakAlert,
}) => {
  const [date, setDate] = useState(
    prefilledDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  );
  const [eventType, setEventType] = useState<EventType>(activeEventType);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (prefilledDate) setDate(prefilledDate);
  }, [prefilledDate]);

  useEffect(() => {
    setEventType(activeEventType);
  }, [activeEventType]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forecast) return;
    if (!date.trim()) {
      setFormError('Please select a date for your tracked event.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place: forecast.place,
          lat: forecast.lat,
          lon: forecast.lon,
          date,
          event_type: eventType,
          telegram_chat_id: telegramChatId.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save event.');

      setNotes('');
      setStatusMessage(`Saved ${eventType} in ${forecast.place} for ${formatShortDate(date)}. Watching every 30 min.`);
      onEventsChanged();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/events/${id}`, { method: 'DELETE' });
    onEventsChanged();
  };

  const handleRunCheck = async (simulateShiftForEventId?: number) => {
    setChecking(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/scheduler/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          simulateShiftForEventId ? { simulateShiftForEventId } : {}
        ),
      });
      const report = await res.json();
      if (res.ok) {
        const count = report.alertsCreated?.length ?? 0;
        if (count > 0) {
          const newest = report.alertsCreated[0] as ForecastAlert;
          setStatusMessage(
            `${count} sudden forecast change alert detected (${report.telegramSentCount} Telegram sent).`
          );
          onSpeakAlert(`${newest.place}. ${newest.summary}`);
        } else {
          setStatusMessage(
            `Checked ${report.eventsChecked} saved event(s) against snapshots — forecasts remain steady.`
          );
        }
        onEventsChanged();
      }
    } finally {
      setChecking(false);
    }
  };

  const handleAcknowledge = async (id: number) => {
    await fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' });
    onEventsChanged();
  };

  const unreadAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <section
      id="watched"
      aria-label="Tracked events and sudden weather change alerts"
      className="mt-12 scroll-mt-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-6 sm:p-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Watched Events & Sudden-Change Alerts
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Every 30 minutes, Skyplan compares fresh Open-Meteo data against saved SQLite snapshots. Swings over 30% rain probability or new storms trigger voice & Telegram alerts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleRunCheck()}
          disabled={checking}
          className="btn-press inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1422] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
          {checking ? 'Checking snapshots…' : 'Check forecast changes now'}
        </button>
      </div>

      {/* Active Sudden-Change Alerts List */}
      {unreadAlerts.length > 0 && (
        <div className="mt-5 space-y-2.5" role="region" aria-label="Active sudden weather alerts">
          {unreadAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 px-4 py-3.5"
            >
              <div className="flex items-start gap-3">
                <BellRing className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-rose-950 dark:text-rose-100">
                    {alert.place} · {alert.summary}
                  </p>
                  <p className="mt-0.5 text-xs text-rose-800/80 dark:text-rose-200/80">
                    Rain shift {alert.rain_delta >= 0 ? `+${alert.rain_delta}%` : `${alert.rain_delta}%`}
                    {alert.new_storm ? ' · New storm detected' : ''}
                    {alert.telegram_sent ? ' · Sent to Telegram' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onSpeakAlert(`${alert.place}. ${alert.summary}`)}
                  className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap"
                >
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Speak alert
                </button>
                <button
                  type="button"
                  onClick={() => handleAcknowledge(alert.id)}
                  aria-label={`Dismiss alert for ${alert.place}`}
                  className="btn-press inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-700 px-2.5 py-1.5 text-xs font-medium text-rose-900 dark:text-rose-100 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two-Column Watchlist: Add Event Form + Saved SQLite Events */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <form onSubmit={handleCreate} className="lg:col-span-5 space-y-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Track an event in {forecast?.place ?? 'current city'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="watch-date" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Event date
              </label>
              <input
                id="watch-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="watch-type" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Event type
              </label>
              <select
                id="watch-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="wedding">Outdoor Wedding</option>
                <option value="flight">Flight</option>
                <option value="meeting">Meeting</option>
                <option value="trip">Sightseeing Trip</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="watch-telegram" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Telegram Chat ID (optional, for instant bot alerts)
            </label>
            <div className="relative">
              <Send
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="watch-telegram"
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789 (via @userinfobot)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="watch-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Notes (optional)
            </label>
            <input
              id="watch-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Garden sangeet 6 PM – 10 PM"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {formError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {formError}
            </p>
          )}
          {statusMessage && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
              {statusMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !forecast}
            className="btn-press inline-flex items-center justify-center gap-2 w-full rounded-lg bg-[#1D5FD6] hover:bg-[#174EB3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Saving to SQLite…' : 'Save event & watch forecast'}
          </button>
        </form>

        {/* Saved Events Table */}
        <div className="lg:col-span-7 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Saved watchlist ({events.length})
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Persisted in SQLite
            </span>
          </div>

          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No tracked events yet. Save your wedding, flight, or trip date on the left to enable 30-minute forecast change monitoring.
            </div>
          ) : (
            <ul data-testid="watched-events-list" className="divide-y divide-slate-200 dark:divide-slate-800">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <span>{ev.place}</span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="capitalize text-[#1D5FD6] dark:text-[#7BB8FF]">
                        {ev.event_type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {formatShortDate(ev.date)} ({ev.date})
                      {ev.telegram_chat_id ? ` · Telegram ${ev.telegram_chat_id}` : ' · Voice alert enabled'}
                    </p>
                    {ev.notes && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{ev.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRunCheck(ev.id)}
                      disabled={checking}
                      title="Simulate a sudden storm forecast shift to test voice & Telegram alerts"
                      className="btn-press inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/70 whitespace-nowrap"
                    >
                      <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                      Test alert
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(ev.id)}
                      aria-label={`Delete tracked event ${ev.place} on ${ev.date}`}
                      className="btn-press rounded-lg p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
