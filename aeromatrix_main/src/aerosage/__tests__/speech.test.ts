import { describe, expect, it } from 'vitest';
import { speechErrorMessage, speechToTextSupported, startListening } from '../speechToText';
import { speakable, speak, textToSpeechSupported } from '../textToSpeech';

describe('speech helpers', () => {
  it('says plainly that a browser without speech support cannot dictate', () => {
    // vitest runs in node: no window, so there is no recogniser and no synthesiser
    expect(speechToTextSupported()).toBe(false);
    expect(startListening('en-IN', { onFinal: () => {}, onError: () => {}, onEnd: () => {} })).toBeNull();
    expect(textToSpeechSupported()).toBe(false);
    expect(speak('hello', 'en-IN')).toBe(false);
  });

  it('turns known recogniser errors into helpful sentences', () => {
    expect(speechErrorMessage('not-allowed')).toMatch(/blocked/);
    expect(speechErrorMessage('no-speech')).toMatch(/did not hear/);
    expect(speechErrorMessage('something-new')).toMatch(/stopped unexpectedly/);
  });

  it('removes symbols and spells units out for the voice', () => {
    expect(speakable('**PM2.5**: 40.1 ug/m3\n- next')).toBe('P M 2.5: 40.1 micrograms per cubic metre next');
  });
});
