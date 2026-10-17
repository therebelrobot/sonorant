# RRF Phase 12 — Go/No-Go

**Status:** draft (decision not recorded — human-owned)
**Tier:** lightweight (from `rrf-00-triage`)
**Owner:** solo builder, with clinical input from a volunteer SLP
**Phase:** 12 of the Risk Reduction Delivery Framework
**Inputs:** phase 8 tests, phase 10 deploy readiness ([`../deployment.md`](../deployment.md)), phase 11 UAT ([`11-uat.md`](11-uat.md))
**Output feeds:** phase 13 (launch), or a scheduled re-check

---

## Purpose

A formal check-in confirms technical and operational readiness before any member exposure. The checklist below is **pre-filled with evidence** so the conversation is about judgement, not information gathering.

> **Hard stop.** An agent **never records or announces the go/no-go decision**. It prepares this checklist and memo; a human records the decision. Likewise, an agent never turns a feature flag on — exposure is the launch action (phase 13).

A "**no**" is the process working, not a failure. It identifies a gap, assigns an owner, and reschedules — blamelessly.

---

## Readiness checklist

### Engineering

- [ ] **CI green** on the release commit: Rust `cargo build/test`, `cargo-deny` (licences + advisories), Node `npm run build/test`, `check:bundle` (egress + CSP), `check:web` (browser).
- [ ] **Rollback executed once, not just documented** — the previous bundle was restored in pre-production and the app ran (see [`../deployment.md`](../deployment.md)).
- [ ] **Flags default off** — `isEnabled(key)` returns `false` for every key; UAT-only overrides are not in the shipped artifact.
- [ ] **Version alignment** — the `.wasm`, the CLI binary, and the web bundle are built from the same commit and the same `CORE_VERSION`.
- [ ] **Wasm hash recorded** — `EXPECTED_WASM_SHA256` matches the artifact; a mismatch is a hard startup failure.
- [ ] **Operator requirements documented** — HTTPS mandatory, `localhost` counts, TLS for LAN/public, no COOP/COEP.

### Product

- [ ] **UAT sign-off recorded** ([`11-uat.md`](11-uat.md)) — every acceptance criterion has a recorded pass/fail.
- [ ] **Fast-follow list scheduled** — high-priority, next sprint; not parked.
- [ ] **No blocker open** against a numbered criterion.

### Operations / support

- [ ] **No operations tier** — there is no backend to staff. Support is the in-app **redacted diagnostics** blob (TDD §11).
- [ ] **Archive backup expectation set** — the app prompts for an export before any migration a previous release could not read.

### Open items (not blockers by decision, but visible)

| Item | State | Effect on v1 |
|---|---|---|
| Calibration flow + SPL values — issue **#1** | hardware-blocked | SPL reads **Not calibrated** everywhere; nothing else changes |
| Desktop shell — issue **#2** | deferred | web + CLI only; no native capture |

---

## Proposed rollback triggers (draft — human-owned)

Write these down **before** any "go". Each maps to a phase-4 risk or a phase-10 gate.

| Trigger | Action |
|---|---|
| The egress scan finds an external origin in a released bundle | Roll back to the previous bundle; treat as a security defect |
| A released artifact's wasm hash does not match the recorded digest | Roll back; investigate the build, don't patch around it |
| A `cargo-deny` advisory or licence failure on the release commit | Do not release; resolve or replace the dependency |
| A narrowing bug in a shipped acceptance criterion (a value shown without confidence, a fake SPL axis, pitch and resonance not separable) | Roll back; these are the principles the tool exists to keep |
| A schema change that the previous release cannot read, released without an export prompt | Roll back; the rollback-safety rule (TDD §7.2) is not optional |

---

## Decision memo (draft)

| Function | Participant | Ready? (yes/no/unsure) | Evidence |
|---|---|---|---|
| Engineering | builder | | CI run; [`../deployment.md`](../deployment.md) |
| Product | builder | | [`11-uat.md`](11-uat.md) sign-off |
| Clinical review | volunteer SLP | | UAT rows 5–10, 13–16, 22, 25 |
| Operations / support | builder | | diagnostics path documented |

**Decision:** _not recorded_ — human-owned.
**Participants / date / where recorded:** _pending._
**If a pause:** gap, owner, reschedule date: _pending._

---

## Exit criteria

- Decision recorded with participants and evidence — **or** a pause recorded with gap, owner, and reschedule date.
- Rollback triggers documented as part of any "go".

## Source

- [`../deployment.md`](../deployment.md) — deploy readiness, rollback, flags inactive.
- [`11-uat.md`](11-uat.md) — the UAT matrix and sign-off.
- [`04-risk-constraints.md`](04-risk-constraints.md) — the risk register behind the rollback triggers.
- [`07-story-breakdown.md`](07-story-breakdown.md) — the milestones whose criteria must pass.
