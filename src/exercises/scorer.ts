import { centsFromTarget } from '../music/notes';
import type { PitchFrame } from '../audio/pitch-detector';

export class HoldScorer {
  private lastAt: number | null = null;
  private observations = 0;
  holdMs = 0;
  passed = false;
  readonly requiredMs: number;

  constructor(requiredMs = 800) { this.requiredMs = requiredMs; }

  reset(): void {
    this.lastAt = null;
    this.observations = 0;
    this.holdMs = 0;
    this.passed = false;
  }

  update(frame: PitchFrame, targetHz: number, tolerance: number): boolean {
    if (this.passed) return false;
    const cents = frame.hz === null ? NaN : centsFromTarget(frame.hz, targetHz);
    if (frame.state !== 'voiced' || !Number.isFinite(cents) || Math.abs(cents) > tolerance) {
      this.holdMs = 0;
      this.lastAt = null;
      this.observations = 0;
      return false;
    }
    const dt = this.lastAt === null ? 0 : frame.atMs - this.lastAt;
    if (dt < 0 || dt > 150) {
      this.holdMs = 0;
      this.observations = 0;
    } else if (dt > 0) {
      this.holdMs += Math.min(50, dt);
    }
    // A repeated timestamp never advances the hold or observation guard.
    if (this.lastAt === null || dt > 0) this.observations++;
    this.lastAt = frame.atMs;
    if (this.holdMs >= this.requiredMs && this.observations >= Math.ceil(this.requiredMs / 1000 * 15)) {
      this.passed = true;
      return true;
    }
    return false;
  }
}
