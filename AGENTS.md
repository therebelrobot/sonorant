# AGENTS.md — instructions for AI coding agents

This file tells AI coding agents how to work in the Sonorant repository. Read it before making changes. It is a map and a set of hard constraints, not a tutorial.

Long-form project rules live in [`docs/rules/`](docs/rules/), one file per topic. This file is the entry point: it inlines the rules that apply on every change, and links the fuller text. Any agent that reads `AGENTS.md` — opencode, Claude Code, Cursor, and compatible tools — gets the essentials here.

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
    rules/              # project rules (this file links here)
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

Dependency licences are gated by `cargo-deny` (config: [`deny.toml`](deny.toml); verification record: [`docs/dependency-licences.md`](docs/dependency-licences.md)) with an allowlist of **MIT / Apache-2.0 / BSD-3-Clause / ISC / MPL-2.0 / Unlicense**. Any new dependency without a verified licence fails the build, not the review. MPL is file-level copyleft — acceptable if unmodified, with an explicit exception comment in `deny.toml`.

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

The invariants that never scale away are in [`docs/rules/risk-reduction-framework.md`](docs/rules/risk-reduction-framework.md).

---

## Project rules

These are binding on every change. The full text of each rule is a file in [`docs/rules/`](docs/rules/); the essentials are below so a rule is never missed by an agent that only reads this file. When a rule conflicts with a request, surface the conflict and require an explicit override.

### Working from the spec
Follow the accepted architecture as closely as technically possible. After implementing, audit the result against the spec. If you cannot follow the spec for a technical reason, stop: present the issue and an alternative, and wait for acceptance before continuing — never assume the answer. If an alternative is accepted (or the user directs a deviation), update the spec document *before* continuing, so it reflects the new state. — *reason: an undocumented divergence is how the code and the spec silently disagree.* Full: [`docs/rules/working-from-spec.md`](docs/rules/working-from-spec.md).

### Don't overthink; take the first step
When a spec already exists, do not deliberate about the whole implementation at the expense of calling tools. Identify the first step, execute it, then continue. — *reason: deliberation that replaces action produces no artifact.* Full: [`docs/rules/overthinking.md`](docs/rules/overthinking.md).

### npm dependencies: never hand-edit `package.json`
Check the latest version with npm, then install/uninstall with npm. Hand-written version strings are frequently hallucinated or stale. Applies to every `package.json` in the monorepo. — *reason: npm is the source of truth for versions and the lockfile.* Full: [`docs/rules/npm-dependencies.md`](docs/rules/npm-dependencies.md).

### Edit files with the file-editing tools, not shell scripts
Modify files with the edit/write tools. Never use `sed`, `awk`, `perl`, `python`, `node`, `ruby`, or shell redirection to modify an existing file. Creating a brand-new file with the write tool is fine. If an edit fails to match, escalate — do not loop: (1) split it into smaller edits; (2) re-read and rewrite the whole file; (3) chunk a very large file; (4) if all fail, present the intended content in a fenced block and ask the human to paste it. — *reason: tool edits are reviewable and reversible; scripted edits evade review and can silently corrupt a file.* Full: [`docs/rules/file-edits.md`](docs/rules/file-edits.md).

### GitHub operations: use the GitHub MCP server, not `gh`
Create, update, and read PRs, issues, reviews, releases, labels, and repository data through the GitHub MCP server. If the server is unavailable, stop and ask the human to configure it — never fall back to `gh` silently. `gh` is allowed only for what MCP cannot do (e.g. `gh auth status`), and say why. — *reason: MCP gives structured, reliable API access with proper error handling.* Full: [`docs/rules/github-mcp.md`](docs/rules/github-mcp.md).

### Filter JSON with `jq`
When reading JSON responses or files, use `jq` to select only what is needed. Do not use `python` when `jq` can do the job. — *reason: unfiltered JSON floods the context window.* Full: [`docs/rules/json-and-jq.md`](docs/rules/json-and-jq.md).

### Monorepos: run npm scripts with `-w <project>` from the root
Prefer `npm -w <PROJECT> …` from the repo root. Do not `cd` into a workspace to run commands unless unavoidable. — *reason: root execution keeps the workspace graph and lockfile consistent.* Full: [`docs/rules/npm-workspaces.md`](docs/rules/npm-workspaces.md).

### Process screenshots one at a time
Never process images in bulk — bulk image handling causes an unrecoverable provider error. One image per turn. — *reason: bulk images break the session.* Full: [`docs/rules/screenshots.md`](docs/rules/screenshots.md).

### Inclusive software
Applies by default to anything touching identity, demographics, accessibility, communication, or decisions about people; override only with an explicit written justification. This project handles voice recordings of transgender people and other vulnerable users, so these rules are load-bearing, not decorative. The constraints to hold in mind:

- **Data-minimise.** Do not collect a demographic field without naming (a) the decision it informs, (b) who can read it, (c) retention, and (d) the harm if it leaks. If you cannot justify all four, delete the field.
- **Names:** a single mutable `full_name` — Unicode, ≥ 256 bytes, keyed by an opaque id. Never `first_name`/`last_name`; never validate against a name regex.
- **Chosen vs legal name:** keep them separate; `chosen_name` is the default display everywhere. Protect against deadname leakage in denormalised reads, audit surfaces, and notification text.
- **Gender and pronouns:** gender identity, sex assigned at birth, and legal sex marker are three separate optional fields; pronouns are free text (never "preferred"); never infer gender from name, voice, face, or behaviour.
- **Accessibility:** WCAG 2.2 AA minimum; semantic HTML before ARIA; never convey information by colour alone; respect `prefers-reduced-motion`; interactive targets ≥ 24×24 CSS px.
- **Internationalisation from the first commit:** externalise strings, use `Intl` for dates/numbers, support RTL if Arabic/Hebrew/Persian/Urdu is in scope, allow 30–40% text expansion.
- **Terminology and copy:** use inclusive terms (allow-list/deny-list, primary/replica, main, placeholder); trauma-informed copy with no blame or urgency.
- **Traceability:** cite the rule id in code comments and PR descriptions when applying a constraint (e.g. `// R1.5: chosen_name only`).

Full rule set with sources: [`docs/rules/inclusive-software.md`](docs/rules/inclusive-software.md).

### Communication style
Write for an AuDHD reader: lead with the next action, answer the literal question first, number multi-step work, keep a consistent response shape across turns, restate state each turn, mark approximations explicitly, give every instruction a reason clause, and make completed work visible. No preamble, no recap, no closers. Full interface contract: [`docs/rules/audhd-communication.md`](docs/rules/audhd-communication.md). In opencode this is also available as the `i-am-audhd` skill.
