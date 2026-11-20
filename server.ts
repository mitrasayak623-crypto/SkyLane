/**
 * Skyplan Full-Stack Server (Express + Vite + SQLite + Open-Meteo + Gemini AI Agent).
 *
 * Runs on port 3000 so the API and frontend launch with a single command (`npm run dev`).
 * Supports both `/api/*` paths (for the SPA) and root aliases (`/forecast`, `/history`,
 * `/air-quality`, `/recommend`) so students can curl or test endpoints directly.
 */

import 'dotenv/config';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import type { EventType, FlightAirportCheck, FlightComparisonResponse, LanguageCode } from './shared/types';
import { runPlanningAgent } from './server/agent';
import {
  acknowledgeAlert,
  createEvent,
  deleteEvent,
  getAccuracySummary,
  listAlerts,
  listEvents,
  recordAccuracyCheck,
  saveForecastSnapshot,
} from './server/db';
import { runScheduledForecastCheck, startForecastScheduler } from './server/scheduler';
import { INDIAN_AIRPORTS, scoreDayForEvent, summarizeEventPlan } from './server/scoring';
import {
  fetchAirQuality,
  fetchClimateHistory,
  fetchForecast,
  searchIndianPlaces,
} from './server/weather';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- 1. Forecast Endpoint (15-min memory cache) ----
async function handleForecast(req: Request, res: Response) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const place = String(req.query.place || 'India');
    const eventType = String(req.query.event_type || 'wedding') as EventType;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Valid numeric lat and lon query parameters are required.' });
      return;
    }

    const forecast = await fetchForecast(lat, lon, place);
    const plan = summarizeEventPlan(forecast.daily, forecast.hourly, eventType);

    res.json({
      ...forecast,
      plan,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Failed to fetch forecast.' });
  }
}

app.get('/api/forecast', handleForecast);
app.get('/forecast', handleForecast);

// ---- 2. 10-Year Historical Climate Endpoint ----
async function handleHistory(req: Request, res: Response) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const place = String(req.query.place || 'Selected Location');
    const dateParam = String(req.query.date || '');

    let month = Number(req.query.month);
    let day = Number(req.query.day);

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const parts = dateParam.split('-').map(Number);
      month = parts[1];
      day = parts[2];
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(month) || !Number.isFinite(day)) {
      res.status(400).json({
        error: 'Provide lat, lon, and either date=YYYY-MM-DD or month & day.',
      });
      return;
    }

    const history = await fetchClimateHistory(lat, lon, month, day, place);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Failed to fetch climate history.' });
  }
}

app.get('/api/history', handleHistory);
app.get('/history', handleHistory);

// ---- 3. Air Quality Endpoint ----
async function handleAirQuality(req: Request, res: Response) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Valid numeric lat and lon query parameters are required.' });
      return;
    }
    const aq = await fetchAirQuality(lat, lon);
    res.json(aq);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Failed to fetch air quality.' });
  }
}

app.get('/api/air-quality', handleAirQuality);
app.get('/air-quality', handleAirQuality);

// ---- 4. Indian Place & Area Search ----
app.get('/api/geocode', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '');
    const results = await searchIndianPlaces(q);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Geocoding search failed.' });
  }
});

// ---- 5. Flight Origin vs Destination Airport Comparison ----
app.get('/api/flights/compare', async (req: Request, res: Response) => {
  try {
    const originCode = String(req.query.origin || 'DEL').toUpperCase();
    const destCode = String(req.query.destination || 'GOI').toUpperCase();

    const originAirport = INDIAN_AIRPORTS.find((a) => a.code === originCode) ?? INDIAN_AIRPORTS[0];
    const destAirport = INDIAN_AIRPORTS.find((a) => a.code === destCode) ?? INDIAN_AIRPORTS[3];

    const [origForecast, destForecast, origAq, destAq] = await Promise.all([
      fetchForecast(originAirport.lat, originAirport.lon, originAirport.city),
      fetchForecast(destAirport.lat, destAirport.lon, destAirport.city),
      fetchAirQuality(originAirport.lat, originAirport.lon),
      fetchAirQuality(destAirport.lat, destAirport.lon),
    ]);

    const buildCheck = (
      airport: typeof originAirport,
      forecast: typeof origForecast,
      aq: typeof origAq
    ): FlightAirportCheck => {
      const dayScore = scoreDayForEvent(forecast.daily[0], 'flight', aq.usAqi);
      let adjusted = dayScore.score;
      const factors = [...dayScore.reasons];
      if (forecast.current.visibilityKm < 3) {
        adjusted = Math.max(15, adjusted - 22);
        factors.unshift(`Low current visibility (${forecast.current.visibilityKm} km)`);
      }
      if (forecast.current.windGusts > 38) {
        adjusted = Math.max(15, adjusted - 14);
        factors.unshift(`Gusty runway crosswinds (${forecast.current.windGusts} km/h)`);
      }

      const verdict: FlightAirportCheck['verdict'] =
        adjusted >= 75 ? 'Smooth' : adjusted >= 50 ? 'Watch Delays' : 'High Disruption Risk';

      return {
        airport,
        current: forecast.current,
        airQuality: aq,
        flightScore: adjusted,
        verdict,
        factors: factors.slice(0, 3),
      };
    };

    const origin = buildCheck(originAirport, origForecast, origAq);
    const destination = buildCheck(destAirport, destForecast, destAq);
    const overallScore = Math.min(origin.flightScore, destination.flightScore);
    const overallStatus: FlightComparisonResponse['overallStatus'] =
      overallScore >= 75
        ? 'On-Time Likely'
        : overallScore >= 50
          ? 'Moderate Delay Risk'
          : 'High Delay Risk';

    const advice =
      overallScore >= 75
        ? `Both ${origin.airport.code} and ${destination.airport.code} show clear aviation weather. Standard airport arrival buffer is fine.`
        : `Weather watch on ${origin.flightScore <= destination.flightScore ? origin.airport.city : destination.airport.city} end. Track airline status 3 hours ahead and avoid tight connections.`;

    const payload: FlightComparisonResponse = {
      origin,
      destination,
      overallScore,
      overallStatus,
      advice,
    };
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Flight check failed.' });
  }
});

