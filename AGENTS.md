# AGENTS.md — instructions for AI coding agents

This file tells AI coding agents how to work in the Sonorant repository. Read it before making changes. It is a map and a set of hard constraints, not a tutorial.

---

## Repo purpose

Sonorant is a local-first, open-source voice analysis and training tool. It measures the acoustic properties of a voice — pitch, formants/resonance, voice quality, and input integrity — and visualises them so a person training their voice can see what is actually changing. It is offline-capable, has no backend, and stores nothing on any server.

Primary users are people modifying their voice — most visibly transgender people — and the speech-language pathologists who work with them.

The authoritative documents are:

- [`docs/Project brief — voice analysis & training tool.md`](docs/Project%20brief%20%E2%80%94%20voice%20analysis%20%26%20training%20tool.md) — problem, users, principles, scope, licence reasoning.
- [`docs/TDD — Rust analysis core & local-first deployment.md`](docs/TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md) — architecture, analysis core contract, storage, export/import, security review, testing.

When the brief and the TDD disagree, surface the conflict rather than picking one silently.

---

## Monorepo layout

Two tooling layers: a **Cargo workspace** for Rust, and **npm workspaces + Turborepo** for TypeScript.

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
  packages/
    sonorant/           # npm: WASM core wrapper (library)
    sonorant-cli/       # npm: user-facing CLI, TypeScript + Ink
  package.json          # npm workspace root (workspaces field)
  turbo.json
  docs/
```

### Where things live

| Concern | Location |
|---|---|
| Acoustic maths (FFT, LPC, YIN, cepstrum, formants) | `crates/sonorant-core/` |
| Frame pipeline, `AnalysisFrame` assembly, session state machine | `crates/sonorant-analysis/` |
| Calibration store, dBFS → dB SPL | `crates/sonorant-calibrate/` |
| History export/import container + AEAD | `crates/sonorant-archive/` |
| WASM binding surface (thin, no logic) | `crates/sonorant-ffi/` |
| Native capture (cpal) + device enumeration | `crates/sonorant-capture/` |
| Rust batch analyser, conformance harness, fixture generator | `crates/sonorant-cli/` |
| Web UI, AudioWorklet shim, Worker | `apps/web/` |
| Tauri 2 desktop shell | `apps/desktop/` |
| npm WASM core wrapper (library) | `packages/sonorant/` |
| npm user-facing CLI (TypeScript + Ink) | `packages/sonorant-cli/` |

---

## Key technical rules

These are hard constraints. Do not work around them.

### 1. No acoustic maths in TypeScript — ever

TypeScript is the UI and orchestration layer **only**. No acoustic maths in TypeScript, ever — not even a fallback path. All acoustic maths lives in the Rust core. A second implementation of the maths is how the two diverge silently.

Both TypeScript surfaces — the web/desktop UI and the Ink CLI — drive the Rust core through the shared `Analyzer` / `Engine` contract. The npm `sonorant-cli` shells out to the native Rust `sonorant-cli` binary for batch and conformance work where the native path is faster; both routes go through the same contract, so no maths is duplicated.

### 2. Core crates are pure and portable

`sonorant-core` and `sonorant-analysis` have **no target-specific code and no I/O**. They take `&[f32]` and return structs. Both carry `#![forbid(unsafe_code)]`. This is what makes four targets possible, and it means the analysis has no network client anywhere in its dependency graph.

### 3. No network client exists in the codebase

There is no network client in the codebase. No telemetry, no analytics, no crash reporter. CSP is `connect-src 'none'` — not `'self'`, because there is no endpoint to talk to. A CI test scans the built bundle for any external origin and fails the build on a match.

### 4. Utility crates only; the acoustic layer is written in-house

Dependency licences are gated by `cargo-deny` with an allowlist of **MIT / Apache-2.0 / BSD-3-Clause / ISC / MPL-2.0**. Any new dependency without a verified licence fails the build, not the review. MPL is file-level copyleft — acceptable if unmodified, with an explicit exception comment.

Do not depend on crates built for competing products in the same market (e.g. `loqa-voice-dsp`, `syne_audio_dsp`) — reference reading only. Do not add GPL/AGPL dependencies (Praat, Essentia, aubio). Praat is permitted only as an offline validation oracle that ships nothing.

### 5. The deliberate name collision

The Rust crate `sonorant-cli` (crates.io) and the npm package `sonorant-cli` (npm) share a name but live in different registries. This is intentional and is **not** an error. Name the registry when the context is ambiguous.

### 6. Build tooling

- Rust: Cargo workspace.
- TypeScript: npm workspaces + Turborepo.

---

## Delivery framework

The project follows the **Risk Reduction Delivery Framework (RRF)** at the **lightweight** tier. The `rrf-*` skills govern delivery phases. When asked to start or continue delivery work, identify the current phase and load the matching `rrf-*` skill; if unknown, start at `rrf-00-triage`.

Never automate: feature-flag exposure, go/no-go decisions, or launch actions. Prepare, verify, and recommend — a human approves.

---

## Binding project rules

The `.roo/rules/` directory contains binding project rules. They are not restated here — read them directly. They cover:

- **Inclusive software** (`00-inclusive-software.md`) — data modelling for names, gender, pronouns, address, and location; authentication and audit trails; accessibility; internationalisation; inclusive terminology; algorithmic fairness; privacy for vulnerable populations.
- **npm dependency handling** (`01-NPM-dependencies.md`) — never write to `package.json` directly; use npm to check latest version and install/uninstall.
- **File-edit retry strategy** (`02-file-edit-retry-strategy.md`) — use Roo's file editing tools; never use `sed`/`awk`/`perl`/`python`/`node` to modify files.
- **GitHub MCP preference** (`04-github-mcp-preference.md`) — use the GitHub MCP server, not the `gh` CLI.
- **jq usage** (`05-use-jq.md`) — use `jq` to filter JSON rather than overwhelming the context window.
- **Working from spec** (`06-working-from-spec.md`) — follow accepted architecture; audit against the spec; surface deviations before continuing.
- **Workspaces** (`07-workspaces.md`) — prefer `npm -w <PROJECT>` from the repo root in monorepos.
- **Screenshot processing** (`08-processing-screenshots.md`) — process screenshots one at a time, never in bulk.
- **AuDHD communication style** (`i-have-audhd.md`) — lead with the next action, be literal and explicit, mark approximations, signpost transitions, keep structure consistent.

When a rule conflicts with a request, surface the conflict and require an explicit override.
