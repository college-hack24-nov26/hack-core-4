import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { LANGUAGES, type Language } from './speechToText';
import type { useVoiceAssistant } from './useVoiceAssistant';

type Voice = ReturnType<typeof useVoiceAssistant>;

/** Language picker plus read-aloud toggle. The microphone button itself sits next to the text box. */
export function VoiceControls({ voice }: { voice: Voice }) {
  return (
    <div className="flex items-center gap-2 text-xs text-sand-300">
      <label className="flex items-center gap-1">
        <span className="sr-only">Voice language</span>
        <select
          value={voice.lang}
          onChange={(e) => voice.setLang(e.target.value as Language)}
          className="h-8 rounded-lg bg-ink-800 px-2 text-xs text-sand-100 hairline"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      {voice.canSpeak ? (
        <button
          type="button"
          onClick={() => voice.setReadAloud(!voice.readAloud)}
          aria-pressed={voice.readAloud}
          title={voice.readAloud ? 'Stop reading replies aloud' : 'Read replies aloud'}
          className="flex h-8 items-center gap-1 rounded-lg bg-ink-800 px-2 hairline hover:bg-ink-700"
        >
          {voice.readAloud ? <Volume2 size={14} /> : <VolumeX size={14} />}
          Read aloud
        </button>
      ) : (
        <span>Read aloud is not available in this browser.</span>
      )}
    </div>
  );
}

export function MicButton({ voice, disabled }: { voice: Voice; disabled?: boolean }) {
  if (!voice.canListen) return null;
  return (
    <button
      type="button"
      onClick={voice.toggleListening}
      disabled={disabled}
      aria-pressed={voice.listening}
      title={voice.listening ? 'Stop listening' : 'Speak your question'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hairline ${
        voice.listening ? 'bg-accent-500 text-sand-50' : 'bg-ink-800 text-sand-200 hover:bg-ink-700'
      } disabled:opacity-50`}
    >
      {voice.listening ? <MicOff size={18} /> : <Mic size={18} />}
      <span className="sr-only">{voice.listening ? 'Stop listening' : 'Start voice input'}</span>
    </button>
  );
}
