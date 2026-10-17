import { describe, expect, it } from 'vitest';
import { centsFromTarget, hzToMidi, midiToHz, nextNote, noteName, notePool } from '../src/music/notes';

describe('bass notes', () => {
  it('uses the exact octave and standard tuning', () => {
    expect(midiToHz(40)).toBeCloseTo(82.4069, 4);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 4);
    expect(noteName(40)).toBe('E2');
    expect(noteName(60)).toBe('C4');
    expect(hzToMidi(110)).toBeCloseTo(45, 7);
    expect(centsFromTarget(220, 110)).toBeCloseTo(1200);
    expect(centsFromTarget(110 * 2 ** (-25 / 1200), 110)).toBeCloseTo(-25);
    expect(hzToMidi(0)).toBeNaN();
  });

  it('respects the range and accidental selection', () => {
    expect(notePool(43, 48)).toEqual([43, 45, 47, 48]);
    expect(notePool(40, 60, true)).toHaveLength(21);
    expect(notePool(60, 40)).toEqual([]);
    expect(notePool(39, 60)).toEqual([]);
    expect(notePool(41.5, 60)).toEqual([]);
    expect(notePool(42, 42)).toEqual([]);
  });

  it('avoids repeats and favours distinct intervals without leaving the pool', () => {
    const pool = notePool(43, 55);
    for (const random of [0, 0.2, 0.5, 0.9]) {
      const next = nextNote(pool, 48, () => random);
      expect(pool).toContain(next);
      expect(Math.abs(next - 48)).toBeGreaterThanOrEqual(3);
      expect(Math.abs(next - 48)).toBeLessThanOrEqual(7);
    }
    expect(nextNote([40], 40)).toBe(40);
  });
});
