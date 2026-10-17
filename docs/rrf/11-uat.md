# RRF Phase 11 — UAT Script & Execution Matrix

**Status:** draft
**Tier:** lightweight (from `rrf-00-triage`)
**Owner:** solo builder, with clinical input from a volunteer SLP
**Phase:** 11 of the Risk Reduction Delivery Framework
**Inputs:** phase 10 deploy readiness ([`../deployment.md`](../deployment.md)); phase 7 acceptance criteria ([`07-story-breakdown.md`](07-story-breakdown.md))
**Output feeds:** phase 12 (sign-off evidence)

---

## Purpose

Business testers evaluate the end-to-end workflow in a **pre-production** environment, **strictly against the phase-7 acceptance criteria**. A criterion that fails is a blocker; anything outside the criteria is a **high-priority fast-follow ticket**, not a reason to hold the launch.

**Testers.** The solo builder and the volunteer SLP. The SLP tests through the clinician's lens (does the measurement help a session?), the builder tests the member workflow.

**Environment.** A pre-production static host serving `apps/web/dist` over HTTPS (or `localhost`, which counts as secure). Flags are **on for UAT** in this environment only; they ship off (see [`../deployment.md`](../deployment.md)).

---

## A. User-facing script

Steps a non-engineer can follow. "Expected" is the criterion in plain words.

| # | Criterion (phase 7) | Steps | Expected | Tester | Result | Notes / evidence |
|---|---|---|---|---|---|---|
| 1 | S4.1 insecure context | Open the app over plain `http://` on a LAN address | A blocking panel says the microphone needs HTTPS and nothing is recorded until it is fixed | Builder | | |
| 2 | S4.1 permission | On HTTPS/`localhost`, press **Allow microphone**; accept the browser prompt | The app explains why it needs the mic before the browser prompt; after granting, the practice view opens | Builder | | |
| 3 | S4.1 denied | Deny permission, then act on the message | The error is guidance with a **Try again** action, not a dead end | Builder | | |
| 4 | S4.1 constraints | Open DevTools → the mic track's settings during a session | Echo cancellation, noise suppression and auto gain are **off**; one channel | Builder | | |
| 5 | S4.3 two-axis pad | Speak a sustained vowel | Pitch and resonance are plotted on two axes, each labelled in text, each with a distinct shape/pattern as well as colour | SLP | | |
| 6 | S4.3 low confidence | Speak very quietly, or from across the room | The pad is marked **not trustworthy yet**, with a hatch pattern and a text label — not colour alone | SLP | | |
| 7 | S4.3 reduced motion | Enable the OS "reduce motion" setting; run a session | Values update without animation | Builder | | |
| 8 | S4.4 confidence on every value | Read the summary under the pad | Every value carries a confidence; no number appears without one | SLP | | |
| 9 | S4.4 below threshold | Repeat #6 | The summary says the numbers are **not reliable yet** rather than presenting them as fact | SLP | | |
| 10 | S4.4 screen-reader summary | Read the page with a screen reader, pad ignored | The summary and confidence text alone convey the session's results | SLP | | |
| 11 | S5.2 recording off | Start a session; do not touch recording | Recording reads **off**; audio is analysed and not saved | Builder | | |
| 12 | S5.2 recording on | Turn recording on, then stop | A clear indicator and a **Stop recording** control; the file is kept on the device | Builder | | |
| 13 | S5.3 history list | Finish a session, then open history | Rows newest-first with date, exercise kind, and a short summary **including confidence** | SLP | | |
| 14 | S5.3 A/B labels | Compare two utterances | Labelled **Earlier** and **Now** in text; the "comparing against other people is off" note shows | SLP | | |
| 15 | S5.3 A/B caveats | Compare a session with no recording, or one with low confidence | The comparison states the limitation plainly instead of showing a misleading result | SLP | | |
| 16 | S5.4 trend text | Open the trend after several sessions | A sentence states direction and range with confidence | SLP | | |
| 17 | S5.4 boundary | Use two sessions recorded under different `CORE_VERSION`s | A visible discontinuity with a line, a label, and a text note — or the chart stops | Builder | | |
| 18 | S6 export default | Export history without un-ticking **Encrypt this file** | The file is encrypted by default; a passphrase is required | Builder | | |
| 19 | S6 plaintext warning | Un-tick encryption and export | An explicit warning about a plaintext file; it is not the default | Builder | | |
| 20 | S6 import report | Import an exported file | A report of what was added, skipped, or conflicted; nothing silently overwritten | Builder | | |
| 21 | S6 manifest without a passphrase | Inspect an exported file's `manifest.json` without opening the app | A user can tell what the file is (format, counts, date, whether encrypted) | Builder | | |
| 22 | S7.1 uncalibrated SPL | Look for a sound-level value anywhere | It reads **Not calibrated**; never a zero or a fake axis | SLP | | |
| 23 | S8.1 CLI status | Run `sonorant-cli analyse <file.wav>` | A result with a **status word** (`ok`/`warning`/`error`), not colour alone | Builder | | |
| 24 | S8.3 CLI errors | Run it on a missing file, then on a non-WAV file | A plain-text message stating cause and next step, and a non-zero exit | Builder | | |
| 25 | Inclusive copy | Read every message shown (headings, errors, empty states) | No blame, no urgency; chosen-name and pronoun behaviour respected throughout | SLP | | |

