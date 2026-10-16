# Live pad — browser verification

**Date:** 2026-10-16
**Method:** `playwright-cli` against the built bundle (`scripts/serve-web.mjs apps/web/dist 4173`),
Chromium with `--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream`.
**Scope:** the M4 live path end-to-end — `getUserMedia` → AudioWorklet → Worker → wasm → UI —
and the four first-run states (S4.1–S4.4).

This closes the standing "no browser verification" gap for M4.

## What was verified

| State | Result | Screenshot |
|---|---|---|
| Microphone permission (S4.1) | Heading, body, and **Allow microphone** button render as specified | `permission.png` |
| Insecure context (S4.1) | `role="alert"` panel: correct heading/body, **Reload** button; no microphone requested | `insecure.png` |
| Permission denied (S4.1) | `role="alert"` guidance with a **Try again** button (not a dead end) | `denied.png` |
| Live practice (S4.2–S4.4) | Frames flow end-to-end (**2781 frames analysed**), pad draws with axis ticks, confidence overlay + label, summary lines, and the flags list | `practice.png` |

The end-to-end chain works: capture in the worklet, analysis on the worker, frames returned
as a `Float32Array`, decoded at the ABI offsets, and rendered. The CSP did **not** block the
wasm fetch.

## Bug found and fixed

The low-confidence overlay drew a dense hatch over the **entire** plot and **overflowed the
plot rectangle** (diagonal lines continued past the axes and off the plot), burying the live
trace. Fixed in `apps/web/src/pad/pad-view.js`:

- the hatch is **clipped** to the plot rectangle, and
- it is much subtler (alpha 0.22, wider spacing), so the trace stays readable.

The `practice.png` capture is after the fix.

## Limitations

1. **Fake device input is constant/full-scale**, so the pad shows a flat trace flagged
   `Clipped` and unvoiced. The live *data* path is proven, but a *voiced* pitch/resonance
   display is covered only by the `pad-model`/`summary` unit tests, not live.
2. **No CI job.** This was a manual pass; a Playwright job in CI would need a browser
   download and a served bundle.
3. The app is plain ESM **JavaScript**, not TypeScript (the standing deviation from TDD §3).
