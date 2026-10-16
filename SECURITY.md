# Security and privacy

Sonorant is a local-first tool. It has no backend, no account system, and no server component. This document describes the security and privacy posture, the supply-chain gates, the threat model, and how to report a vulnerability.

The authoritative source for the technical detail is the [TDD — Rust analysis core & local-first deployment](docs/TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md), §12 (Security review).

---

## The central claim

**Audio captured in the browser has no code path to the network.**

For a clinician self-hosting this, that claim is the whole security story, so it is designed to be *verifiable* rather than asserted.

How it is enforced and tested:

- **CSP `connect-src 'none'`.** Not `'self'` — there is no endpoint to talk to. Anything that tries to make a request fails, which makes the claim testable by inspection.
- **A CI test scans the built bundle for any external origin** and fails the build on a match. This catches a dependency that phones home, which is the realistic failure mode.
- **No third-party scripts, no analytics, no error-reporting SDK.** This excludes most commercial APM agents by construction.
- **No network client exists in the dependency graph.** `sonorant-core` and `sonorant-analysis` have no I/O and no target-specific code, so the analysis path cannot reach the network.

> **Note for maintainers:** the artifact renderer used during development permits `cdnjs.cloudflare.com`. The shipped app must not inherit that allowance.

---

## No telemetry, analytics, or crash reporting

There is no telemetry, no analytics, and no crash reporter. This is a constraint on the codebase, not just a policy: no network client exists in the dependency graph.

**Support without telemetry.** A "copy diagnostics" action produces a redacted blob the user chooses to paste into an issue. It contains counters, timings, and version strings. It contains **no measurements and no audio**, and the redaction is part of the function, not a user responsibility.

---

## Supply chain

- **`cargo-deny`** licence and advisory gates, with a `deny.toml` allowlist restricted to **MIT / Apache-2.0 / BSD-3-Clause / ISC / MPL-2.0**. MPL is file-level copyleft — acceptable if unmodified, with an explicit exception comment. Any new dependency without a verified licence fails the build, not the review.
- **`cargo-audit`** for known advisories.
- **SBOM and provenance attestations** on published artifacts.
- **The shipped `.wasm` hash is recorded and compared at startup**; a mismatch is a hard failure.
- **Multi-arch images** for `linux/amd64` and `linux/arm64`, built from the same commit and the same `CORE_VERSION` as the CLI binary and desktop shell. A release where they differ is a release defect.

---

## Threat model

Named and bounded:

| Threat | Mitigation |
|---|---|
| Device shared or lost | Nothing is stored centrally; reliance on device encryption; no account to compromise |
| Malicious page framing the app | `frame-ancestors 'none'` |
| Compromised dependency exfiltrating audio | CSP `connect-src 'none'` + the bundle origin scan |
| Malicious fork of the project | Out of scope technically; the mitigation is that the canonical source is documented and signed releases are published |
| PHI leaking into a diagnostics blob | Redaction is part of the diagnostics function, not a user task |

**Explicitly out of scope:** multi-tenant isolation, server-side authz, and audit trails. There is no server and no tenancy. If a backend is ever added, this entire section is void and the whole design must be revisited — which is why it is written down as a boundary rather than left as an intention.

---

## Reporting a vulnerability

**Security contact: `[MAINTAINER CONTACT — TO BE FILLED IN]`**

Please report suspected vulnerabilities privately rather than opening a public issue. Include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected version(s) and platform(s).

Do not include real audio recordings, measurements, or any personal data in a report. If a reproduction requires audio, use a synthetic or non-sensitive sample.

There is no bug-bounty programme. Reports are handled on a best-effort basis by a solo maintainer.
