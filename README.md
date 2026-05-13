# ascii-fx-lab

ascii-fx-lab is a browser-based audio-reactive ASCII/VJ canvas. Upload one MP4/WebM/MOV file and turn it into dynamic ASCII, dot-matrix, matrix rain, outline, and glitch visuals that react to spectrum bands, flux, and beat detection.

## Run

```bash
npm install
npm run dev
```

The main app runs at `http://localhost:5173/`.

## ASCII FX Lab

The root route composites an uploaded clip as a generated ASCII/dot-matrix layer and the source video. The Web Audio API analyzes sub, bass, mid, presence, high, air, flux, and beat values to modulate flashes, density, glitch noise, and filter transitions. When `Auto FX` is enabled, only filters assigned in `Frequency Routing` can be selected by the spectrum router. Per-preset `Positive`, `Negative`, and `Beat` polarity settings stay visible and apply to both manual filter selection and `Auto FX` transitions.

`Split` lets you open the generated or source view fullscreen by clicking the corresponding canvas area. `Overlay` blends the generated canvas over the source with a stronger screen/additive pass. `Layer`, `Source`, `React`, and `Smooth` tune blend intensity, source level, reactivity, and transition interpolation. `Pixel` controls ASCII cell size independently from `Density`, and `Glyph` can use per-filter `Auto` defaults or force `Dot`, `ASCII`, `Block`, `Binary`, or `Edge` glyph sets.

## Gesture Scrub

The original MediaPipe gesture scrubber is still available at `http://localhost:5173/gesture`.

1. Select a clip with `Upload Video`.
2. Press `Start Webcam` and allow camera access.
3. The video waits on the first frame.
4. An open palm maps to the first frame, and a closed hand maps to the final frame.
5. Fast hand closure scrubs quickly; slower hand closure follows at the same pace.

Webcam frames and uploaded videos are not sent to a server.
