/**
 * SQLite database layer for Skyplan (using better-sqlite3).
 *
 * Stores:
 * 1. `events` — tracked weddings, flights, meetings, and trips (with optional Telegram chat ID)
 * 2. `forecast_snapshots` — saved forecast JSON blobs so the scheduler can compare changes over time
 * 3. `alerts` — sudden forecast swings (>30-point rain jump or newly appearing storm)
 * 4. `accuracy_records` — past forecast-vs-actual checks for the Forecast Accuracy Tracker
 */

import Database from 'better-sqlite3';
import path from 'path';
import type {
  AccuracyRecord,
  AccuracySummary,
  DailyForecast,
  EventRecord,
  EventType,
  ForecastAlert,
} from '../shared/types';

const DB_PATH = path.resolve(process.cwd(), 'skyplan.db');
const db = new Database(DB_PATH);

// Enable WAL mode for safe concurrent reads/writes between Express routes and the scheduler
db.pragma('journal_mode = WAL');

// Initialize tables on startup
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    date TEXT NOT NULL,
    event_type TEXT NOT NULL,
    telegram_chat_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS forecast_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    place TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    forecast_json TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    place TEXT NOT NULL,
    event_date TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    summary TEXT NOT NULL,
    rain_delta INTEGER NOT NULL DEFAULT 0,
    new_storm INTEGER NOT NULL DEFAULT 0,
    telegram_sent INTEGER NOT NULL DEFAULT 0,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accuracy_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    target_date TEXT NOT NULL,
    predicted_max REAL NOT NULL,
    actual_max REAL NOT NULL,
    predicted_rain_prob INTEGER NOT NULL,
    actual_rain_mm REAL NOT NULL,
    was_accurate INTEGER NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/**
 * Seeds initial forecast accuracy history and one example watched event on a brand-new database
 * so users immediately see how the Accuracy Tracker and Event Watchlist work.
 */
function seedInitialDataIfEmpty(): void {
  const accuracyCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM accuracy_records').get() as { cnt: number }
  ).cnt;

  if (accuracyCount === 0) {
    const insertAcc = db.prepare(`
      INSERT INTO accuracy_records (
        place, lat, lon, target_date, predicted_max, actual_max,
        predicted_rain_prob, actual_rain_mm, was_accurate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedCities = [
      {
        place: 'Mumbai',
        lat: 19.076,
        lon: 72.8777,
        rows: [
          ['2026-11-18', 33.0, 32.6, 15, 0.0, 1],
          ['2026-11-15', 32.5, 33.1, 20, 0.2, 1],
          ['2026-11-12', 31.8, 30.2, 55, 6.4, 1],
          ['2026-11-08', 33.4, 33.0, 10, 0.0, 1],
          ['2026-11-04', 32.0, 34.8, 45, 0.0, 0],
          ['2026-10-30', 33.2, 32.9, 12, 0.0, 1],
          ['2026-10-26', 32.4, 32.1, 25, 0.0, 1],
        ],
      },
      {
        place: 'New Delhi',
        lat: 28.6139,
        lon: 77.209,
        rows: [
          ['2026-11-18', 27.5, 27.1, 5, 0.0, 1],
          ['2026-11-14', 28.2, 27.8, 10, 0.0, 1],
          ['2026-11-10', 29.0, 29.5, 5, 0.0, 1],
          ['2026-11-06', 29.4, 26.8, 15, 3.2, 0],
          ['2026-11-02', 30.1, 29.9, 8, 0.0, 1],
          ['2026-10-28', 31.2, 30.7, 5, 0.0, 1],
        ],
      },
      {
        place: 'Goa (Panaji)',
        lat: 15.4909,
        lon: 73.8278,
        rows: [
          ['2026-11-18', 32.8, 32.4, 18, 0.0, 1],
          ['2026-11-14', 33.0, 32.7, 22, 0.4, 1],
          ['2026-11-10', 32.2, 31.9, 60, 8.1, 1],
          ['2026-11-05', 32.6, 32.2, 15, 0.0, 1],
          ['2026-11-01', 31.5, 31.1, 48, 0.0, 0],
        ],
      },
      {
        place: 'Jaipur',
        lat: 26.9124,
        lon: 75.7873,
        rows: [
          ['2026-11-18', 29.0, 28.6, 5, 0.0, 1],
          ['2026-11-13', 29.5, 29.3, 5, 0.0, 1],
          ['2026-11-09', 30.2, 30.0, 10, 0.0, 1],
          ['2026-11-04', 30.8, 30.2, 5, 0.0, 1],
          ['2026-10-29', 31.4, 31.9, 5, 0.0, 1],
        ],
      },
    ];

    const tx = db.transaction(() => {
      for (const city of seedCities) {
        for (const r of city.rows) {
          insertAcc.run(city.place, city.lat, city.lon, r[0], r[1], r[2], r[3], r[4], r[5]);
        }
      }
    });
    tx();
  }

  const eventCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }
  ).cnt;
  if (eventCount === 0) {
    const fourDaysAhead = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO events (place, lat, lon, date, event_type, telegram_chat_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Goa (Panaji)',
      15.4909,
      73.8278,
      fourDaysAhead,
      'wedding',
      null,
      'Sunset pheras & outdoor coastal reception'
    );
  }
}

seedInitialDataIfEmpty();

// ---- Events CRUD ----

export function listEvents(): EventRecord[] {
  return db
    .prepare('SELECT * FROM events ORDER BY date ASC, id DESC')
    .all() as EventRecord[];
}

export function createEvent(input: {
  place: string;
  lat: number;
  lon: number;
  date: string;
  event_type: EventType;
  telegram_chat_id?: string | null;
  notes?: string | null;
}): EventRecord {
  const stmt = db.prepare(`
    INSERT INTO events (place, lat, lon, date, event_type, telegram_chat_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    input.place.trim(),
    input.lat,
    input.lon,
    input.date,
    input.event_type,
    input.telegram_chat_id?.trim() || null,
    input.notes?.trim() || null
  );
  return db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid) as EventRecord;
}

