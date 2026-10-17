import { describe, expect, it } from 'vitest';
import { HoldScorer } from '../src/exercises/scorer';
import type { PitchFrame } from '../src/audio/pitch-detector';

const frame = (atMs: number, hz: number | null = 110, state: PitchFrame['state'] = 'voiced'): PitchFrame => ({ atMs, hz, state, clarity: 1, dbfs: -20 });

describe('time-based stable hold', () => {
  it('requires a continuous hold and only awards one match', () => {
    const scorer = new HoldScorer();
    for (let t = 0; t < 800; t += 40) expect(scorer.update(frame(t), 110, 35)).toBe(false);
    expect(scorer.update(frame(800), 110, 35)).toBe(true);
    expect(scorer.update(frame(840), 110, 35)).toBe(false);
    expect(scorer.passed).toBe(true);
  });

  it.each(['quiet', 'unclear', 'gated', 'clipped'] as const)('breaks the hold on %s frames', state => {
    const scorer = new HoldScorer();
    for (let t = 0; t <= 400; t += 40) scorer.update(frame(t), 110, 35);
    scorer.update(frame(440, null, state), 110, 35);
    expect(scorer.holdMs).toBe(0);
    for (let t = 480; t <= 1000; t += 40) scorer.update(frame(t), 110, 35);
    expect(scorer.passed).toBe(false);
  });

  it('does not snap an octave or wrong note to the target', () => {
    const scorer = new HoldScorer();
    for (let t = 0; t <= 2000; t += 40) scorer.update(frame(t, 220), 110, 35);
    expect(scorer.holdMs).toBe(0);
    expect(scorer.passed).toBe(false);
  });

  it('rejects stalled and repeated timestamps instead of crediting missing time', () => {
    const scorer = new HoldScorer();
    scorer.update(frame(0), 110, 35);
    scorer.update(frame(40), 110, 35);
    for (let i = 0; i < 100; i++) scorer.update(frame(40), 110, 35);
    expect(scorer.holdMs).toBe(40);
    scorer.update(frame(1000), 110, 35);
    expect(scorer.holdMs).toBe(0);
    expect(scorer.passed).toBe(false);
  });

  it('resets a completed result for a new attempt', () => {
    const scorer = new HoldScorer();
    for (let t = 0; t <= 1000; t += 40) scorer.update(frame(t), 110, 35);
    scorer.reset();
    expect(scorer.passed).toBe(false);
    expect(scorer.holdMs).toBe(0);
  });
});
