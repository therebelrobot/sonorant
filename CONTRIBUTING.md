# Contributing to Sonorant

Thanks for considering a contribution. Sonorant is a local-first, open-source voice analysis and training tool. It is early — pre-implementation — so the most useful contributions right now are design review, measurement methodology, and the first Rust crate.

Before you start, read [`AGENTS.md`](AGENTS.md) for the hard technical constraints, and the two authoritative documents in [`docs/`](docs/):

- [Project brief — voice analysis & training tool](docs/Project%20brief%20%E2%80%94%20voice%20analysis%20%26%20training%20tool.md)
- [TDD — Rust analysis core & local-first deployment](docs/TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md)

---

## Where to start

The project is at the design stage. There is no code yet. The **first artifact is the Rust `sonorant-cli` crate** — a batch analyser, conformance harness, and fixture generator. It gives a fast, debuggable loop on real recordings with no browser in the way, and it is the same binary the regression fixtures and the batch path need.

If you want to contribute code, that is the place to begin.

---

## Development environment

Prerequisites:

- **Rust toolchain** — install via [rustup](https://rustup.rs/). The workspace targets `wasm32-unknown-unknown` for the browser build, so add that target: `rustup target add wasm32-unknown-unknown`.
- **Node.js** — a current LTS release.
- **npm** — ships with Node. The TypeScript side uses **npm workspaces + Turborepo**.
- **`wasm-pack`** — for building the WASM artifact.
- **`cargo-deny`** and **`cargo-audit`** — for the dependency-licence and advisory gates.

---

## Build and test

The repository is a monorepo with two tooling layers: a **Cargo workspace** for Rust, and **npm workspaces + Turborepo** for TypeScript.

### Rust

```sh
# Build the whole workspace
cargo build

# Run the test suite
cargo test

# Lint
cargo clippy --all-targets --all-features

# Format
cargo fmt --check
```

### TypeScript

Run npm scripts from the repo root using the workspace flag, rather than changing directory:

```sh
# Install all workspace dependencies
npm install

# Run tasks across the workspace via Turborepo
npx turbo run build
npx turbo run test
npx turbo run lint
```

### Dependency gates

The dependency-licence gate is mechanical, not a review step. Run it locally before opening a PR:

```sh
cargo deny check
cargo audit
```

Any new dependency without a verified licence fails the build. The allowlist is **MIT / Apache-2.0 / BSD-3-Clause / ISC / MPL-2.0**. MPL is file-level copyleft — acceptable if unmodified, with an explicit exception comment.

---

## Code style

- **Rust:** `cargo fmt` and `cargo clippy` are the baseline. `sonorant-core` and `sonorant-analysis` carry `#![forbid(unsafe_code)]` and must stay free of target-specific code and I/O.
- **TypeScript:** the UI and orchestration layer only. **No acoustic maths in TypeScript, ever** — not even a fallback path. All acoustic maths lives in the Rust core.
- **No network client.** No telemetry, no analytics, no crash reporter. CSP is `connect-src 'none'`.
- **Inclusive language and data modelling.** The project's primary users are transgender people. Follow the inclusive-software rules in [`.roo/rules/00-inclusive-software.md`](.roo/rules/00-inclusive-software.md): gender-neutral defaults, no deadnaming, correct person-first/identity-first terminology, and no gendered assumptions in sample data.

---

## Pull request process

1. **Open an issue first** for anything non-trivial, so the approach can be discussed before code is written. The project follows the Risk Reduction Delivery Framework (RRF); design decisions are made deliberately, and one-way doors (measure versioning, the export file format, the licence) get extra review.
2. **Keep changes small and focused.** One concern per PR.
3. **Run the gates locally** — `cargo test`, `cargo clippy`, `cargo deny check`, `cargo audit`, and the TypeScript build/test tasks.
4. **Describe the change** and, where relevant, cite the rule or spec section it implements.
5. **Surface deviations from the spec.** If a technical reason prevents following the accepted architecture, say so in the PR and propose an alternative rather than diverging silently.

---

## Licence

Sonorant is released under the **Unlicense** — it is in the public domain. See [`LICENSE`](LICENSE).

**By contributing, you agree that your contributions are also released into the public domain under the Unlicense.** There is no copyright to assign and no contributor licence agreement to sign.

The licence was chosen deliberately: health-system and clinic legal review is dramatically easier with public domain than with copyleft, and a clinician self-hosting this in a professional environment is a primary audience.

---

## Code of conduct

Participation in this project is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
