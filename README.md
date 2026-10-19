# Sonorant

<p align="center">
  <img src="docs/assets/pitch-resonance.webp" width="900" alt="A vocal tract drawn as a pale wireframe tube on a blueprint grid. Cyan pulses travel up the tube at a steady rate, and a wave inside the tube stretches as the tube lengthens.">
</p>

<p align="center"><em>Pitch is how fast the pulses come. Resonance is how long the tube is.<br>They are separate controls — and only one of them is usually measured.</em></p>

<p align="center">
  <a href="https://github.com/therebelrobot/sonorant/actions/workflows/ci.yml"><img src="https://github.com/therebelrobot/sonorant/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-Unlicense-blue.svg" alt="Licence: Unlicense"></a>
  <img src="https://img.shields.io/badge/network%20calls-none-critical.svg" alt="Makes no network calls">
</p>

A local-first, open-source voice analysis and training tool. It measures the acoustic properties of a voice — pitch, formants/resonance, voice quality, and input integrity — and visualises them so a person training their voice can see what is actually changing.

Sonorant is offline-capable, has no backend, and stores nothing on any server.

---

## Why this exists

Voice modification is a slow, embodied skill that takes months of practice to produce a perceptible change. Progress depends on feedback, and the feedback available today is either a clinician's ear at infrequent appointments or a consumer app that measures the wrong quantity.

The failure mode is specific and widely reported: people raise their pitch and plateau.

<p align="center">
  <img src="docs/assets/plateau.webp" width="820" alt="A chart on a blueprint grid. The pitch line rises steeply and then flattens into a plateau, while a second, dimmer line for resonance stays flat from the start.">
</p>

<p align="center"><em>Pitch climbs, then stops paying off. Resonance — the line that actually moves how a voice reads — never changed.</em></p>

Pitch is not the dominant perceptual cue for how a voice is gendered. Vocal tract resonance is, and resonance is rarely measured, because measuring it correctly requires normalising out the vowel. Almost nobody does that.

**Sonorant measures resonance, and gives it away.**

**Primary users:** people modifying their voice — most visibly transgender people — and the speech-language pathologists who work with them.

**Not users:** nobody accessing this through an employer, a clinic's managed system, or any relationship where the builder holds their data. There is no such relationship, by design.

---

## How it runs

Everything happens on the device you are holding. The microphone feeds an AudioWorklet, which hands frames to a Worker, which calls the Rust analysis core compiled to WebAssembly, which returns measurements to the pad. There is no server anywhere in that path.

<p align="center">
  <img src="docs/assets/local-only.webp" width="900" alt="A blueprint diagram of a signal chain — mic, worklet, worker, core, pad — drawn left to right with arrows between the boxes. A cloud shape above the chain is struck through with a cyan cross and labelled no server.">
</p>

- **No network client exists in the codebase.** No telemetry, no analytics, no crash reporter. CSP is `connect-src 'none'` — not `'self'`, because there is no endpoint to talk to. A CI test scans the built bundle for any external origin and fails the build on a match.
- **No acoustic maths in TypeScript — ever.** TypeScript is the UI and orchestration layer only. All acoustic maths lives in the Rust core, so there is no second implementation to drift out of agreement with the first.
- **Nothing leaves the device.** History, calibration, and recordings live in local storage and local files, and export as an encrypted archive you control.

---

## Non-negotiable principles

These are the reason the tool is worth building at all. They are not aspirational; they constrain every feature.

1. **Pitch and resonance are always visually separable.** They interact acoustically, they are separately trainable, and conflating them teaches the wrong skill.
2. **Vowel identity is controlled or normalised out before anything is expressed in Hz.** A raw-Hz formant display mostly measures the vowel.
3. **Every estimate carries a confidence indication.** The maths degrades fastest at high F0, which is exactly where the primary user group works.
4. **Self-referential by default.** Compare against the user's own baseline and their own chosen target. Normative reference bands exist but are off by default.
5. **No single composite score.** Not femininity, not voice quality, not progress.
6. **Measurement and interpretation are visually distinct.** Anything reading as a judgement uses an unmistakable different visual register.
7. **Nothing diagnostic.** It measures. It does not classify, screen, or diagnose.
8. **No backend, ever, in v1.** No server, no account, no telemetry, no audio egress.