export function deleteEvent(id: number): boolean {
  const info = db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return info.changes > 0;
}

// ---- Forecast Snapshots ----

export function saveForecastSnapshot(input: {
  event_id?: number | null;
  place: string;
  lat: number;
  lon: number;
  daily: DailyForecast[];
}): number {
  const info = db
    .prepare(
      `INSERT INTO forecast_snapshots (event_id, place, lat, lon, forecast_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(input.event_id ?? null, input.place, input.lat, input.lon, JSON.stringify(input.daily));
  return Number(info.lastInsertRowid);
}

export function getLatestSnapshotForEvent(eventId: number): {
  id: number;
  checked_at: string;
  daily: DailyForecast[];
} | null {
  const row = db
    .prepare(
      `SELECT id, checked_at, forecast_json FROM forecast_snapshots
       WHERE event_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(eventId) as { id: number; checked_at: string; forecast_json: string } | undefined;

  if (!row) return null;
  try {
    return {
      id: row.id,
      checked_at: row.checked_at,
      daily: JSON.parse(row.forecast_json) as DailyForecast[],
    };
  } catch {
    return null;
  }
}

// ---- Sudden-Change Alerts ----

export function createAlert(input: {
  event_id?: number | null;
  place: string;
  event_date: string;
  severity: 'warning' | 'critical';
  summary: string;
  rain_delta: number;
  new_storm: boolean;
  telegram_sent: boolean;
}): ForecastAlert {
  const info = db
    .prepare(
      `INSERT INTO alerts (
        event_id, place, event_date, severity, summary, rain_delta, new_storm, telegram_sent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.event_id ?? null,
      input.place,
      input.event_date,
      input.severity,
      input.summary,
      input.rain_delta,
      input.new_storm ? 1 : 0,
      input.telegram_sent ? 1 : 0
    );
  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid) as ForecastAlert;
}

export function listAlerts(onlyUnacknowledged = false): ForecastAlert[] {
  const sql = onlyUnacknowledged
    ? 'SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY id DESC LIMIT 20'
    : 'SELECT * FROM alerts ORDER BY id DESC LIMIT 20';
  return db.prepare(sql).all() as ForecastAlert[];
}

export function acknowledgeAlert(id: number): boolean {
  const info = db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
  return info.changes > 0;
}

// ---- Forecast Accuracy Tracker ----

export function getAccuracySummary(place: string): AccuracySummary {
  const cleanPlace = place.split(',')[0].trim();
  let rows = db
    .prepare(
      `SELECT * FROM accuracy_records
       WHERE LOWER(place) LIKE LOWER(?)
       ORDER BY target_date DESC LIMIT 12`
    )
    .all(`%${cleanPlace}%`) as AccuracyRecord[];

  // If no city-specific history exists yet, return all-India verified baseline
  let label = place;
  if (rows.length === 0) {
    rows = db
      .prepare('SELECT * FROM accuracy_records ORDER BY target_date DESC LIMIT 12')
      .all() as AccuracyRecord[];
    label = `${place} (All-India Baseline)`;
  }

  const totalChecked = rows.length;
  const accurateCount = rows.filter((r) => r.was_accurate === 1).length;
  const accuracyPercent = totalChecked > 0 ? Math.round((accurateCount / totalChecked) * 100) : 0;
  const avgTempErrorC =
    totalChecked > 0
      ? Math.round(
          (rows.reduce((sum, r) => sum + Math.abs(r.predicted_max - r.actual_max), 0) /
            totalChecked) *
            10
        ) / 10
      : 0;

  return {
    place: label,
    totalChecked,
    accurateCount,
    accuracyPercent,
    avgTempErrorC,
    records: rows,
  };
}

export function recordAccuracyCheck(input: {
  place: string;
  lat: number;
  lon: number;
  target_date: string;
  predicted_max: number;
  actual_max: number;
  predicted_rain_prob: number;
  actual_rain_mm: number;
}): AccuracyRecord {
  const tempDiff = Math.abs(input.predicted_max - input.actual_max);
  const predictedRain = input.predicted_rain_prob >= 45;
  const actualRain = input.actual_rain_mm >= 1.0;
  const wasAccurate = tempDiff <= 2.5 && predictedRain === actualRain ? 1 : 0;

  const info = db
    .prepare(
      `INSERT INTO accuracy_records (
        place, lat, lon, target_date, predicted_max, actual_max,
        predicted_rain_prob, actual_rain_mm, was_accurate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.place,
      input.lat,
      input.lon,
      input.target_date,
      input.predicted_max,
      input.actual_max,
      input.predicted_rain_prob,
      input.actual_rain_mm,
      wasAccurate
    );

  return db
    .prepare('SELECT * FROM accuracy_records WHERE id = ?')
    .get(info.lastInsertRowid) as AccuracyRecord;
}
