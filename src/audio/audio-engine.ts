import { VocalDetector } from './pitch-detector';
import type { PitchFrame } from './pitch-detector';

export type MicState = 'off' | 'requesting' | 'on';
export type ReferenceState = 'idle' | 'playing' | 'cooldown';
interface AudioEvents {
  frame: (frame: PitchFrame) => void;
  microphone: (state: MicState) => void;
  reference: (state: ReferenceState) => void;
  error: (message: string) => void;
}

export function describeAudioError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Microphone access was blocked. Allow it in your browser’s site settings, then try again.';
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'That microphone is unavailable. Connect an input or choose the default microphone.';
    if (error.name === 'NotReadableError') return 'Your microphone is busy or unavailable. Check other audio apps, then try again.';
  }
  return error instanceof Error ? error.message : 'Audio could not start. Check your input and try again.';
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frameId = 0;
  private captureRevision = 0;
  private referenceRevision = 0;
  private tailTimer: ReturnType<typeof setTimeout> | undefined;
  private voice: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private listenAfter = 0;
  private volume = 0.5;
  private events: AudioEvents;
  gateDbfs = -50;

  constructor(events: AudioEvents) { this.events = events; }

  get hasMicrophone(): boolean { return this.stream !== null; }

  private async enable(): Promise<AudioContext> {
    if (!window.AudioContext) throw new Error('This browser does not support Web Audio. Try a current desktop or mobile browser.');
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
      this.context.addEventListener('statechange', () => {
        if (this.stream && this.context?.state !== 'running') {
          this.stop();
          this.events.error('Audio was interrupted. Start the microphone again when you’re ready.');
        }
      });
    }
    // Called immediately from a user gesture, before waiting for permission.
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio is paused. Tap the audio control again to resume.');
    return this.context;
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
  }

  async startMicrophone(deviceId = ''): Promise<void> {
    this.stopMicrophone();
    const revision = this.captureRevision;
    this.events.microphone('requesting');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access needs desktop localhost or a trusted HTTPS address. Reference playback still works.');
      }
      const context = await this.enable();
      if (revision !== this.captureRevision) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (revision !== this.captureRevision) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser();
      const detector = new VocalDetector();
      this.analyser.fftSize = detector.size;
      this.source.connect(this.analyser); // Never monitor the microphone aloud.
      const input = new Float32Array(detector.size);
      const analyser = this.analyser;
      this.listenAfter = Math.max(this.listenAfter, context.currentTime + detector.size / context.sampleRate);
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (revision !== this.captureRevision) return;
        this.stop();
        this.events.error('Microphone disconnected. Choose an available input and start again.');
      }, { once: true }));
      this.events.microphone('on');
      let nextAnalysis = 0;
      const tick = (atMs: number) => {
        if (revision !== this.captureRevision) return;
        try {
          if (atMs >= nextAnalysis) {
            nextAnalysis = atMs + 1000 / 30 - 2;
            analyser.getFloatTimeDomainData(input);
            const gated = context.state !== 'running' || this.voice !== null || context.currentTime < this.listenAfter;
            this.events.frame(detector.analyse(input, context.sampleRate, atMs, this.gateDbfs, gated));
          }
          if (revision === this.captureRevision) this.frameId = requestAnimationFrame(tick);
        } catch (error) {
          this.stop();
          this.events.error(describeAudioError(error));
        }
      };
      this.frameId = requestAnimationFrame(tick);
    } catch (error) {
      if (revision !== this.captureRevision) return;
      this.stopMicrophone();
      this.events.error(describeAudioError(error));
    }
  }

  stopMicrophone(): void {
    this.captureRevision++;
    cancelAnimationFrame(this.frameId);
    this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.events.microphone('off');
  }

  async devices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
  }

  async playReference(hz: number, type: 'sine' | 'triangle'): Promise<void> {
    this.cancelReference();
    const revision = this.referenceRevision;
    try {
      if (!Number.isFinite(hz) || hz < 65 || hz > 350) throw new Error('Reference pitch is outside the practice range.');
      const context = await this.enable();
      if (revision !== this.referenceRevision) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + 0.015;
      const end = start + 1.2;
      oscillator.type = type;
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.24, start + 0.025);
      gain.gain.setValueAtTime(0.24, end - 0.08);
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain);
      gain.connect(this.master!);
      this.voice = { oscillator, gain };
      this.listenAfter = end + 0.25 + 4096 / context.sampleRate;
      this.events.reference('playing');
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (revision !== this.referenceRevision) return;
        this.voice = null;
        this.events.reference('cooldown');
        this.tailTimer = setTimeout(() => {
          if (revision === this.referenceRevision) this.events.reference('idle');
        }, Math.max(0, (this.listenAfter - context.currentTime) * 1000));
      };
      oscillator.start(start);
      oscillator.stop(end);
    } catch (error) {
      if (revision !== this.referenceRevision) return;
      this.cancelReference();
      this.events.error(describeAudioError(error));
    }
  }

  cancelReference(): void {
    this.referenceRevision++;
    clearTimeout(this.tailTimer);
    if (this.voice && this.context) {
      const { oscillator, gain } = this.voice;
      const now = this.context.currentTime;
      gain.gain.cancelAndHoldAtTime(now);
      gain.gain.linearRampToValueAtTime(0, now + 0.02);
      oscillator.stop(now + 0.025);
      this.listenAfter = now + 0.3 + 4096 / this.context.sampleRate;
      this.voice = null;
    }
    this.events.reference('idle');
  }

  stop(): void {
    this.stopMicrophone();
    this.cancelReference();
    // Fade scheduled cancellation before suspending the audio clock.
    const revision = this.referenceRevision;
    const captureRevision = this.captureRevision;
    setTimeout(() => {
      if (revision === this.referenceRevision && captureRevision === this.captureRevision && !this.stream && this.context?.state === 'running') {
        void this.context.suspend().catch(() => undefined);
      }
    }, 50);
  }

  dispose(): void {
    this.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close();
  }
}