---

## B. Criteria verified by automation, not UAT

These are not testable by a non-engineer; they are covered by CI. Link them in the sign-off rather than re-running by hand.

| Criterion | Where |
|---|---|
| S0.2 licence/advisory gate | `cargo-deny check` (CI) |
| S0.3 egress origin scan + CSP | `npm run check:bundle` (CI) |
| S1.2 default parameters, push/drain, reset | `crates/sonorant-analysis/tests/analyzer.rs` |
| S2.2 session baseline, `t_ms` | `crates/sonorant-analysis/tests/session.rs` |
| S2.4 property tests (no panic, finite) | `crates/sonorant-analysis/tests/properties.rs` |
| S3.2 ABI wire layout | `crates/sonorant-ffi/tests/abi.rs` |
| S4.2 worklet copy/post, SAB detection | `apps/web/test/capture-processor.test.js` |
| S5.1 store rows | `apps/web/test/store-schema.test.js`, `store-summary.test.js` |
| S6.2 encryption, wrong passphrase | `crates/sonorant-archive/tests/encryption.rs` |
| S6.3/S6.4 merge + version skew | `crates/sonorant-archive/tests/import.rs`, `round_trip.rs` |
| S7.1 dBFS→SPL, estimate ≠ calibration | `crates/sonorant-calibrate/tests/calibration.rs` |
| First-run → live → history → export | `npm run check:web` (CI) |

---

## Findings triage

| Finding | Maps to criterion? | Disposition | Ticket |
|---|---|---|---|
| | yes → blocker if failed | fix before launch | |
| | no → fast-follow | high priority, following sprint | |

**Rule.** A failure against a numbered criterion blocks. Anything else — a nicer chart, a different word, a layout tweak — becomes a high-priority fast-follow ticket scheduled for the next sprint. UAT is not a scope-expansion door.

---

## Sign-off

Lightweight tier: sign-off is recorded in a ticket comment or a chat thread rather than a formal matrix export.

| Role | Name | Approved? | Date | Where recorded |
|---|---|---|---|---|
| Member / builder | | | | |
| Clinical reviewer (SLP) | | | | |

---

## Source

- [`07-story-breakdown.md`](07-story-breakdown.md) — the acceptance criteria this matrix is generated from.
- [`../deployment.md`](../deployment.md) — the pre-production environment and flag state.
- Phase 6 ([`06-finalize-designs.md`](06-finalize-designs.md)) — the exact copy and accessibility notes behind the expected results.
