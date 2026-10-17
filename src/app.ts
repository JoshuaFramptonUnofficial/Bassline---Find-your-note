import { AudioEngine } from './audio/audio-engine';
import type { MicState, ReferenceState } from './audio/audio-engine';
import type { PitchFrame } from './audio/pitch-detector';
import { HoldScorer } from './exercises/scorer';
import { centsFromTarget, hzToMidi, midiToHz, nextNote, noteName, notePool } from './music/notes';
import { renderNotation } from './music/notation';
import { readSettings, saveSettings } from './storage/settings';
import { icon } from './ui/icons';
import { setToleranceArc, tunerMarkup } from './ui/tuner';

export function createApp(root: HTMLElement): () => void {
  let settings = readSettings();
  let pool = notePool(settings.low, settings.high, settings.chromatic);
  if (!pool.length) { settings.low = 43; settings.high = 55; pool = notePool(43, 55); }
  let target = pool.includes(48) ? 48 : pool[0];
  let micState: MicState = 'off';
  let referenceState: ReferenceState = 'idle';
  let cardNumber = 1;
  let matched = 0;
  let lastDraw = 0;
  let recentCents: number[] = [];
  let previousPitchAt = 0;
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  let liveKey = '';
  let selectedDevice = '';
  let deviceRevision = 0;
  let disposed = false;
  let calibration: { stage: 'noise' | 'voice'; startAt: number; noise: number[]; voice: number[]; oldGate: number } | null = null;
  const scorer = new HoldScorer();

  root.innerHTML = `
    <a class="skip-link" href="#practice">Skip to practice</a>
    <header class="site-header">
      <a class="brand" href="./" aria-label="Bassline home"><span class="brand-mark">${icon('fork')}</span><span>bassline<span class="brand-dot">.</span></span></a>
      <span class="brand-description">A little closer, every note.</span>
      <div class="header-right"><span class="local-badge"><span></span> YOUR PERSONAL PRACTICE SPACE</span><button class="icon-button" id="theme-toggle" aria-label="Switch to dark mode">${icon('moon')}</button></div>
    </header>
    <main class="app-main" id="practice">
      <section class="intro" aria-labelledby="page-title">
        <div><p class="eyebrow">LISTEN. SING. FIND YOUR CENTRE.</p><h1 id="page-title">Find your note.</h1><p class="intro-copy">A moment to listen. A breath to match. Make room for practice.</p></div>
        <div class="intro-actions"><button class="text-button" id="help-open">${icon('help')} How it works</button><button class="button button-outline" id="settings-open">${icon('sliders')} Practice settings</button></div>
      </section>
      <div id="error-banner" class="error-banner" role="alert" hidden><span id="error-text"></span><button id="error-dismiss" class="icon-button" aria-label="Dismiss message">${icon('close')}</button></div>
      <div class="practice-toolbar">
        <div class="practice-mode"><span class="mode-dot"></span> Free practice <span class="toolbar-divider"></span><span class="muted">Bass clef</span></div>
        <div class="toolbar-details"><span id="range-label">G2–G3</span><span class="toolbar-divider"></span><span id="tolerance-label">±35 cents</span><span class="toolbar-divider"></span><span>A4 = 440 Hz</span></div>
      </div>
      <div class="practice-grid">
        <section class="target-card panel" aria-labelledby="target-heading">
          <div class="panel-top"><h2 id="target-heading"><span class="section-number">01</span> THE REFERENCE</h2><span class="card-index" id="card-index">NOTE 01</span></div>
          <div class="target-title"><div id="target-name" class="target-name">C<sub>3</sub></div><p id="target-frequency">130.81 Hz <span>·</span> Your target</p></div>
          <div class="notation-wrap"><div id="notation"></div></div>
          <button id="reveal-note" class="text-button reveal-button">${icon('eye')} <span>Hide note name</span></button>
          <div class="reference-actions"><button class="button button-primary" id="play-reference">${icon('play')} <span>Play reference</span><kbd>Space</kbd></button><button class="button button-outline next-button" id="next-note">Next note ${icon('arrow')}</button></div>
          <div class="reference-footer"><span id="profile-label">${icon('fork')} Clean sine tone</span><label class="volume-control">${icon('volume')}<span class="sr-only">Reference volume</span><input id="volume" type="range" min="0" max="100" step="1" aria-label="Reference volume" /><output id="volume-value">50%</output></label></div>
        </section>
        <section class="tuner-panel panel" aria-labelledby="tuner-heading">
          <div class="panel-top"><h2 id="tuner-heading"><span class="section-number">02</span> YOUR VOICE</h2><span class="mic-badge" id="mic-badge"><span></span> MIC OFF</span></div>
          <div class="tuner-readout"><span id="detected-note">—</span><span id="detected-frequency">Waiting for your voice</span></div>
          <div class="dial-wrap">${tunerMarkup()}</div>
          <div class="tuning-status" id="tuning-status" data-tone="neutral"><span class="status-symbol" id="status-symbol">○</span><span id="status-label">Ready when you are</span><span class="cents-value" id="cents-value">— cents</span></div>
          <p class="tuner-caption" id="tuner-caption">Start your microphone, then sing the note you hear.</p>
          <div class="hold-area"><div><span id="hold-label">Hold it steady</span><span><strong id="hold-time">0.0</strong> / 0.8 sec</span></div><progress id="hold-progress" max="800" value="0" aria-label="In-tune hold progress"></progress></div>
          <button id="mic-toggle" class="button button-mic">${icon('mic')} <span>Start microphone</span></button>
          <div class="mic-footer"><span class="input-level"><span id="level-fill"></span></span><span id="input-label">Microphone is off</span><button id="calibrate" class="text-button" disabled>Calibrate</button></div>
        </section>
      </div>
      <div class="under-cards">
        <div class="practice-tip"><span class="tip-icon">${icon('headphones')}</span><p><strong>A little space to listen.</strong> Headphones help keep the reference out of your microphone.</p></div>
        <div class="session-stat"><span id="matched-count">0</span><div>notes matched<small>THIS PRACTICE</small></div><button id="retry-note" class="icon-button" aria-label="Try this note again" title="Try this note again">${icon('repeat')}</button></div>
      </div>
      <section class="note-picker" aria-labelledby="picker-heading"><div><h2 id="picker-heading">Or choose your note</h2><p>Your comfortable range. Your pace.</p></div><div id="note-buttons" class="note-buttons"></div></section>
      <footer class="page-footer"><span>${icon('leaf')} Small steps. Steady progress.</span><span>Your microphone stays in this browser. No recordings are saved.</span></footer>
      <p id="announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
    </main>
    <dialog id="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><div><p class="eyebrow">MAKE YOURSELF COMFORTABLE</p><h2 id="settings-title">Practice settings</h2></div><button class="icon-button dialog-close" aria-label="Close settings">${icon('close')}</button></div>
      <form id="settings-form"><div class="form-grid"><label>Lowest note<select id="range-low"></select></label><label>Highest note<select id="range-high"></select></label></div>
      <label class="check-row"><input id="chromatic" type="checkbox"/><span>Include sharps<small>Add chromatic notes to your range.</small></span></label>
      <div class="form-grid"><label>Pitch tolerance<select id="tolerance"><option value="35">Relaxed · ±35 cents</option><option value="25">Focused · ±25 cents</option><option value="15">Precise · ±15 cents</option></select></label><label>Reference tone<select id="waveform"><option value="sine">Clean sine</option><option value="triangle">Soft triangle</option></select></label></div>
      <label class="check-row"><input id="show-names" type="checkbox"/><span>Show note names<small>Hide them to practise reading bass clef.</small></span></label>
      <label>Microphone<select id="device-select"><option value="">System default</option></select><small>Start the microphone to see available device names.</small></label>
      <label class="gate-label">Input noise gate <output id="gate-value">−50 dBFS</output><input id="gate" type="range" min="-70" max="-20" step="1"/><small>Lower values detect quieter singing. Calibrate to match your room.</small></label>
      <p id="settings-error" class="form-error" role="alert"></p><button type="submit" class="button button-primary">Save settings ${icon('check')}</button></form>
    </dialog>
    <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-heading"><div><p class="eyebrow">A SIMPLE PRACTICE RITUAL</p><h2 id="help-title">Listen, then sing.</h2></div><button class="icon-button dialog-close" aria-label="Close help">${icon('close')}</button></div>
      <ol class="help-steps"><li><span>1</span><div><h3>Meet your note</h3><p>Read the bass-clef card, then play the reference. Start with notes that feel comfortable.</p></div></li><li><span>2</span><div><h3>Give it a voice</h3><p>Start your microphone and allow access. Wait for the reference to finish, then sing a relaxed, steady vowel.</p></div></li><li><span>3</span><div><h3>Find the centre</h3><p>Left is flat; right is sharp. Hold inside the shaded band for 0.8 seconds to match the note. The exact octave matters.</p></div></li></ol>
      <p class="help-note">Use Calibrate in a new room: stay quiet for 2.5 seconds, then sing comfortably for 3.5 seconds. A wired headset is a good starting point.</p><div class="shortcut-list"><span><kbd>Space</kbd> Play / stop</span><span><kbd>→</kbd> Next note</span><span><kbd>M</kbd> Microphone</span></div>
    </dialog>`;

  const el = <T extends Element = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const settingsDialog = el<HTMLDialogElement>('#settings-dialog');
  const helpDialog = el<HTMLDialogElement>('#help-dialog');
  const needle = el<SVGGElement>('#needle');
  const progress = el<HTMLProgressElement>('#hold-progress');
  const events = new AbortController();
  const listen = (node: EventTarget, type: string, handler: EventListener) => node.addEventListener(type, handler, { signal: events.signal });

  const engine = new AudioEngine({
    frame: handleFrame,
    microphone: state => {
      micState = state;
      resetHold();
      if (state !== 'on') cancelCalibration();
      renderAudioState();
      if (state === 'on') void refreshDevices();
      announce(state === 'on' ? 'Microphone on. Sing your target note.' : state === 'requesting' ? 'Waiting for microphone permission.' : 'Microphone off.');
    },
    reference: state => { referenceState = state; renderAudioState(); },
    error: showError,
  });

  function persist(): void {
    if (!saveSettings(settings)) showError('Your settings work for this visit, but this browser could not save them.');
  }

  function showError(message: string): void {
    el('#error-text').textContent = message;
    el('#error-banner').hidden = false;
  }

  function announce(message: string): void {
    clearTimeout(liveTimer);
    el('#announcement').textContent = message;
  }

  function status(label: string, caption: string, tone = 'neutral', symbol = '○'): void {
    el('#status-label').textContent = label;
    el('#tuner-caption').textContent = caption;
    el('#status-symbol').textContent = symbol;
    el('#tuning-status').dataset.tone = tone;
    if (label !== liveKey) {
      liveKey = label;
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { el('#announcement').textContent = label; }, 700);
    }
  }

  function resetHold(): void {
    scorer.reset();
    recentCents = [];
    previousPitchAt = 0;
    progress.value = 0;
    el('#hold-time').textContent = '0.0';
    el('#hold-label').textContent = 'Hold it steady';
    el('.hold-area').classList.remove('matched');
    clearPitch();
  }

  function clearPitch(): void {
    needle.style.transform = 'rotate(0deg)';
    needle.style.opacity = '.25';
    el('#detected-note').textContent = '—';
    el('#detected-frequency').textContent = 'Waiting for your voice';
    el('#cents-value').textContent = '— cents';
  }

  function renderAudioState(): void {
    const active = micState === 'on';
    const requesting = micState === 'requesting';
    const micButton = el<HTMLButtonElement>('#mic-toggle');
    micButton.innerHTML = `${icon(active || requesting ? 'stop' : 'mic')} <span>${active ? 'Stop microphone' : requesting ? 'Cancel microphone request' : 'Start microphone'}</span>`;
    micButton.classList.toggle('is-active', active);
    el('#mic-badge').innerHTML = `<span></span> ${active ? 'MIC ON' : requesting ? 'CONNECTING' : 'MIC OFF'}`;
    el('#mic-badge').classList.toggle('is-active', active);
    el<HTMLButtonElement>('#calibrate').disabled = !active;
    el('#input-label').textContent = active ? 'Listening to your microphone' : requesting ? 'Allow access in your browser' : 'Microphone is off';
    if (!active) el('#level-fill').style.width = '0%';
    el<HTMLButtonElement>('#play-reference').innerHTML = `${icon(referenceState === 'playing' ? 'stop' : 'play')} <span>${referenceState === 'playing' ? 'Stop reference' : 'Play reference'}</span><kbd>Space</kbd>`;
    if (calibration) return;
    if (referenceState !== 'idle') {
      clearPitch();
      status(referenceState === 'playing' ? 'Listen to the reference' : 'Take a breath…', 'Your voice will be measured after the reference finishes.', 'reference', '♪');
    } else if (requesting) {
      status('Waiting for permission', 'Allow microphone access in your browser, or cancel below.');
    } else if (active) {
      status('Listening for your note', 'Sing a comfortable, steady vowel. Aim for the centre.');
    } else {
      clearPitch();
      status('Ready when you are', 'Start your microphone, then sing the note you hear.');
    }
  }

  function renderCard(): void {
    el('#target-name').innerHTML = settings.showNames ? `${noteName(target).slice(0, -1)}<sub>${noteName(target).slice(-1)}</sub>` : '?';
    el('#target-frequency').textContent = settings.showNames ? `${midiToHz(target).toFixed(2)} Hz · Your target` : 'Read the note on the staff';
    renderNotation(el<HTMLDivElement>('#notation'), target, settings.showNames);
    el('#reveal-note span').textContent = settings.showNames ? 'Hide note name' : 'Reveal note name';
    el('#card-index').textContent = `NOTE ${String(cardNumber).padStart(2, '0')}`;
    el('#range-label').textContent = `${noteName(settings.low)}–${noteName(settings.high)}${settings.chromatic ? ' · chromatic' : ' · natural notes'}`;
    el('#tolerance-label').textContent = `±${settings.tolerance} cents`;
    el('#profile-label').innerHTML = `${icon('fork')} ${settings.waveform === 'sine' ? 'Clean sine tone' : 'Soft triangle tone'}`;
    setToleranceArc(el<SVGPathElement>('#tolerance-arc'), settings.tolerance);
    el('#note-buttons').innerHTML = pool.map(midi => `<button class="note-chip ${midi === target ? 'selected' : ''}" data-midi="${midi}" aria-pressed="${midi === target}" aria-label="Practise ${noteName(midi)}">${noteName(midi)}</button>`).join('');
    el<HTMLButtonElement>('#next-note').disabled = pool.length < 2;
  }

  function changeCard(midi: number): void {
    cancelCalibration();
    engine.cancelReference();
    target = midi;
    cardNumber++;
    resetHold();
    renderCard();
    renderAudioState();
    announce(settings.showNames ? `New target: ${noteName(target)}.` : 'New bass-clef note.');
  }

  function handleFrame(frame: PitchFrame): void {
    if (calibration) { updateCalibration(frame); return; }
    if (settingsDialog.open || helpDialog.open) {
      if (!scorer.passed) resetHold();
      return;
    }
    if (scorer.update(frame, midiToHz(target), settings.tolerance)) {
      matched++;
      el('#matched-count').textContent = String(matched);
      el('#hold-label').textContent = 'Note matched!';
      el('.hold-area').classList.add('matched');
      announce('Note matched. Try it again or move to the next note.');
    }
    progress.value = Math.min(800, scorer.holdMs);
    el('#hold-time').textContent = (Math.min(800, scorer.holdMs) / 1000).toFixed(1);
    const rawCents = frame.hz === null ? NaN : centsFromTarget(frame.hz, midiToHz(target));
    if (frame.state === 'voiced' && Number.isFinite(rawCents)) {
      if (frame.atMs - previousPitchAt > 200) recentCents = [];
      previousPitchAt = frame.atMs;
      recentCents.push(rawCents);
      if (recentCents.length > 3) recentCents.shift();
    } else {
      recentCents = [];
    }
    if (frame.atMs - lastDraw < 100) return;
    lastDraw = frame.atMs;
    el('#level-fill').style.width = `${Math.max(0, Math.min(100, (frame.dbfs + 70) / 65 * 100))}%`;
    if (frame.state !== 'voiced' || frame.hz === null) {
      recentCents = [];
      clearPitch();
      if (frame.state === 'gated') status(referenceState === 'playing' ? 'Listen to the reference' : 'Take a breath…', 'Your voice will be measured after the reference finishes.', 'reference', '♪');
      else if (frame.state === 'quiet') status('Listening for your note', 'Sing gently and steadily. If the meter stays low, try Calibrate.');
      else if (frame.state === 'clipped') status('Input is too loud', 'Move a little away from the microphone or lower its input level.', 'warning', '!');
      else status('No clear pitch yet', 'Try a steady vowel and reduce background noise.', 'warning', '≈');
      return;
    }
    const sorted = [...recentCents].sort((a, b) => a - b);
    const cents = sorted[Math.floor(sorted.length / 2)];
    needle.style.transform = `rotate(${Math.max(-100, Math.min(100, cents)) * 0.9}deg)`;
    needle.style.opacity = '1';
    el('#detected-note').textContent = noteName(hzToMidi(frame.hz));
    el('#detected-frequency').textContent = `${frame.hz.toFixed(1)} Hz detected`;
    el('#cents-value').textContent = `${cents > 0 ? '+' : ''}${Math.round(cents)} cents`;
    // Classification uses the raw estimate, exactly as the scorer does.
    if (Math.abs(rawCents) <= settings.tolerance) status('In tune', scorer.passed ? 'Beautifully held. Stay here or explore the next note.' : 'That’s the centre. Keep the note steady.', 'good', '✓');
    else if (Math.abs(Math.abs(rawCents) - 1200) < 65) status(rawCents > 0 ? 'An octave too high' : 'An octave too low', 'Check the octave beside the note, then replay the reference.', 'warning', rawCents > 0 ? '↓' : '↑');
    else status(Math.abs(rawCents) > 100 ? (rawCents > 0 ? 'Above the target' : 'Below the target') : (rawCents > 0 ? 'A little sharp' : 'A little flat'), Math.abs(rawCents) > 100 ? 'Replay the reference and check the note and octave.' : rawCents > 0 ? 'Ease the pitch down towards the centre.' : 'Let the pitch rise towards the centre.', Math.abs(rawCents) > 100 ? 'warning' : 'adjust', rawCents > 0 ? '↓' : '↑');
  }

  function cancelCalibration(): void {
    if (calibration) engine.gateDbfs = calibration.oldGate;
    calibration = null;
    el('#calibrate').textContent = 'Calibrate';
  }

  function updateCalibration(frame: PitchFrame): void {
    if (!calibration) return;
    const elapsed = frame.atMs - calibration.startAt;
    el('#level-fill').style.width = `${Math.max(0, Math.min(100, (frame.dbfs + 70) / 65 * 100))}%`;
    if (calibration.stage === 'noise') {
      if (elapsed > 400 && frame.state !== 'gated') calibration.noise.push(frame.dbfs);
      status(`Room check · ${Math.max(1, Math.ceil((2500 - elapsed) / 1000))}`, 'Stay quiet for a moment while we listen to your room.', 'reference', '○');
      if (elapsed >= 2500) {
        const samples = calibration.noise.sort((a, b) => a - b);
        if (!samples.length) { cancelCalibration(); showError('No room audio was available. Please try calibration again.'); renderAudioState(); return; }
        engine.gateDbfs = Math.max(-65, Math.min(-25, samples[Math.floor(samples.length * 0.9)] + 10));
        calibration.stage = 'voice';
        calibration.startAt = frame.atMs;
        announce('Now sing a comfortable, steady note.');
      }
    } else {
      if (frame.state === 'voiced') calibration.voice.push(frame.dbfs);
      status(`Voice check · ${Math.max(1, Math.ceil((3500 - elapsed) / 1000))}`, 'Sing a comfortable, steady note at your usual volume.', 'reference', '♪');
      if (elapsed >= 3500) {
        const success = calibration.voice.length >= 10;
        if (success) {
          settings.gateDbfs = engine.gateDbfs;
          calibration = null;
          persist();
          announce('Calibration complete. You’re ready to practise.');
        } else {
          cancelCalibration();
          showError('We couldn’t separate a steady voice from the room. Try a quieter setting, move the microphone closer, or lower the noise gate in settings.');
        }
        el('#calibrate').textContent = 'Calibrate';
        resetHold();
        renderAudioState();
      }
    }
  }

  async function refreshDevices(): Promise<void> {
    const revision = ++deviceRevision;
    try {
      const devices = await engine.devices();
      if (revision !== deviceRevision || disposed) return;
      const select = el<HTMLSelectElement>('#device-select');
      select.replaceChildren(new Option('System default', ''));
      devices.filter(device => device.deviceId && device.deviceId !== 'default').forEach((device, i) => {
        select.add(new Option(device.label || `Microphone ${i + 1}`, device.deviceId));
      });
      if (selectedDevice && !devices.some(device => device.deviceId === selectedDevice)) selectedDevice = '';
      select.value = selectedDevice;
    } catch { /* Default microphone remains usable if enumeration is unavailable. */ }
  }

  function toggleMic(): void {
    if (micState !== 'off') { engine.stop(); return; }
    el('#error-banner').hidden = true;
    void engine.startMicrophone(selectedDevice);
  }

  function play(): void {
    cancelCalibration();
    resetHold();
    if (referenceState === 'playing') engine.cancelReference();
    else void engine.playReference(midiToHz(target), settings.waveform);
  }

  function applyTheme(): void {
    document.documentElement.dataset.theme = settings.theme;
    el('#theme-toggle').innerHTML = icon(settings.theme === 'light' ? 'moon' : 'sun');
    el('#theme-toggle').setAttribute('aria-label', `Switch to ${settings.theme === 'light' ? 'dark' : 'light'} mode`);
  }

  listen(el('#mic-toggle'), 'click', toggleMic);
  listen(el('#play-reference'), 'click', play);
  listen(el('#next-note'), 'click', () => changeCard(nextNote(pool, target)));
  listen(el('#retry-note'), 'click', () => { cancelCalibration(); engine.cancelReference(); resetHold(); renderAudioState(); announce('Ready to try this note again.'); });
  listen(el('#note-buttons'), 'click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-midi]');
    if (button) changeCard(Number(button.dataset.midi));
  });
  listen(el('#volume'), 'input', () => {
    settings.volume = Number(el<HTMLInputElement>('#volume').value) / 100;
    engine.setVolume(settings.volume);
    el('#volume-value').textContent = `${Math.round(settings.volume * 100)}%`;
    persist();
  });
  listen(el('#reveal-note'), 'click', () => { settings.showNames = !settings.showNames; renderCard(); persist(); });
  listen(el('#theme-toggle'), 'click', () => { settings.theme = settings.theme === 'light' ? 'dark' : 'light'; applyTheme(); persist(); });
  listen(el('#error-dismiss'), 'click', () => { el('#error-banner').hidden = true; });
  listen(el('#help-open'), 'click', () => helpDialog.showModal());
  root.querySelectorAll<HTMLButtonElement>('.dialog-close').forEach(button => listen(button, 'click', () => button.closest('dialog')!.close()));
  listen(el('#settings-open'), 'click', () => {
    el<HTMLSelectElement>('#range-low').value = String(settings.low);
    el<HTMLSelectElement>('#range-high').value = String(settings.high);
    el<HTMLInputElement>('#chromatic').checked = settings.chromatic;
    el<HTMLSelectElement>('#tolerance').value = String(settings.tolerance);
    el<HTMLSelectElement>('#waveform').value = settings.waveform;
    el<HTMLInputElement>('#show-names').checked = settings.showNames;
    el<HTMLInputElement>('#gate').value = String(settings.gateDbfs);
    el('#gate-value').textContent = `${settings.gateDbfs} dBFS`;
    el('#settings-error').textContent = '';
    settingsDialog.showModal();
    void refreshDevices();
  });
  listen(el('#gate'), 'input', () => { el('#gate-value').textContent = `${el<HTMLInputElement>('#gate').value} dBFS`; });
  listen(el('#settings-form'), 'submit', event => {
    event.preventDefault();
    const low = Number(el<HTMLSelectElement>('#range-low').value);
    const high = Number(el<HTMLSelectElement>('#range-high').value);
    const chromatic = el<HTMLInputElement>('#chromatic').checked;
    const nextPool = notePool(low, high, chromatic);
    if (!nextPool.length) { el('#settings-error').textContent = 'Choose a valid range containing at least one enabled note.'; return; }
    const newDevice = el<HTMLSelectElement>('#device-select').value;
    const restartMic = newDevice !== selectedDevice && micState !== 'off';
    selectedDevice = newDevice;
    settings = { ...settings, low, high, chromatic,
      tolerance: Number(el<HTMLSelectElement>('#tolerance').value),
      waveform: el<HTMLSelectElement>('#waveform').value as 'sine' | 'triangle',
      showNames: el<HTMLInputElement>('#show-names').checked,
      gateDbfs: Number(el<HTMLInputElement>('#gate').value),
    };
    pool = nextPool;
    cancelCalibration();
    engine.cancelReference();
    engine.gateDbfs = settings.gateDbfs;
    if (!pool.includes(target)) target = pool[0];
    resetHold();
    renderCard();
    renderAudioState();
    persist();
    settingsDialog.close();
    if (restartMic) void engine.startMicrophone(selectedDevice);
  });
  listen(el('#calibrate'), 'click', () => {
    if (calibration) { cancelCalibration(); renderAudioState(); return; }
    engine.cancelReference();
    resetHold();
    calibration = { stage: 'noise', startAt: performance.now(), noise: [], voice: [], oldGate: engine.gateDbfs };
    el('#calibrate').textContent = 'Cancel';
    announce('Calibration started. Stay quiet for two and a half seconds.');
  });
  listen(document, 'keydown', event => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.repeat || keyboard.ctrlKey || keyboard.metaKey || keyboard.altKey || settingsDialog.open || helpDialog.open) return;
    if ((keyboard.target as Element).closest('input, select, textarea, button, a, [contenteditable]')) return;
    if (keyboard.code === 'Space') { keyboard.preventDefault(); play(); }
    if (keyboard.code === 'ArrowRight') { keyboard.preventDefault(); changeCard(nextNote(pool, target)); }
    if (keyboard.code === 'KeyM') { keyboard.preventDefault(); toggleMic(); }
  });
  listen(document, 'visibilitychange', () => { if (document.hidden) engine.stop(); });
  listen(window, 'pagehide', () => engine.stop());
  if (navigator.mediaDevices) listen(navigator.mediaDevices, 'devicechange', () => { void refreshDevices(); });

  const options = notePool(40, 60, true).map(midi => `<option value="${midi}">${noteName(midi)}</option>`).join('');
  el('#range-low').innerHTML = options;
  el('#range-high').innerHTML = options;
  el<HTMLInputElement>('#volume').value = String(settings.volume * 100);
  el('#volume-value').textContent = `${Math.round(settings.volume * 100)}%`;
  engine.setVolume(settings.volume);
  engine.gateDbfs = settings.gateDbfs;
  applyTheme();
  renderCard();
  renderAudioState();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) showError('Microphone access needs desktop localhost or trusted HTTPS. You can still read cards and play references here.');

  return () => {
    disposed = true;
    events.abort();
    clearTimeout(liveTimer);
    engine.dispose();
  };
}
