export interface Settings {
  low: number;
  high: number;
  chromatic: boolean;
  tolerance: number;
  volume: number;
  gateDbfs: number;
  waveform: 'sine' | 'triangle';
  showNames: boolean;
  theme: 'light' | 'dark';
}

export const defaults: Settings = {
  low: 43, high: 55, chromatic: false, tolerance: 35, volume: 0.5,
  gateDbfs: -50, waveform: 'sine', showNames: true, theme: 'light',
};
const KEY = 'bassline.settings.v1';

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const settings = { ...defaults };
    if (Number.isInteger(raw.low) && Number.isInteger(raw.high) && raw.low! >= 40 && raw.high! <= 60 && raw.low! <= raw.high!) {
      settings.low = raw.low!;
      settings.high = raw.high!;
    }
    if ([15, 25, 35].includes(raw.tolerance!)) settings.tolerance = raw.tolerance!;
    if (Number.isFinite(raw.volume) && raw.volume! >= 0 && raw.volume! <= 1) settings.volume = raw.volume!;
    if (Number.isFinite(raw.gateDbfs) && raw.gateDbfs! >= -70 && raw.gateDbfs! <= -20) settings.gateDbfs = raw.gateDbfs!;
    if (raw.waveform === 'sine' || raw.waveform === 'triangle') settings.waveform = raw.waveform;
    if (raw.theme === 'dark' || raw.theme === 'light') settings.theme = raw.theme;
    if (typeof raw.chromatic === 'boolean') settings.chromatic = raw.chromatic;
    if (typeof raw.showNames === 'boolean') settings.showNames = raw.showNames;
    return settings;
  } catch { return { ...defaults }; }
}

export function saveSettings(settings: Settings): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}
