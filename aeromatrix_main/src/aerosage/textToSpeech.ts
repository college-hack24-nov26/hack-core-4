/** Reads a reply aloud with the browser's own voices. */

export function textToSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Strips list markers and markdown so the voice does not read symbols out loud. */
export function speakable(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^[\s]*[-*•]\s+/gm, '')
    .replace(/\bug\/m3\b/g, 'micrograms per cubic metre')
    .replace(/\bmg\/m3\b/g, 'milligrams per cubic metre')
    .replace(/\bPM2\.5\b/g, 'P M 2.5')
    .replace(/\bPM10\b/g, 'P M 10')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string, lang: string, onEnd?: () => void): boolean {
  if (!textToSpeechSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.lang = lang;
  const voice = synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (textToSpeechSupported()) window.speechSynthesis.cancel();
}
