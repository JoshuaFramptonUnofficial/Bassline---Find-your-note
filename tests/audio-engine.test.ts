import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/audio-engine';

class Track extends EventTarget {
  stop = vi.fn();
}

function streamFixture() {
  const track = new Track();
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class Param {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelAndHoldAtTime = vi.fn();
}
class Node {
  connect = vi.fn();
  disconnect = vi.fn();
}
class Gain extends Node { gain = new Param(); }
class Oscillator extends Node {
  frequency = new Param();
  type = 'sine';
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
}
class Context extends EventTarget {
  static instances: Context[] = [];
  sampleRate = 48000;
  currentTime = 0;
  state = 'running';
  destination = new Node();
  oscillators: Oscillator[] = [];
  source = new Node();
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createGain = () => new Gain();
  createMediaStreamSource = () => this.source;
  createAnalyser = () => ({
    fftSize: 4096,
    disconnect: vi.fn(),
    getFloatTimeDomainData: (input: Float32Array) => {
      for (let i = 0; i < input.length; i++) input[i] = 0.2 * Math.sin(2 * Math.PI * 110 * i / this.sampleRate);
    },
  });
  createOscillator = () => { const voice = new Oscillator(); this.oscillators.push(voice); return voice; };
  constructor() { super(); Context.instances.push(this); }
}

const eventMocks = () => ({
  frame: vi.fn<() => void>(), microphone: vi.fn<() => void>(),
  reference: vi.fn<() => void>(), error: vi.fn<() => void>(),
});

describe('audio lifecycle with mock browser audio', () => {
  let engine: AudioEngine;
  let gum: ReturnType<typeof vi.fn>;
  let callbacks: Map<number, FrameRequestCallback>;
  let sequence: number;
  let events: ReturnType<typeof eventMocks>;

  function tick(time: number) {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(time));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Context.instances = [];
    callbacks = new Map();
    sequence = 0;
    gum = vi.fn();
    events = eventMocks();
    vi.stubGlobal('window', { AudioContext: Context, isSecureContext: true });
    vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id); });
    engine = new AudioEngine(events);
  });

  afterEach(() => {
    engine.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops a late-granted stream after the user cancels permission', async () => {
    const request = deferred<MediaStream>();
    gum.mockReturnValue(request.promise);
    const pending = engine.startMicrophone();
    await vi.waitFor(() => expect(gum).toHaveBeenCalledOnce());
    engine.stop();
    const { stream, track } = streamFixture();
    request.resolve(stream);
    await pending;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(engine.hasMicrophone).toBe(false);
    expect(callbacks.size).toBe(0);
  });

  it('retains only the newest microphone request when permissions resolve out of order', async () => {
    const first = deferred<MediaStream>();
    const second = deferred<MediaStream>();
    gum.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const p1 = engine.startMicrophone();
    await vi.waitFor(() => expect(gum).toHaveBeenCalledTimes(1));
    const p2 = engine.startMicrophone();
    await vi.waitFor(() => expect(gum).toHaveBeenCalledTimes(2));
    const a = streamFixture();
    const b = streamFixture();
    second.resolve(b.stream);
    await p2;
    first.resolve(a.stream);
    await p1;
    expect(a.track.stop).toHaveBeenCalledOnce();
    expect(b.track.stop).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(1);
    engine.stop();
    expect(b.track.stop).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
  });

  it('reports denied permission and leaves no capture running', async () => {
    gum.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await engine.startMicrophone();
    expect(events.error).toHaveBeenCalledWith(expect.stringContaining('site settings'));
    expect(events.microphone).toHaveBeenLastCalledWith('off');
    expect(engine.hasMicrophone).toBe(false);
  });

  it('stops on device disconnection', async () => {
    const { stream, track } = streamFixture();
    gum.mockResolvedValue(stream);
    await engine.startMicrophone();
    track.dispatchEvent(new Event('ended'));
    expect(engine.hasMicrophone).toBe(false);
    expect(callbacks.size).toBe(0);
    expect(events.error).toHaveBeenCalledWith(expect.stringContaining('disconnected'));
  });

  it('gates reference playback and the tail before publishing fresh microphone pitch', async () => {
    gum.mockResolvedValue(streamFixture().stream);
    await engine.startMicrophone();
    const context = Context.instances[0];
    context.currentTime = 0.1;
    tick(100);
    expect(events.frame).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'voiced' }));
    await engine.playReference(110, 'sine');
    tick(140);
    expect(events.frame).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'gated', hz: null }));
    context.currentTime = 1.32;
    context.oscillators[0].onended!();
    tick(1500);
    expect(events.frame).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'gated' }));
    context.currentTime = 1.8;
    tick(1900);
    expect(events.frame).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'voiced' }));
    // The capture source is connected only to its analyser, never the destination.
    expect(context.source.connect).not.toHaveBeenCalledWith(context.destination);
  });

  it('ignores an old playback completion after a new reference starts', async () => {
    await engine.playReference(110, 'sine');
    const context = Context.instances[0];
    const oldVoice = context.oscillators[0];
    await engine.playReference(130.81, 'triangle');
    oldVoice.onended!();
    expect(events.reference).toHaveBeenLastCalledWith('playing');
    expect(context.oscillators[1].type).toBe('triangle');
    expect(oldVoice.stop).toHaveBeenCalledTimes(2);
  });

  it('does not suspend a new permission request because of an earlier Stop timer', async () => {
    const initial = streamFixture();
    gum.mockResolvedValueOnce(initial.stream);
    await engine.startMicrophone();
    engine.stop();
    const pendingRequest = deferred<MediaStream>();
    gum.mockReturnValueOnce(pendingRequest.promise);
    const pendingStart = engine.startMicrophone();
    await vi.waitFor(() => expect(gum).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(Context.instances[0].suspend).not.toHaveBeenCalled();
    pendingRequest.resolve(streamFixture().stream);
    await pendingStart;
    expect(engine.hasMicrophone).toBe(true);
  });

  it('reuses one context for references and microphone capture', async () => {
    await engine.playReference(110, 'sine');
    gum.mockResolvedValue(streamFixture().stream);
    await engine.startMicrophone();
    await engine.playReference(220, 'sine');
    expect(Context.instances).toHaveLength(1);
  });
});
