import { useCallback, useEffect, useRef, useState } from 'react';
import { startListening, speechToTextSupported, type Language, type Listener } from './speechToText';
import { speak, stopSpeaking, textToSpeechSupported } from './textToSpeech';

export function useVoiceAssistant(onTranscript: (text: string) => void) {
  const [lang, setLang] = useState<Language>('en-IN');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const listener = useRef<Listener | null>(null);
  const cb = useRef(onTranscript);
  cb.current = onTranscript;

  const stopListening = useCallback(() => {
    listener.current?.stop();
    listener.current = null;
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    stopSpeaking();
    setError(null);
    setInterim('');
    const l = startListening(lang, {
      onInterim: setInterim,
      onFinal: (t) => cb.current(t),
      onError: setError,
      onEnd: () => {
        setListening(false);
        setInterim('');
        listener.current = null;
      },
    });
    if (!l) {
      setError('Voice input is not available in this browser. You can still type.');
      return;
    }
    listener.current = l;
    setListening(true);
  }, [lang, listening, stopListening]);

  const say = useCallback(
    (text: string) => {
      if (!readAloud) return;
      setSpeaking(speak(text, lang, () => setSpeaking(false)));
    },
    [lang, readAloud],
  );

  const silence = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  useEffect(
    () => () => {
      listener.current?.stop();
      stopSpeaking();
    },
    [],
  );

  return {
    lang,
    setLang,
    listening,
    interim,
    speaking,
    error,
    readAloud,
    setReadAloud: (on: boolean) => {
      if (!on) silence();
      setReadAloud(on);
    },
    toggleListening,
    say,
    silence,
    canListen: speechToTextSupported(),
    canSpeak: textToSpeechSupported(),
  };
}
