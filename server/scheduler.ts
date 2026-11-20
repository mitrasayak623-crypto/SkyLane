/**
 * Scheduled 30-minute forecast change watcher for Skyplan.
 *
 * Every 30 minutes:
 * 1. Reads all tracked events from SQLite (`events` table)
 * 2. Re-fetches fresh forecasts from Open-Meteo
 * 3. Compares the new forecast against the last stored snapshot (`forecast_snapshots`)
 * 4. If rain probability jumps/swings by >30 points OR a storm newly appears:
 *    - Logs an alert in SQLite (`alerts`) so the frontend announces it by voice on next load
 *    - Dispatches a Telegram message if `telegram_chat_id` and `TELEGRAM_BOT_TOKEN` are set
 * 5. Saves the fresh snapshot for the next 30-minute comparison cycle
 */

import type { ForecastAlert } from '../shared/types';
import {
  createAlert,
  getLatestSnapshotForEvent,
  listEvents,
  saveForecastSnapshot,
} from './db';
import { detectSuddenForecastChange } from './scoring';
import { sendTelegramAlert } from './telegram';
import { fetchForecast } from './weather';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export interface SchedulerRunReport {
  checkedAt: string;
  eventsChecked: number;
  alertsCreated: ForecastAlert[];
  telegramSentCount: number;
}

export async function runScheduledForecastCheck(options?: {
  simulateShiftForEventId?: number;
}): Promise<SchedulerRunReport> {
  const events = listEvents();
  const alertsCreated: ForecastAlert[] = [];
  let telegramSentCount = 0;

  for (const event of events) {
    try {
      const prevSnapshot = getLatestSnapshotForEvent(event.id);
      const freshForecast = await fetchForecast(event.lat, event.lon, event.place, true);
      let latestDaily = freshForecast.daily;

      // Optional student testing hook: simulate a sudden monsoon squall on a specific event
      // when explicitly triggered from the "Test Sudden Alert" button in the watchlist.
      if (options?.simulateShiftForEventId === event.id && latestDaily.length > 0) {
        const prevBaseline = prevSnapshot?.daily ?? latestDaily;
        if (!prevSnapshot) {
          saveForecastSnapshot({
            event_id: event.id,
            place: event.place,
            lat: event.lat,
            lon: event.lon,
            daily: prevBaseline,
          });
        }
        latestDaily = prevBaseline.map((d, idx) =>
          d.date === event.date || idx === 0
            ? {
                ...d,
                rainProbability: Math.min(96, Math.max(d.rainProbability + 42, 78)),
                weatherCode: 95,
                conditionLabel: 'Thunderstorm',
                skyTheme: 'storm',
                isStorm: true,
              }
            : d
        );
      }

      const baseline = prevSnapshot?.daily ?? null;
      if (baseline) {
        const diff = detectSuddenForecastChange(baseline, latestDaily, event.date);
        if (diff.changed) {
          const msg = `<b>Skyplan Sudden Weather Alert</b>\n${event.place} (${event.event_type})\n${diff.summary}`;
          const tg = await sendTelegramAlert(event.telegram_chat_id, msg);
          if (tg.sent) telegramSentCount += 1;

          const alert = createAlert({
            event_id: event.id,
            place: event.place,
            event_date: event.date,
            severity: diff.severity,
            summary: diff.summary,
            rain_delta: diff.rainDelta,
            new_storm: diff.newStorm,
            telegram_sent: tg.sent,
          });
          alertsCreated.push(alert);
        }
      }

      // Persist fresh snapshot for future 30-minute comparisons
      saveForecastSnapshot({
        event_id: event.id,
        place: event.place,
        lat: event.lat,
        lon: event.lon,
        daily: latestDaily,
      });
    } catch (err) {
      console.warn(`[scheduler] Failed checking event #${event.id}:`, (err as Error).message);
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    eventsChecked: events.length,
    alertsCreated,
    telegramSentCount,
  };
}

export function startForecastScheduler(): void {
  if (intervalHandle) return;
  // Take an initial snapshot 5 seconds after boot (non-blocking)
  setTimeout(() => {
    void runScheduledForecastCheck();
  }, 5000);

  intervalHandle = setInterval(() => {
    void runScheduledForecastCheck();
  }, THIRTY_MINUTES_MS);
  console.log('[scheduler] Started 30-minute forecast change watcher');
}
