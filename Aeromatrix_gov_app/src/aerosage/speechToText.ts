/** Thin wrapper over the browser's speech recognition. Nothing is recorded or sent by this app; the browser does the recognising. */

interface RecognitionResultItem {
  transcript: string;
}
interface RecognitionEventLike {
  results: ArrayLike<ArrayLike<RecognitionResultItem> & { isFinal: boolean }>;
  resultIndex: number;
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechToTextSupported(): boolean {
  return recognitionCtor() !== null;
}

export const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'mr-IN', label: 'मराठी' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in the browser to dictate.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in the browser to dictate.',
  'no-speech': 'I did not hear anything. Try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a network connection in this browser.',
  'language-not-supported': 'This browser cannot recognise that language.',
};

export function speechErrorMessage(code: string): string {
  return ERRORS[code] ?? 'Speech recognition stopped unexpectedly.';
}

export interface Listener {
  stop(): void;
}

export interface ListenHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** Starts one dictation. Returns null when the browser has no speech recognition. */
export function startListening(lang: Language, h: ListenHandlers): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!;
      const t = r[0]?.transcript ?? '';
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    if (interim) h.onInterim?.(interim);
  };
  rec.onerror = (e) => h.onError(speechErrorMessage(e.error));
  rec.onend = () => {
    if (finalText.trim()) h.onFinal(finalText.trim());
    h.onEnd();
  };
  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}
