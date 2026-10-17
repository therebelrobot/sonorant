# Sonorant

A local-first, open-source voice analysis and training tool. It measures the acoustic properties of a voice — pitch, formants/resonance, voice quality, and input integrity — and visualises them so a person training their voice can see what is actually changing.

Sonorant is offline-capable, has no backend, and stores nothing on any server.

---

## What it does, and who it's for

Voice modification is a slow, embodied skill that takes months of practice to produce a perceptible change. Progress depends on feedback, and the feedback available today is either a clinician's ear at infrequent appointments or a consumer app that measures the wrong quantity.

The failure mode is specific and widely reported: people raise their pitch and plateau. Pitch is not the dominant perceptual cue for how a voice is gendered — vocal tract resonance is, and resonance is rarely measured, because measuring it correctly requires normalising out the vowel. Almost nobody does that.

Sonorant measures resonance, and gives it away.

**Primary users:** people modifying their voice — most visibly transgender people — and the speech-language pathologists who work with them.

**Not users:** nobody accessing this through an employer, a clinic's managed system, or any relationship where the builder holds their data. There is no such relationship, by design.

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

## Monorepo layout

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
  package.json          # npm workspace root (workspaces field)
  turbo.json
  docs/
```

**TypeScript is the UI and orchestration layer only.** No acoustic maths in TypeScript, ever — not even a fallback. All acoustic maths lives in the Rust core.

**Deliberate name collision.** The Rust crate `sonorant-cli` (crates.io) and the npm package `sonorant-cli` (npm) share a name but live in different registries. This is intentional, not an error. Name the registry when the context is ambiguous.

---

## Status

**Early / draft — pre-implementation.** The project is at the design stage. There is no code yet. The first artifact will be the Rust `sonorant-cli` crate, which gives a fast, debuggable loop on real recordings with no browser in the way.

The project follows the **Risk Reduction Delivery Framework (RRF)** at the **lightweight** tier. The `rrf-*` skills govern delivery phases.

---

## Documentation

- [Project brief — voice analysis & training tool](docs/Project%20brief%20%E2%80%94%20voice%20analysis%20%26%20training%20tool.md) — the problem, the users, the principles, scope, and the licence reasoning.
- [TDD — Rust analysis core & local-first deployment](docs/TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md) — the architecture, the analysis core contract, storage, export/import, security review, and testing strategy.

---

## Licence

**Unlicense** — this project is released into the public domain. See [`LICENSE`](LICENSE).

The licence was chosen deliberately. Health-system and clinic legal review is dramatically easier with public domain than with copyleft — AGPL is frequently a hard blocker in those reviews. Choosing copyleft to prevent re-absorption would also prevent the deployment that matters most: a clinician self-hosting this in a professional environment.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development prerequisites, build and test instructions, the PR process, and the dependency-licence gate. All contributions are public domain under the Unlicense.