---

## What's in the repository

The repository is a monorepo with two tooling layers: a **Cargo workspace** for the Rust crates, and **npm workspaces + Turborepo** for the TypeScript side.

```
sonorant/
  Cargo.toml            # cargo workspace root
  crates/
    sonorant-core/      # no_std-friendly numerics: FFT wrappers, LPC, YIN, cepstrum, formants
    sonorant-analysis/  # frame pipeline, AnalysisFrame assembly, session state machine
    sonorant-calibrate/ # calibration store, dBFS -> dB SPL conversion
    sonorant-archive/   # history export/import container + AEAD
    sonorant-ffi/       # wasm-bindgen surface (thin; no logic)
    sonorant-capture/   # native capture (cpal) + device enumeration
    sonorant-cli/       # Rust batch analyser, conformance harness, fixture generator
  apps/
    web/                # TS UI + AudioWorklet shim + Worker
    desktop/            # Tauri 2 shell reusing apps/web
    docs/               # GitHub Pages docs site + visualization showcase
  packages/
    sonorant/           # npm: WASM core wrapper (library)
    sonorant-cli/       # npm: user-facing CLI, TypeScript + Ink
    sonorant-react/     # npm: reusable React visualizations
  fixtures/             # reference recordings + offline oracle output
  scripts/              # egress scan, web verification, release versioning
  docs/                 # brief, TDD, rules, verification, and this README's media
  package.json          # npm workspace root (workspaces field)
  turbo.json
```

**Deliberate name collision.** The Rust crate `sonorant-cli` (crates.io) and the npm package `sonorant-cli` (npm) share a name but live in different registries. This is intentional, not an error. Name the registry when the context is ambiguous.

The diagrams and animations above are rendered from `docs/media/blueprint/` — a small Remotion project in the same repository, so the README's visuals are reproducible from source rather than pasted in.

---

## Status

**Early — implemented, pre-release.** The repository is at `0.4.0`: all seven Rust crates, the TypeScript web app, the WASM wrapper, and the Ink CLI build and test, and the live capture path is verified end-to-end in a browser (see [`docs/verification/`](docs/verification/)). The Tauri desktop shell is still a scaffold.

The web app's runtime flags ship **dormant** — all default to off. Turning one on is a human launch decision, never automated. See [`docs/deployment.md`](docs/deployment.md).

The project follows the **Risk Reduction Delivery Framework (RRF)** at the **lightweight** tier. The `rrf-*` skills govern delivery phases.

---

## Documentation

- [Project brief — voice analysis & training tool](docs/Project%20brief%20%E2%80%94%20voice%20analysis%20%26%20training%20tool.md) — the problem, the users, the principles, scope, and the licence reasoning.
- [TDD — Rust analysis core & local-first deployment](docs/TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md) — the architecture, the analysis core contract, storage, export/import, security review, and testing strategy.
- [Measure tolerances](docs/measure-tolerances.md) — what a version bump is allowed to move, and by how much.
- [Conformance fixtures](docs/conformance.md) — Praat as an offline validation oracle that ships nothing.
- [Deployment](docs/deployment.md) — publishing the static bundle, and the rollback rule.
- [Releasing](docs/releasing.md) — the release script, version alignment, and the publishing gates.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development prerequisites, build and test instructions, the PR process, and the dependency-licence gate. All contributions are public domain under the Unlicense.

---

## Licence

**Unlicense** — this project is released into the public domain. See [`LICENSE`](LICENSE).

The licence was chosen deliberately. Health-system and clinic legal review is dramatically easier with public domain than with copyleft — AGPL is frequently a hard blocker in those reviews. Choosing copyleft to prevent re-absorption would also prevent the deployment that matters most: a clinician self-hosting this in a professional environment.
