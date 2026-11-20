/**
 * Skyplan — India Weather & Event-Date Planning Application
 *
 * Connects the live AtmosphericHero, 10-Day Forecast & Event Planner,
 * Multilingual AI Planning Agent (tool-calling + Indian language voice),
 * Flight Airport Check, 10-Year Climate History, Forecast Accuracy Tracker,
 * and SQLite Watched Events + Sudden-Change Voice Alerts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Moon, Sun, Volume2, X } from 'lucide-react';
import type {
  AgentRecommendResponse,
  AirQualityResponse,
  EventRecord,
  EventType,
  ForecastAlert,
  ForecastResponse,
  LanguageCode,
  PlaceResult,
} from '../shared/types';
import { INDIAN_CITIES, summarizeEventPlan } from '../server/scoring';
import { AIAgentSection } from './components/AIAgentSection';
import { AtmosphericHero } from './components/AtmosphericHero';
import { ClimateAndAccuracySection } from './components/ClimateAndAccuracySection';
import { FlightCheckSection } from './components/FlightCheckSection';
import { ForecastPlannerSection } from './components/ForecastPlannerSection';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { WatchedEventsSection } from './components/WatchedEventsSection';
import {
  buildForecastSpeechSummary,
  speakText,
  stopSpeaking,
} from './utils/speech';

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult>(INDIAN_CITIES[0]); // Default: Mumbai
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [airQuality, setAirQuality] = useState<AirQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [eventType, setEventType] = useState<EventType>('wedding');
  const [language, setLanguage] = useState<LanguageCode>('en-IN');
  const [agentResult, setAgentResult] = useState<AgentRecommendResponse | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [alerts, setAlerts] = useState<ForecastAlert[]>([]);
  const [prefilledWatchDate, setPrefilledWatchDate] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  const announcedAlertIdRef = useRef<number | null>(null);

  // Sync theme class on <html>
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem('skyplan-theme', next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  // Fetch forecast & air quality for the selected Indian location
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      lat: String(selectedPlace.lat),
      lon: String(selectedPlace.lon),
      place: selectedPlace.label,
      event_type: eventType,
    });

    Promise.all([
      fetch(`/api/forecast?${qs.toString()}`).then(async (res) => {
        if (!res.ok) throw new Error('Unable to load forecast');
        return (await res.json()) as ForecastResponse;
      }),
      fetch(`/api/air-quality?lat=${selectedPlace.lat}&lon=${selectedPlace.lon}`)
        .then((res) => (res.ok ? (res.json() as Promise<AirQualityResponse>) : null))
        .catch(() => null),
    ])
      .then(([fc, aq]) => {
        if (!active) return;
        setForecast(fc);
        setAirQuality(aq);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || 'Failed to load weather data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPlace.lat, selectedPlace.lon, selectedPlace.label]);

  // Fetch SQLite events and alerts
  const refreshWatchlist = useCallback(async () => {
    try {
      const [evRes, alRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/alerts'),
      ]);
      if (evRes.ok) {
        const evJson = await evRes.json();
        setEvents(evJson.events ?? []);
      }
      if (alRes.ok) {
        const alJson = await alRes.json();
        setAlerts(alJson.alerts ?? []);
      }
    } catch {
      // Offline fallback: keep last loaded state
    }
  }, []);

  useEffect(() => {
    void refreshWatchlist();
  }, [refreshWatchlist]);

  // Compute event-date plan client-side immediately whenever eventType, forecast, or AQI changes
  const plan = useMemo(() => {
    if (!forecast) return null;
    return summarizeEventPlan(forecast.daily, forecast.hourly, eventType, airQuality?.usAqi);
  }, [forecast, eventType, airQuality?.usAqi]);

  // Voice synthesis helpers
  const speak = useCallback((text: string, lang: LanguageCode) => {
    speakText(text, lang, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });
  }, []);

  const handleStopSpeak = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  const handleToggleHeroVoice = () => {
    if (isSpeaking) {
      handleStopSpeak();
      return;
    }
    if (agentResult && agentResult.language === language) {
      speak(agentResult.reply, language);
      return;
    }
    if (forecast && plan) {
      const summary = buildForecastSpeechSummary(forecast, plan, language);
      speak(summary, language);
    }
  };

  // Announce brand-new unread sudden-change alert if browser allows
  const latestUnreadAlert = alerts.find((a) => !a.acknowledged) ?? null;
  useEffect(() => {
    if (latestUnreadAlert && announcedAlertIdRef.current !== latestUnreadAlert.id) {
      announcedAlertIdRef.current = latestUnreadAlert.id;
    }
  }, [latestUnreadAlert]);

  const handleUseGps = () => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setGpsLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lon = Math.round(pos.coords.longitude * 1000) / 1000;
        setSelectedPlace({
          name: 'Your GPS Location',
          state: 'India',
          country: 'India',
          lat,
          lon,
          label: `GPS Location (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
        });
        setGpsLoading(false);
      },
      () => {
        setError('Location permission denied. Search any Indian city or area above.');
        setGpsLoading(false);
      },
      { timeout: 8000 }
    );
  };

  const handleTrackDate = (date: string) => {
    setPrefilledWatchDate(date);
    const el = document.getElementById('watched');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDismissBannerAlert = async (id: number) => {
    await fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' });
    void refreshWatchlist();
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] dark:bg-[#090E17] text-[#0E1726] dark:text-[#F1F5F9] transition-colors">
      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-[#F6F8FB]/90 dark:bg-[#090E17]/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#forecast"
            className="font-display text-xl font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0"
          >
            Skyplan
          </a>

          {/* Zone 2: 5 concise single-line navigation links */}
          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#forecast"
              className="hover:text-[#1D5FD6] dark:hover:text-[#7BB8FF] transition-colors whitespace-nowrap shrink-0"
            >
              Forecast
            </a>
            <a
              href="#planner"
              className="hover:text-[#1D5FD6] dark:hover:text-[#7BB8FF] transition-colors whitespace-nowrap shrink-0"
            >
              Event Planner
            </a>
            <a
              href="#agent"
              className="hover:text-[#1D5FD6] dark:hover:text-[#7BB8FF] transition-colors whitespace-nowrap shrink-0"
            >
              AI Agent
            </a>
            <a
              href="#flights"
              className="hover:text-[#1D5FD6] dark:hover:text-[#7BB8FF] transition-colors whitespace-nowrap shrink-0"
            >
              Flights
            </a>
            <a
              href="#insights"
              className="hover:text-[#1D5FD6] dark:hover:text-[#7BB8FF] transition-colors whitespace-nowrap shrink-0"
            >
              History
            </a>
          </nav>

          {/* Zone 3: Single theme action (plus PWA install only when installable) */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111927] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Top Sudden-Change Alert Strip (surfaces immediately when scheduler catches a forecast swing) */}
        {latestUnreadAlert && (
          <div
            role="alert"
            className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-4 py-3 text-sm text-rose-950 dark:text-rose-100"
          >
            <div className="flex items-center gap-2.5">
              <BellRing className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
              <span>
                <strong>Sudden change alert:</strong> {latestUnreadAlert.place} — {latestUnreadAlert.summary}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  speak(`${latestUnreadAlert.place}. ${latestUnreadAlert.summary}`, language)
                }
                className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap"
              >
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                Speak update
              </button>
              <button
                type="button"
                onClick={() => handleDismissBannerAlert(latestUnreadAlert.id)}
                aria-label="Dismiss sudden change banner"
                className="p-1 text-rose-700 dark:text-rose-300 hover:text-rose-950 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Error feedback banner */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-sm text-amber-950 dark:text-amber-200"
          >
            {error}
          </div>
        )}

        {/* 1. Signature Animated Sky Hero + Live Conditions Strip */}
        <AtmosphericHero
          forecast={forecast}
          airQuality={airQuality}
          loading={loading}
          language={language}
          onLanguageChange={setLanguage}
          onSelectPlace={(p) => setSelectedPlace(p)}
          onUseGps={handleUseGps}
          gpsLoading={gpsLoading}
          isSpeaking={isSpeaking}
          onToggleSpeak={handleToggleHeroVoice}
        />

        {/* 2. 10-Day Forecast Horizontal Strip + Event Suitability Planner + Hourly Window */}
        <ForecastPlannerSection
          forecast={forecast}
          plan={plan}
          eventType={eventType}
          onEventTypeChange={setEventType}
          onTrackDate={handleTrackDate}
        />

        {/* 3. Multilingual AI Planning Agent (Tool-Calling + Indian Languages + Voice) */}
        <AIAgentSection
          forecast={forecast}
          eventType={eventType}
          language={language}
          onLanguageChange={setLanguage}
          agentResult={agentResult}
          onAgentResult={setAgentResult}
          isSpeaking={isSpeaking}
          onSpeakReply={speak}
          onStopSpeak={handleStopSpeak}
        />

        {/* 4. Flight Origin & Destination Airport Weather Check */}
        <FlightCheckSection />

        {/* 5. 10-Year Climate History + SQLite Forecast Accuracy Tracker */}
        <ClimateAndAccuracySection forecast={forecast} />

        {/* 6. Watched Events Watchlist + Telegram & 30-Min Sudden-Change Alerts */}
        <WatchedEventsSection
          forecast={forecast}
          activeEventType={eventType}
          prefilledDate={prefilledWatchDate}
          events={events}
          alerts={alerts}
          onEventsChanged={refreshWatchlist}
          onSpeakAlert={(msg) => speak(msg, language)}
        />
      </main>

      {/* Clean Quiet Footer */}
      <footer className="mt-16 border-t border-slate-200 dark:border-slate-800 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Skyplan — Weather & event-date planning for India. Forecast, ERA5 archive & air quality via Open-Meteo.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#forecast" className="hover:text-slate-900 dark:hover:text-slate-200">
              Top
            </a>
            <a href="#planner" className="hover:text-slate-900 dark:hover:text-slate-200">
              Planner
            </a>
            <a href="#flights" className="hover:text-slate-900 dark:hover:text-slate-200">
              Airports
            </a>
            <a href="#watched" className="hover:text-slate-900 dark:hover:text-slate-200">
              Alerts
            </a>
          </div>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
