# EZ Signal

Low-code digital signal processing in the browser: build a chain of blocks
(sources → processing → analysis/output) on a canvas and see results update live.
Everything runs client-side; there is no server.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # DSP checked against SciPy/NumPy reference output
npm run build    # static site in dist/, host anywhere
```

## How it works

- `src/dsp/` — dependency-free DSP: FFT, Butterworth design (zpk → second-order sections,
  matching `scipy.signal.butter(..., output='sos')`), `sosfilt`, Welch spectrum, STFT, WAV I/O.
- `src/blocks/` — each block is a `BlockDefinition`: typed ports, parameter metadata
  (defaults, ranges, conditional visibility) and a pure `run` function. The editor builds each
  block's form from the metadata and validates against it; the engine validates the same way.
- `src/engine/` — a Web Worker executes the graph in dependency order and caches each block's
  result, so editing one block only recomputes it and what follows.
- `src/editor/` — React Flow canvas, parameter forms and previews (uPlot charts, spectrogram, player).

## Adding a block

Write a `BlockDefinition` (see `src/blocks/audio.ts`) and list it in `src/blocks/registry.ts`.
Ports are typed by signal kind (`audio`, and `image` reserved for image processing), so the editor
only allows compatible connections.

Reference fixtures are regenerated with `python tests/fixtures/make_fixtures.py tests/fixtures/scipy-reference.json`
(needs numpy and scipy).
