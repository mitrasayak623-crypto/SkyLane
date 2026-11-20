/**
 * Web Speech API voice helper supporting all 11 Indian languages in Skyplan.
 * Automatically picks the closest installed voice matching the user's BCP-47 language code.
 */

import type { EventPlanSummary, ForecastResponse, LanguageCode } from '../../shared/types';

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function pickVoiceForLanguage(langCode: LanguageCode): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const exact = voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase());
  if (exact) return exact;

  const baseLang = langCode.split('-')[0].toLowerCase();
  const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(baseLang));
  if (prefix) return prefix;

  const indianEnglish = voices.find((v) => v.lang.toLowerCase() === 'en-in');
  return indianEnglish ?? voices[0] ?? null;
}

export function speakText(
  text: string,
  langCode: LanguageCode,
  callbacks?: { onStart?: () => void; onEnd?: () => void; onError?: (msg: string) => void }
): boolean {
  if (!isSpeechSupported()) {
    callbacks?.onError?.('Voice readout is not supported in this browser.');
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = langCode;
  utterance.rate = 0.96;
  utterance.pitch = 1.0;

  const voice = pickVoiceForLanguage(langCode);
  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => callbacks?.onStart?.();
  utterance.onend = () => callbacks?.onEnd?.();
  utterance.onerror = () => callbacks?.onEnd?.();

  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Builds a concise spoken weather & event briefing in the active language.
 * When an AI-generated reply exists in the selected language, the app prefers reading that aloud.
 */
export function buildForecastSpeechSummary(
  forecast: ForecastResponse,
  plan: EventPlanSummary,
  langCode: LanguageCode
): string {
  const temp = Math.round(forecast.current.temperature);
  const feels = Math.round(forecast.current.feelsLike);
  const top = plan.bestDays[0];

  if (langCode === 'hi-IN') {
    return `${forecast.place} में अभी तापमान ${temp} डिग्री सेल्सियस है, महसूस ${feels} डिग्री हो रहा है और मौसम ${forecast.current.conditionLabel} है। आपकी योजना के लिए सबसे अच्छा दिन ${top ? top.date : 'आज'} है, जिसका स्कोर 100 में से ${top ? top.score : 80} है। ${plan.planBRule}`;
  }
  if (langCode === 'ta-IN') {
    return `${forecast.place} நகரில் தற்போது வெப்பநிலை ${temp} டிகிரி செல்சியஸ். உங்கள் நிகழ்வுக்கு மிகச் சிறந்த நாள் ${top ? top.date : 'இன்று'}, மதிப்பெண் ${top ? top.score : 80}.`;
  }
  if (langCode === 'bn-IN') {
    return `${forecast.place}-এ এখন তাপমাত্রা ${temp} ডিগ্রি সেলসিয়াস। আপনার পরিকল্পনার জন্য সবচেয়ে ভালো দিন ${top ? top.date : 'আজ'}, স্কোর ১০০-এর মধ্যে ${top ? top.score : 80}।`;
  }
  if (langCode === 'mr-IN') {
    return `${forecast.place} येथे सध्या तापमान ${temp} अंश सेल्सिअस आहे. तुमच्या कार्यक्रमासाठी सर्वोत्तम दिवस ${top ? top.date : 'आज'} आहे, गुण ${top ? top.score : 80}.`;
  }
  if (langCode === 'kn-IN') {
    return `${forecast.place} ನಲ್ಲಿ ಈಗ ತಾಪಮಾನ ${temp} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್ ಇದೆ. ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ಉತ್ತಮ ದಿನ ${top ? top.date : 'ಇಂದು'}, ಅಂಕ ${top ? top.score : 80}.`;
  }
  if (langCode === 'te-IN') {
    return `${forecast.place} లో ప్రస్తుతం ఉష్ణోగ్రత ${temp} డిగ్రీల సెల్సియస్ ఉంది. మీ ఈవెంట్‌కు ఉత్తమ రోజు ${top ? top.date : 'ఈరోజు'}, స్కోర్ ${top ? top.score : 80}.`;
  }
  if (langCode === 'gu-IN') {
    return `${forecast.place} માં હાલ તાપમાન ${temp} ડિગ્રી સેલ્સિયસ છે. તમારા પ્રસંગ માટે શ્રેષ્ઠ દિવસ ${top ? top.date : 'આજે'} છે, સ્કોર ${top ? top.score : 80}.`;
  }
  if (langCode === 'pa-IN') {
    return `${forecast.place} ਵਿੱਚ ਇਸ ਵੇਲੇ ਤਾਪਮਾਨ ${temp} ਡਿਗਰੀ ਸੈਲਸੀਅਸ ਹੈ। ਤੁਹਾਡੇ ਸਮਾਗਮ ਲਈ ਸਭ ਤੋਂ ਵਧੀਆ ਦਿਨ ${top ? top.date : 'ਅੱਜ'} ਹੈ, ਸਕੋਰ ${top ? top.score : 80}।`;
  }
  if (langCode === 'ml-IN') {
    return `${forecast.place} പ്രദേശത്ത് ഇപ്പോൾ താപനില ${temp} ഡിഗ്രി സെൽഷ്യസ് ആണ്. നിങ്ങളുടെ പരിപാടിക്ക് ഏറ്റവും നല്ല ദിവസം ${top ? top.date : 'ഇന്ന്'}, സ്കോർ ${top ? top.score : 80}.`;
  }
  if (langCode === 'or-IN') {
    return `${forecast.place} ରେ ବର୍ତ୍ତମାନ ତାପମାତ୍ରା ${temp} ଡିଗ୍ରୀ ସେଲସିୟସ୍ ଅଛି। ଆପଣଙ୍କ କାର୍ଯ୍ୟକ୍ରମ ପାଇଁ ସର୍ବୋତ୍ତମ ଦିନ ${top ? top.date : 'ଆଜି'}, ସ୍କୋର ${top ? top.score : 80}।`;
  }

  return `In ${forecast.place}, it is currently ${temp} degrees Celsius, feels like ${feels}, with ${forecast.current.conditionLabel.toLowerCase()}. ${plan.headline} Plan B tip: ${plan.planBRule}`;
}
