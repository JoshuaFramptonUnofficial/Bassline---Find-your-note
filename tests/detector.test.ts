import { describe, expect, it } from 'vitest';
import { VocalDetector } from '../src/audio/pitch-detector';
import { centsFromTarget, midiToHz } from '../src/music/notes';

function tone(hz: number, sampleRate: number, harmonic = false, amplitude = 0.2): Float32Array {
  return Float32Array.from({ length: 4096 }, (_, i) => {
    const phase = 2 * Math.PI * hz * i / sampleRate;
    return amplitude * (Math.sin(phase) + (harmonic ? 1.6 * Math.sin(phase * 2) + 0.7 * Math.sin(phase * 3) : 0));
  });
}

describe.each([44100, 48000])('bass detection at %i Hz sample rate', sampleRate => {
  it.each([40, 45, 50, 55, 60])('tracks MIDI %i within ten cents on clean and harmonic-rich input', midi => {
    for (const harmonic of [false, true]) {
      const detector = new VocalDetector();
      const hz = midiToHz(midi);
      const frame = detector.analyse(tone(hz, sampleRate, harmonic), sampleRate, 0, -50);
      expect(frame.state).toBe('voiced');
      expect(Math.abs(centsFromTarget(frame.hz!, hz))).toBeLessThan(10);
    }
  });

  it('rejects silence, very quiet signal, clipping, and playback-gated input', () => {
    const detector = new VocalDetector();
    expect(detector.analyse(new Float32Array(4096), sampleRate, 0, -50).state).toBe('quiet');
    expect(detector.analyse(tone(110, sampleRate, false, 0.0001), sampleRate, 0, -50).hz).toBeNull();
    const clipped = tone(110, sampleRate, false, 2).map(value => Math.max(-1, Math.min(1, value)));
    expect(detector.analyse(clipped, sampleRate, 0, -50).state).toBe('clipped');
    expect(detector.analyse(tone(110, sampleRate), sampleRate, 0, -50, true).state).toBe('gated');
  });

  it('rejects deterministic broadband noise and removes DC offset', () => {
    const detector = new VocalDetector();
    let seed = 42;
    const noise = Float32Array.from({ length: 4096 }, () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return (seed / 2 ** 32 - 0.5) * 0.25;
    });
    expect(detector.analyse(noise, sampleRate, 0, -50).hz).toBeNull();
    const offset = tone(110, sampleRate).map(value => value + 0.2);
    expect(detector.analyse(offset, sampleRate, 0, -50).hz).toBeCloseTo(110, 0);
  });
});
