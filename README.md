# Bassline

A browser app for practising bass choir notes. Pick a note, listen to it, then sing it back. The tuner shows how close you are and whether you're holding the pitch steady.

The note range is E2–C4. It starts at G2–G3, so you can work in a comfortable part of your range before adding more notes.

## Getting started

You'll need Node.js 24 LTS and pnpm 11.25.0. If you don't have pnpm:

```sh
npm install --global pnpm@11.25.0
```

From the repository folder:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [127.0.0.1:5173](http://127.0.0.1:5173/) in your browser. Stop the server with Ctrl+C.

On Windows, you can also use the included PowerShell script after installing the dependencies:

```powershell
.\Start-Practice.ps1
```

## Practising

Choose a note from the row below the cards, or press **Next note** for another one. The flashcard uses bass clef, including the ledger lines for E2 and middle C. You can hide the note name if you want to practise reading the staff.

Press **Play reference**, then **Start microphone** and allow access when your browser asks. Wait for the tone to finish before singing. Headphones help prevent the microphone from picking up the reference.

The needle moves left when you're flat and right when you're sharp. Hold inside the shaded band for 0.8 seconds to register a match. A note in the wrong octave won't count. There's no time limit, so you can replay the tone and try again as often as you like.

**Practice settings** lets you change:

- The lowest and highest notes, anywhere from E2 to C4.
- Whether sharps are included.
- The tuning tolerance: ±35, ±25, or ±15 cents.
- The reference sound: sine or triangle.
- The microphone and input noise gate.

Reference volume sits below the flashcard. The theme button switches between light and dark mode.

Settings are saved in your browser. The match counter is just for the current visit and resets when you reload.

### Microphone setup

If quiet singing isn't being detected, try **Calibrate**. Stay quiet for 2.5 seconds while the app checks the room, then sing a comfortable note for 3.5 seconds. You can cancel and keep the previous settings.

If that doesn't help, check the selected microphone and the input meter. Move closer to the mic or lower the noise gate in settings. If the app reports clipping, move further away or reduce the microphone's input level.

Microphone audio is processed in the browser. It isn't uploaded or recorded. **Stop microphone** ends capture; switching away from the page stops it too.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play or stop the reference |
| Right arrow | Next note |
| M | Start or stop the microphone |

Shortcuts apply when you're outside a button or form field.

## Using a phone

The layout adapts to a phone screen, but microphone access needs trusted HTTPS. Opening the desktop's plain HTTP address over Wi-Fi won't be enough. The default development server also only accepts connections from the desktop itself.

For phone access, you'll need to configure HTTPS, trust the development certificate on the phone, and make the server available on your local network. The [project plan](Vocal_Practise_App_Plan.md#mobile-access-from-the-same-desktop) has the setup steps.

## Development

The app uses TypeScript and Vite, with [VexFlow](https://vexflow.com/) for notation and [Pitchy](https://github.com/ianprime0509/pitchy) for pitch detection. Playback and microphone input use the Web Audio API. There's no backend.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

The build goes into `dist/`. Preview runs at [127.0.0.1:4173](http://127.0.0.1:4173/). Browser settings are tied to the address and port, so preview has its own saved preferences.

Unit tests cover note conversion, bass-frequency detection, noise rejection, hold scoring, and audio cancellation. To run the browser tests, install Google Chrome and use:

```sh
pnpm test:e2e
```

The browser suite starts the development server if needed. Permission tests use mocked microphone input. The mobile tests emulate a phone screen in Chrome; they don't test Safari on an actual iPhone.

Most of the interface lives in `src/app.ts`. Audio capture and playback are in `src/audio/`, notation and note selection in `src/music/`, and hold scoring in `src/exercises/scorer.ts`.

## Current limits

This version supports single-note free practice. Chord exercises, spaced repetition, piano and choir samples, recordings, and saved session history are planned in [Vocal_Practise_App_Plan.md](Vocal_Practise_App_Plan.md).

The detector has been tested with generated tones across E2–C4, including tones with stronger overtones. Real microphones can still give octave errors or lose the pitch in background noise. Visual checks, the browser suite, and live headset and phone testing are still outstanding.
