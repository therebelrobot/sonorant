# Deployment

**Status:** v1 (RRF phase 10)
**Authority:** TDD §10 (deployment and self-hosting), §15 (build and release), §7.2 (rollback safety), §11 (diagnostics).

There is no backend. "Deploy" means publishing a static bundle and release binaries; "rollback" means restoring the previous bundle. Nothing runs as a service.

---

## What ships

- **A static bundle** — `index.html`, the app JS, `sonorant_ffi_bg.wasm`, the worklet shim, the worker, and `_headers`. Servable from any static host, CDN, object store, or local Caddy/nginx. No environment variables, no server runtime, no database.
- **A CLI** — the native Rust `sonorant-cli` (crates.io) and the npm `sonorant-cli` (Ink), plus the npm `sonorant` WASM wrapper.
- **Nothing else.** There is no service tier.

---

## Operator requirements

- **HTTPS is mandatory.** `getUserMedia` needs a secure context. `localhost` counts as secure, so local development needs no certificate; any LAN or public address does.
- **TLS** — for a purely local deployment, a self-signed certificate or a local CA. Document the workflow for the operator; this is the most likely place a self-hoster gets stuck.
- **No COOP/COEP headers are required** — `SharedArrayBuffer` is not used by default (TDD §6.1).
- **CSP.** `apps/web/public/_headers` is the single source of truth (`connect-src 'none'`, `frame-ancestors 'none'`). Hosts that read `_headers` (Cloudflare Pages, Netlify) apply it; other hosts must set the same headers. `frame-ancestors` cannot be set from a `<meta>` tag.

---

## Build

```sh
npm ci
npm run wasm:build   # regenerate packages/sonorant/pkg from crates/sonorant-ffi
npm run build        # apps/web/dist (static bundle) + workspace packages
cargo build --release -p sonorant-cli
```

`npm run wasm:build` regenerates the wasm; update `EXPECTED_WASM_SHA256` in `packages/sonorant/src/wasm-hash.js` to the new digest for the same commit.

---

## Version alignment (TDD §15)

The `.wasm`, the CLI binary, and (when it ships) the desktop shell are built from the **same commit and the same `CORE_VERSION`**. A release where they differ is a release defect. The bundle's wasm hash is recorded and compared at startup; a mismatch is a hard failure, not a silent misread.

`CORE_VERSION` is semver. A **MAJOR** bump means a published measure can shift beyond its documented tolerance (TDD §9); release notes must say so.

---

## Upgrade and rollback

- **Upgrade** is replacing the static bundle.
- **Rollback** is restoring the previous one — the previous release artifact is retained, so rollback is one documented command, e.g.
  `tar -xzf sonorant-web-<previous>.tar.gz -C <docroot>`
- **Rollback safety rule (TDD §7.2):** a schema change must be readable by the immediately previous release, or the app must prompt for an archive export first. Users are never left with data they cannot open.
- **Archives are the user's backup.** The app prompts for an export before any migration a previous release could not read.

---

## Feature flags ship inactive

All runtime flags live in `apps/web/src/flags.js` and **default to off** (`enable-local-history`, `enable-history-ab`, `enable-longitudinal-trends`, …). **v1 ships dormant.** Turning a flag on is the business-launch decision (RRF phases 12–13) and stays **human-approved — never automated**.

---

## Deployment verification checklist

Adapted for this project: there is no backend, no migrations, and no server-side dashboards. Export an archive first if a release changes the stored schema.

**Pre-deploy**

- [ ] Previous release artifact retained; the rollback command has been run once (not just written).
- [ ] Flags default off: `isEnabled(key)` returns `false` for every key in `apps/web/src/flags.js`.
- [ ] Egress scan clean: `npm run check:bundle`.
- [ ] Automated browser checks pass: `npm run check:web`.
- [ ] `EXPECTED_WASM_SHA256` matches `packages/sonorant/pkg/sonorant_ffi_bg.wasm`.

**Post-deploy**

- [ ] The served bundle's CSP sets `connect-src 'none'` and `frame-ancestors 'none'`.
- [ ] The app loads over HTTPS (or `localhost`) and the microphone permission panel appears.
- [ ] DevTools shows **no request to any external origin**.
- [ ] CLI: `sonorant-cli analyse <wav>` prints a status word (`ok`/`warning`/`error`); `sonorant-cli --version` matches the release.
- [ ] Diagnostics thresholds (TDD §11) behave locally — analytics latency, capture dropout, mean formant confidence, input-integrity warnings.

**Anomalies and actions**

| Anomaly | Action taken | Resolved? |
|---|---|---|
| | | |

**Verified by:**  **Next check scheduled:**

---

## Monitoring

There is no operations tier and nothing is transmitted (TDD §11). Diagnostics are **local-only**: latency, dropout, confidence, and version strings, surfaced in the in-app diagnostics panel. Support without telemetry is the "copy diagnostics" action, which produces a **redacted** blob (counters, timings, version strings — **no measurements and no audio**), with the redaction part of the function, not a user task.

## Supply chain

- `cargo-deny` licence and advisory gates, `cargo-audit`.
- A software bill of materials (SBOM) and build provenance attestations on released artifacts (see `.github/workflows/release.yml`).
- The shipped `.wasm` hash is recorded and compared at startup.
