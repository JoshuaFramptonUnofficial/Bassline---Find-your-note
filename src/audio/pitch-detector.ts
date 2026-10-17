import { PitchDetector } from 'pitchy';

export type SignalState = 'voiced' | 'quiet' | 'unclear' | 'clipped' | 'gated';
export interface PitchFrame {
  atMs: number;
  hz: number | null;
  clarity: number;
  dbfs: number;
  state: SignalState;
}

export class VocalDetector {
  readonly size = 4096;
  private detector = PitchDetector.forFloat32Array(this.size);

  analyse(input: Float32Array, sampleRate: number, atMs: number, gateDbfs: number, gated = false): PitchFrame {
    if (input.length !== this.size) throw new Error('Incorrect pitch buffer size.');
    let sum = 0;
    let clippedSamples = 0;
    for (const value of input) {
      sum += value;
      if (Math.abs(value) >= 0.98) clippedSamples++;
    }
    const mean = sum / input.length;
    let energy = 0;
    for (let i = 0; i < input.length; i++) {
      input[i] -= mean;
      energy += input[i] ** 2;
    }
    const dbfs = 20 * Math.log10(Math.max(Math.sqrt(energy / input.length), 1e-6));
    const frame: PitchFrame = { atMs, hz: null, clarity: 0, dbfs, state: 'quiet' };
    if (gated) return { ...frame, state: 'gated' };
    if (clippedSamples / input.length > 0.01) return { ...frame, state: 'clipped' };
    if (dbfs < gateDbfs) return frame;
    const [hz, clarity] = this.detector.findPitch(input, sampleRate);
    if (!Number.isFinite(hz) || !Number.isFinite(clarity) || hz < 65 || hz > 350 || clarity < 0.90) {
      return { ...frame, clarity, state: 'unclear' };
    }
    return { ...frame, hz, clarity, state: 'voiced' };
  }
}