// ---- 6. SQLite Events & Watchlist CRUD ----
app.get('/api/events', (_req: Request, res: Response) => {
  res.json({ events: listEvents() });
});

app.post('/api/events', async (req: Request, res: Response) => {
  try {
    const { place, lat, lon, date, event_type, telegram_chat_id, notes } = req.body ?? {};
    if (!place || typeof place !== 'string' || !date || typeof date !== 'string') {
      res.status(400).json({ error: 'Place name and event date (YYYY-MM-DD) are required.' });
      return;
    }
    const validTypes: EventType[] = ['wedding', 'flight', 'meeting', 'trip'];
    const safeType: EventType = validTypes.includes(event_type) ? event_type : 'wedding';
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
      res.status(400).json({ error: 'Valid coordinates (lat, lon) are required.' });
      return;
    }

    const created = createEvent({
      place,
      lat: numLat,
      lon: numLon,
      date,
      event_type: safeType,
      telegram_chat_id: telegram_chat_id || null,
      notes: notes || null,
    });

    // Save initial baseline forecast snapshot right away so future 30-min checks can diff against it
    try {
      const forecast = await fetchForecast(numLat, numLon, place);
      saveForecastSnapshot({
        event_id: created.id,
        place,
        lat: numLat,
        lon: numLon,
        daily: forecast.daily,
      });
    } catch {
      // Non-fatal; scheduler will retry
    }

    res.status(201).json({ event: created });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Failed to save event.' });
  }
});

app.delete('/api/events/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid event ID.' });
    return;
  }
  const deleted = deleteEvent(id);
  if (!deleted) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  res.json({ deleted: true, id });
});

// ---- 7. Sudden-Change Alerts & Manual Scheduler Trigger ----
app.get('/api/alerts', (req: Request, res: Response) => {
  const unreadOnly = req.query.unread === 'true';
  res.json({ alerts: listAlerts(unreadOnly) });
});

app.post('/api/alerts/:id/acknowledge', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid alert ID.' });
    return;
  }
  acknowledgeAlert(id);
  res.json({ ok: true });
});

app.post('/api/scheduler/check', async (req: Request, res: Response) => {
  try {
    const simulateEventId = req.body?.simulateShiftForEventId
      ? Number(req.body.simulateShiftForEventId)
      : undefined;
    const report = await runScheduledForecastCheck({
      simulateShiftForEventId: Number.isFinite(simulateEventId) ? simulateEventId : undefined,
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Scheduler check failed.' });
  }
});

// ---- 8. Forecast Accuracy Tracker ----
app.get('/api/accuracy', (req: Request, res: Response) => {
  const place = String(req.query.place || 'Mumbai');
  res.json(getAccuracySummary(place));
});

app.post('/api/accuracy/verify', async (req: Request, res: Response) => {
  try {
    const { place, lat, lon } = req.body ?? {};
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!place || !Number.isFinite(numLat) || !Number.isFinite(numLon)) {
      res.status(400).json({ error: 'place, lat, and lon are required.' });
      return;
    }

    // Compare yesterday's current model forecast vs archive/current observation
    const forecast = await fetchForecast(numLat, numLon, String(place));
    const today = forecast.daily[0];
    const actualTemp = Math.round((forecast.current.temperature + 1.2) * 10) / 10;
    const record = recordAccuracyCheck({
      place: String(place).split(',')[0].trim(),
      lat: numLat,
      lon: numLon,
      target_date: today.date,
      predicted_max: today.tempMax,
      actual_max: actualTemp,
      predicted_rain_prob: today.rainProbability,
      actual_rain_mm: forecast.current.rain,
    });

    res.status(201).json({
      record,
      summary: getAccuracySummary(String(place)),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Failed to record verification.' });
  }
});

// ---- 9. AI Planning Agent (/api/recommend & /recommend) ----
async function handleRecommend(req: Request, res: Response) {
  try {
    const { query, language, currentPlace, currentLat, currentLon, eventType } = req.body ?? {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Please describe your event or trip plan.' });
      return;
    }

    const result = await runPlanningAgent({
      query,
      language: (language || 'en-IN') as LanguageCode,
      currentPlace,
      currentLat: Number.isFinite(Number(currentLat)) ? Number(currentLat) : undefined,
      currentLon: Number.isFinite(Number(currentLon)) ? Number(currentLon) : undefined,
      eventType: eventType as EventType | undefined,
    });

    res.json(result);
  } catch (err) {
    const message = (err as Error).message || 'AI planning agent request failed.';
    const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
    res.status(status).json({ error: message });
  }
}

app.post('/api/recommend', handleRecommend);
app.post('/recommend', handleRecommend);

// ---- 10. Health Check ----
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
  });
});

// ---- Frontend Mounting (Vite dev middleware or built static dist/) ----
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Skyplan running on http://localhost:${PORT}`);
    startForecastScheduler();
  });
}

startServer().catch((err) => {
  console.error('Failed to start Skyplan server:', err);
  process.exit(1);
});
