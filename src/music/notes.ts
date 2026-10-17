const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const KEYS = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
export const MIN_MIDI = 40;
export const MAX_MIDI = 60;

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function hzToMidi(hz: number): number {
  return Number.isFinite(hz) && hz > 0 ? 69 + 12 * Math.log2(hz / 440) : NaN;
}

export function centsFromTarget(hz: number, targetHz: number): number {
  return Number.isFinite(hz) && hz > 0 && targetHz > 0
    ? 1200 * Math.log2(hz / targetHz) : NaN;
}

export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function noteKey(midi: number): string {
  return `${KEYS[midi % 12]}/${Math.floor(midi / 12) - 1}`;
}

export function notePool(low: number, high: number, chromatic = false): number[] {
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < MIN_MIDI ||
      high > MAX_MIDI || low > high) return [];
  return Array.from({ length: high - low + 1 }, (_, i) => i + low)
    .filter(midi => chromatic || !KEYS[midi % 12].includes('#'));
}

export function nextNote(pool: number[], current: number, random = Math.random): number {
  if (!pool.length) throw new Error('Choose a range containing at least one note.');
  const others = pool.filter(midi => midi !== current);
  if (!others.length) return pool[0];
  // Prefer recognisable thirds, fourths, and fifths when the range allows them.
  const spaced = others.filter(midi => Math.abs(midi - current) >= 3 && Math.abs(midi - current) <= 7);
  const choices = spaced.length ? spaced : others;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
