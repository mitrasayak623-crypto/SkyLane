import React, { useState } from 'react';
import { Loader2, Send, Volume2, VolumeX, Wrench } from 'lucide-react';
import type {
  AgentRecommendResponse,
  EventType,
  ForecastResponse,
  LanguageCode,
} from '../../shared/types';
import { SUPPORTED_LANGUAGES } from '../../server/scoring';

interface AIAgentSectionProps {
  forecast: ForecastResponse | null;
  eventType: EventType;
  language: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  agentResult: AgentRecommendResponse | null;
  onAgentResult: (result: AgentRecommendResponse) => void;
  isSpeaking: boolean;
  onSpeakReply: (text: string, lang: LanguageCode) => void;
  onStopSpeak: () => void;
}

const EXAMPLE_PROMPTS = [
  'Outdoor wedding in Goa, Dec 10–25, evenings — which dates are safest?',
  'Flight from Delhi (DEL) to Goa (GOI) tomorrow morning — any delay risk?',
  'Sightseeing trip in Jaipur next week with family — best days and hours?',
  'Outdoor client dinner in Bengaluru this weekend — do I need a Plan B?',
];

export const AIAgentSection: React.FC<AIAgentSectionProps> = ({
  forecast,
  eventType,
  language,
  onLanguageChange,
  agentResult,
  onAgentResult,
  isSpeaking,
  onSpeakReply,
  onStopSpeak,
}) => {
  const [prompt, setPrompt] = useState(
    'Wedding in Goa, Dec 10-25, evenings, outdoors'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = prompt.trim();
    if (!cleaned) {
      setError('Please enter an event or travel plan to analyze.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cleaned,
          language,
          currentPlace: forecast?.place,
          currentLat: forecast?.lat,
          currentLon: forecast?.lon,
          eventType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate planning recommendation.');
      }

      onAgentResult(data as AgentRecommendResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      id="agent"
      aria-label="Multilingual AI event planning agent"
      className="mt-12 scroll-mt-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111927] p-6 sm:p-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            AI Event Planning Agent
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Describe your plans naturally. The agent calls live forecast, event scoring, air quality, and 10-year climate history tools, then replies in{' '}
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {activeLang.nativeName} ({activeLang.englishName})
            </strong>
            .
          </p>
        </div>

        <div className="shrink-0">
          <label htmlFor="agent-lang-select" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Reply & voice language
          </label>
          <select
            id="agent-lang-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} — {lang.englishName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Indian planning examples */}
      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLE_PROMPTS.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => setPrompt(sample)}
            className="btn-press rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1422] px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:border-[#1D5FD6]/50 hover:text-[#1D5FD6] dark:hover:text-[#7BB8FF] text-left"
          >
            {sample}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-3">
        <label htmlFor="ai-plan-input" className="sr-only">
          Describe your wedding, flight, meeting, or trip plan
        </label>
        <input
          id="ai-plan-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Wedding in Goa, Dec 10–25, evenings, outdoors"
          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1320] px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-press inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D5FD6] hover:bg-[#174EB3] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Checking weather tools…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" aria-hidden="true" />
              Plan in {activeLang.nativeName}
            </>
          )}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900/80 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-800 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      {agentResult && (
        <div
          data-testid="agent-reply-box"
          className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Language: {agentResult.languageName}</span>
              {agentResult.toolsUsed.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                    Tools used:{' '}
                    {Array.from(new Set(agentResult.toolsUsed.map((t) => t.tool))).join(', ')}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                isSpeaking
                  ? onStopSpeak()
                  : onSpeakReply(agentResult.reply, agentResult.language)
              }
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  Stop speaking
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Listen in {agentResult.languageName}
                </>
              )}
            </button>
          </div>

          <div className="mt-4 whitespace-pre-line text-[15px] leading-7 text-slate-800 dark:text-slate-200 max-w-3xl">
            {agentResult.reply}
          </div>
        </div>
      )}
    </section>
  );
};
