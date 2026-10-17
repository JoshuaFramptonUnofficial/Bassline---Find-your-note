import { Accidental, Barline, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { noteKey, noteName } from './notes';

export function renderNotation(container: HTMLDivElement, midi: number, reveal: boolean): void {
  container.replaceChildren();
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(400, 180);
  const context = renderer.getContext();
  context.setFillStyle('currentColor').setStrokeStyle('currentColor');
  const stave = new Stave(20, 40, 360);
  stave.addClef('bass').setEndBarType(Barline.type.NONE);
  stave.setContext(context).draw();
  const key = noteKey(midi);
  const note = new StaveNote({ clef: 'bass', keys: [key], duration: 'w' });
  note.setCenterAlignment(true);
  if (key.includes('#')) note.addModifier(new Accidental('#'), 0);
  const voice = new Voice({ num_beats: 4, beat_value: 4 }).addTickables([note]);
  new Formatter().joinVoices([voice]).formatToStave([voice], stave);
  voice.draw(context, stave);
  const svg = container.querySelector('svg')!;
  svg.setAttribute('viewBox', '0 0 400 180');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', reveal ? `Bass clef, ${noteName(midi)}, whole note` : 'Bass-clef whole note. Reveal the note name for a text description.');
}
