# Technical Design Document — Rust analysis core & local-first deployment

**Status:** draft
**Tier:** lightweight (`rrf-00-triage`)
**Inputs:** project brief (`voice-analysis-prd`), dependency research pass
**Scope note:** rewritten after the tier correction. All sync, RBAC, audit, and compliance
sections are removed because there is no backend and no covered entity. Added: operator
deployment, measure versioning, and export/import as the portability story.

---

## 1. Decision

**Build the analysis core in Rust, as a single implementation compiled to four targets:**
`wasm32-unknown-unknown` (browser), native desktop and mobile via Tauri 2, a native CLI (batch and
self-hosted), and arm64 Linux for a homelab host.

**TypeScript is the UI and orchestration layer only.** There are two TypeScript orchestration
surfaces — the web/desktop UI, and the user-facing Ink CLI (`sonorant-cli`, §3) — and neither
computes acoustics. No acoustic maths in TypeScript, ever — not even a fallback path. Both surfaces
drive the Rust core through the shared `Analyzer` / `Engine` contract. A second implementation of
the maths is how the two diverge silently.

**There is no server component in v1.** Not a deferred one, not an optional one. The system is a
static web bundle plus a local binary, and the absence of a backend is what makes the rest of this
document simple.

### Decision drivers
1. **No rewrite later.** One core, four targets, no port.
2. **The core is the project's value.** High-F0 formant robustness is the differentiator; it must
   be tunable, and it cannot be tuned inside someone else's crate.
3. **Utility-crate licensing is clean in Rust** (MIT/Apache-2.0 for FFT and audio I/O), whereas the
   mature speech-analysis libraries elsewhere are GPL or AGPL.
4. **No backend is a deliberate architectural choice, not a simplification.** A static bundle plus
   a local binary has no PHI repository, no operating cost, nothing to patch on a schedule, and no
   service for a clinician's IT review to assess. It is the reason this is sustainable by one
   person and deployable by a clinic.
5. **Native capture will be needed eventually** (calibrated SPL, all-day dose), and Tauri reuses
   the entire web UI. Choosing Rust now makes the shell an addition rather than a fork.

### Alternatives considered and rejected
| Option | Why rejected |
|---|---|
| TypeScript DSP, Rust later | Guarantees the rewrite this decision exists to avoid |
| TypeScript DSP, permanently | No path to native capture without a second implementation |
| Python core (Praat/librosa lineage) | GPL/AGPL for the good parts; no viable browser target |
| Depend on `loqa-voice-dsp` / `syne_audio_dsp` | Small, new, unverified licences, and directly in the same product space |
| A sync backend for cross-device history | Introduces a PHI repository and an operating cost to solve a problem export/import already solves |

### Consequences accepted
- wasm-bindgen glue and a real build pipeline before the acoustics are proven.
- No fast DSP iteration in a REPL; every change is a compile.
- A Rust toolchain and `cargo-deny` in CI, maintained by one person.
- **Mitigation:** build `sonorant-cli` first. It gives a fast, debuggable loop on real recordings with
  no browser in the way, and it's the same binary the regression fixtures and the batch path need.

---

## 2. One-way vs two-way doors

**One-way (decide deliberately):**
- **Measure versioning policy (§9).** Once users have months of history, changing an algorithm
  silently invalidates their trends. The policy has to exist before the first release, not after.
- **The export file format.** Users will have years of archives in it.
- **The licence.** Decided: Unlicense.
- The core-as-single-implementation commitment.

**Two-way:** the WASM loading strategy, the storage engine behind the local cache, the
visualisation layer, the desktop shell's existence, and every reference-band default.

---

## 3. System architecture

```
                    ┌──────────────── sonorant-core (Rust crate) ─────────────────┐
                    │  pitch · formants · voice quality · metrics · serialisation │
                    └───────┬──────────────┬───────────────┬──────────────┬───────┘
                            │              │               │              │
                     wasm32-unknown   native lib      native lib     native lib
                            │              │               │              │
                    ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼─────┐ ┌─────▼──────┐
                    │ Web app      │ │ Tauri 2    │ │ CLI        │ │ Homelab /  │
                    │ Worker thread│ │ desktop    │ │ batch +    │ │ arm64 host │
                    │              │ │ + mobile   │ │ self-host  │ │            │
                    └───────┬──────┘ └─────┬──────┘ └──────┬─────┘ └─────┬──────┘
                            │              │               │             │
                    ┌───────▼──────────────▼───────────────▼─────────────▼───────┐
                    │ Capture shim — per-target, NOT portable (see §6)            │
                    │  getUserMedia+AudioWorklet │ cpal/AVAudioEngine/AudioRecord │
                    └─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────▼────────────────────────────────────────────────────┐
                    │ Local storage only. No network client exists in the codebase│
                    │  OPFS (audio) + IndexedDB (rows) + export/import (§8)       │
                    └────────────────────────────────────────────────────────────┘
```

### Monorepo layout

The repository is a monorepo with two tooling layers: a **Cargo workspace** for the Rust crates,
and **npm workspaces + Turborepo** for the TypeScript side.

```
sonorant/
  Cargo.toml              # cargo workspace root
  package.json            # npm workspace root (workspaces field)
  turbo.json              # Turborepo task graph
  crates/
    sonorant-core/        # no_std-friendly numerics: FFT wrappers, LPC, YIN, cepstrum, formants
    sonorant-analysis/    # frame pipeline, AnalysisFrame assembly, session state machine
    sonorant-calibrate/   # calibration store, dBFS -> dB SPL conversion
    sonorant-archive/     # history export/import container + AEAD
    sonorant-ffi/         # wasm-bindgen surface (thin; no logic)
    sonorant-capture/     # native capture (cpal) + device enumeration
    sonorant-cli/         # Rust batch analyser, conformance harness, fixture generator
  apps/
    web/                  # TS UI + AudioWorklet shim + Worker
    desktop/              # Tauri 2 shell reusing apps/web
  packages/
    sonorant/             # npm: WASM core wrapper
    sonorant-cli/         # npm: Ink CLI (TypeScript orchestration/UI only)
  docs/
```

**npm packages.** Two packages publish to npm:

- **`sonorant`** — the npm library that wraps the WASM core (the `sonorant-ffi` / `sonorant-core`
  wasm artifact). This is the package a web or TypeScript consumer imports; it ships the
  `sonorant_core_bg.wasm` artifact plus the typed loader.
- **`sonorant-cli`** — the user-facing CLI, implemented in TypeScript with
  [Ink](https://github.com/vadimdemedes/ink). It is an orchestration and presentation layer only,
  and contains **no acoustic maths**. It drives the Rust core through the `sonorant` WASM wrapper,
  and shells out to the native `sonorant-cli` Rust binary for batch and conformance work where the
  native path is faster. Both routes go through the same `Analyzer` / `Engine` contract (§4), so no
  maths is duplicated in TypeScript.

**Deliberate name collision.** The Rust crate `sonorant-cli` (reserved on crates.io) and the npm
package `sonorant-cli` share a name but live in different registries. This is intentional and is
**not** an error: the crates.io `sonorant-cli` is the internal batch/conformance binary, and the
npm `sonorant-cli` is the user-facing Ink orchestration CLI. Name the registry when the context is
ambiguous.

**Rule:** `sonorant-core` and `sonorant-analysis` have no target-specific code and no I/O. They take `&[f32]`
and return structs. This is what makes four targets possible, and it means the analysis has no
network client anywhere in its dependency graph — which is what makes §12's claim about egress
verifiable rather than aspirational.

---

## 4. The analysis core contract

### 4.1 Types

```rust
#![forbid(unsafe_code)]   // sonorant-core, sonorant-analysis

pub const MAX_FORMANTS: usize = 5;

#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct Formant {
    pub hz: f32,
    pub bandwidth_hz: f32,
    /// 0..1. Prominence of the pole above the local envelope floor, tempered by
    /// pole stability across neighbouring frames.
    pub confidence: f32,
}

#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct AnalysisFrame {
    pub t_ms: u32,              // since session start
    pub f0_hz: f32,             // <= 0.0 => unvoiced
    pub voicing: f32,           // 0..1
    pub f0_confidence: f32,     // 0..1
    pub formants: [Formant; MAX_FORMANTS],
    pub hnr_db: f32,
    pub cpp_db: f32,            // cepstral peak prominence
    pub tilt_db_per_oct: f32,   // long-term average spectral tilt
    pub h1_h2_db: f32,          // vocal-weight proxy
    pub centroid_hz: f32,
    /// Vowel-independent formant scale, in semitones, relative to this
    /// session's own baseline. Negative = larger apparent tract.
    pub scale_semitones: f32,
    pub rms_dbfs: f32,
    pub spl_db: f32,            // NaN unless a calibration is active
    /// Voiced-cycle period perturbation, in percent. NaN unless the frame is
    /// voiced and holds >= MIN_PERIODS (4) detected cycles. Its confidence is
    /// `f0_confidence` (§4.2): the period marks come from the pitch estimate.
    pub jitter_local: f32,
    /// Voiced-cycle amplitude perturbation, in percent, on the peak |x| within
    /// each cycle. NaN under the same conditions as `jitter_local`.
    pub shimmer_local: f32,
    /// Bitfield of the flags module below, stored as an `f32` so the struct
    /// stays all-`f32` for the flat `Float32Array` view (§4.4).
    pub flags: f32,
}

/// The frame flags. Set on the frame where the condition holds, and shown as text
/// in the UI, never by colour alone.
pub mod flags {
    /// The input overloaded: a run of consecutive samples at the digital rail.
    /// A single sample touching full scale is a *peak*, not a clip.
    pub const CLIPPED: f32          = 1.0;
    /// A voiced frame at the edge of voicing: `hnr_db < 10`. The clinical 7 dB
    /// cut is unreachable in this pipeline — a frame noisy enough to reach it is
    /// no longer detected as voiced — so the floor is derived, not copied (§4.2).
    pub const LOW_SNR: f32          = 2.0;
    /// A low, barely periodic frame: `f0_hz <= 70` and `hnr_db < 15`. Canonical
    /// creak (20–60 Hz) sits below the tracker floor and reads unvoiced, so this
    /// catches the edge only; a longer analysis window is the real fix (§16.7).
    pub const CREAK: f32            = 4.0;
    /// The pitch estimate may be a sub-multiple of the true f0: the lag at twice
    /// the chosen period is decisively more periodic than the chosen one.
    pub const SUBHARMONIC: f32      = 8.0;
    /// The frame has formants, but their mean confidence is below 0.25.
    pub const FORMANT_UNSTABLE: f32 = 16.0;
    /// No calibration is attached, so `spl_db` is `NaN`.
    pub const UNCALIBRATED: f32     = 32.0;
}

#[derive(Clone, Copy, Debug)]
pub struct AnalysisParams {
    pub sample_rate: u32,
    pub frame_len: usize,       // 2048 default
    pub hop: usize,             // 512 default @44.1k => ~86 fps
    pub pre_emphasis: f32,      // 0.97
    pub lpc_order: u16,         // clamp(2 + sr/1000, 18, 24)
    pub max_formant_hz: f32,    // 5500 default
    pub voicing_threshold: f32,
}

pub trait Analyzer {
    fn configure(&mut self, params: AnalysisParams);
    /// Consume PCM, emit zero or more frames into internal state.
    fn push(&mut self, pcm: &[f32]) -> usize;
    /// Copy out pending frames; returns how many were written.
    fn drain(&mut self, out: &mut [AnalysisFrame]) -> usize;
    fn reset(&mut self);
}
```

### 4.2 Deliberate design choices

- **`#[repr(C)]` and all-`f32` structs.** Keeps the WASM boundary a flat memory copy, so the same
  struct can be read as a `Float32Array` view on the JS side with no marshalling.
- **`scale_semitones` is computed in the core, not the UI.** It is a log-ratio against the session
  baseline and is the one derived quantity that must be identical everywhere.
- **`spl_db` is `NaN` without a calibration.** Not zero, not an estimate. `NaN` forces every
  consumer to handle "uncalibrated" explicitly rather than plotting a fake SPL axis.
- **Confidence on every measured quantity.** The UI rule is that a value without a confidence is
  not displayable. The perturbation measures carry no field of their own — the frame is flat and
  fixed (§4.4) — so their confidence is `f0_confidence`, because the cycle marks are derived from
  the pitch estimate.
- **No perceptual scales in the core.** Bark mapping, semitone conversion, and reference
  comparison live in the UI. Exception: `scale_semitones`, which is unit-bearing by definition.

### 4.3 FFI surface (thin, no logic)

```rust
#[wasm_bindgen]
pub struct Engine { inner: Box<dyn Analyzer>, scratch: Vec<AnalysisFrame> }

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32) -> Engine;
    pub fn configure(&mut self, frame_len: usize, hop: usize, lpc_order: u16);
    pub fn push(&mut self, pcm: &[f32]) -> usize;
    /// Pointer to a contiguous AnalysisFrame array. Read via Float32Array over
    /// memory.buffer using the layout in §4.4.
    pub fn frames_ptr(&self) -> *const AnalysisFrame;
    pub fn frames_len(&self) -> usize;
    pub fn reset(&mut self);
    pub fn core_version(&self) -> String;
    pub fn abi_version(&self) -> u32;
}
```

### 4.4 Wire layout

`AnalysisFrame` is a fixed-size struct of 29 `f32`s plus `t_ms` (`u32`) — 30 words total (29 `f32`
+ 1 `u32`); `flags` is one of the `f32`s. JS reads it as a `Float32Array` over `memory.buffer` with
a stride of 30 words and the field order in §4.1. The layout is versioned with `CORE_ABI_VERSION`; a
mismatch between the JS reader and the core is a hard startup failure, not a silent misread.

---

## 5. Dependency register

**Rule: utility crates only. The acoustic layer is written in-house.**

| Crate | Purpose | Licence | Verification status |
|---|---|---|---|
| `rustfft` | FFT, SIMD (AVX/SSE/NEON/WASM) | MIT OR Apache-2.0 | reported; **verify in-repo** |
| `realfft` | real-to-complex FFT | MIT | registry listing says MIT; **verify** |
| `cpal` | cross-platform audio I/O | Apache-2.0 | reported; **verify** |
| `wasm-bindgen`, `js-sys`, `web-sys` | WASM/web bindings | MIT OR Apache-2.0 | verify |
| `hound` | WAV read/write (fixtures, export) | Apache-2.0 | **verify** |
| `symphonia` | audio decode (import path) | MPL-2.0 | **verify**; MPL is file-level copyleft — acceptable if unmodified, note in the licence policy |
| `serde`, `serde_json` | serialisation | MIT OR Apache-2.0 | verify |
| `chacha20poly1305` + `argon2` | archive encryption (§8) | MIT OR Apache-2.0 | verify |
| `zip` | archive container (§8) | MIT | verify |
| `thiserror` | error types | MIT OR Apache-2.0 | verify |

**Evaluate, do not depend:**
- `pitch-detection` — autocorrelation / MPM / YIN / PYMPM / PYIN, WASM-targeted. Licence
  **unverified**. Read it, then write the tracker in-house against de Cheveigné & Kawahara (2002)
  and McLeod & Wyvill (2005).
- `pyin-rs` — FFT-based YIN and probabilistic YIN. Licence **unverified**.
- `loqa-voice-dsp`, `syne_audio_dsp` — prior art in this exact product space (LPC formants, HNR,
  H1–H2). Reference reading only. Depending on a crate built for a competing product in the same
  market is both a strategic and a supply-chain risk.

**Excluded by licence:** Praat and anything embedding it (GPL v3-or-later), Essentia (AGPL), aubio
(GPL). Praat is permitted as an **offline validation oracle** that ships nothing (§14).

**CI gate:** `cargo-deny` with `licenses` and `advisories` enabled, `cargo-audit`, and a `deny.toml`
allowlist restricted to MIT / Apache-2.0 / BSD-3-Clause / ISC / MPL-2.0 / Unlicense with an explicit
exception comment for any MPL crate. (Unlicense is the project's own licence and is
public-domain-equivalent; it was added to the allowlist 2026-10-16 by owner direction.) Any new dependency without a verified licence fails the build, not the
review. This matters more for a solo project than a staffed one: there is no legal department, so
the gate has to be mechanical.

---

## 6. Capture layer — and why it is not portable

**Analysis is portable; capture is not.** The browser owns the microphone through `getUserMedia`;
no Rust API reaches it. `sonorant-capture` exists only for native targets. The web target has a
TypeScript shim with the same contract, and the two are kept honest by a shared conformance fixture
set, not by a shared trait.

### 6.1 Browser capture (the part that goes wrong)

**Constraint, stated plainly:** loading a `wasm-pack --target web` ES module inside an
`AudioWorklet` does not work. The worklet global scope does not support ES module resolution. This
is a known toolchain limitation, not a configuration mistake. Supported approaches:

1. Compile with `wasm-bindgen --target no-modules`, fetch the `.wasm` once on the main thread,
   transfer the `ArrayBuffer` into the worklet, and call `WebAssembly.instantiate(bytes, imports)`
   inside the worklet.
2. Or implement the `AudioWorkletProcessor` in JS and call into WASM from `process()`.

**Recommended shape — the worklet does almost nothing:**

```
AudioWorkletProcessor (real-time thread)
  └─ copies input frames into a transferable Float32Array
  └─ postMessage(frame, [buffer])  ──►  Worker (normal thread, no real-time budget)
                                          └─ feeds sonorant-analysis
                                          └─ posts AnalysisFrame batches back to the UI
```

Rationale: the audio callback runs under a hard real-time budget. LPC root-finding and cepstral
analysis must not run there — one long frame is an audible glitch. Capture in the callback,
analyse on a worker.

**Use `postMessage` with transferable buffers, not `SharedArrayBuffer`, as the default.** SAB
requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
For a tool that clinicians self-host, adding COOP/COEP is a deployment complication with no
corresponding benefit at this data rate. Feature-detect SAB and use it only as an optimisation.

**`getUserMedia` constraints are mandatory, not optional:**
```js
{ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
           channelCount: 1 } }
```
Defaults are `true` on every major browser, and AGC in particular turns every dynamic-range and
SPL-derived measurement into fiction. Residual risk: some platforms apply processing below the
browser (notably iOS), which no constraint can disable. Logged as an input-integrity warning, not
silently absorbed.

### 6.2 Native capture

`cpal` for desktop, with platform-native backends for mobile behind the same contract. Native
capture is what unlocks calibrated SPL and the audio-session behaviour needed for all-day capture.
The callback has the same discipline as the worklet: copy to a ring buffer, hand off, return

### 6.3 Capture contract

```rust
pub trait Capture {
    fn devices(&self) -> Vec<DeviceInfo>;
    fn start(&mut self, dev: &DeviceId, cfg: StreamConfig,
             sink: Box<dyn FnMut(&[f32]) + Send>) -> Result<(), CaptureError>;
    fn stop(&mut self);
}
```

---

## 7. Local storage

**Everything is local. There is no sync path, and no network client exists in the dependency
graph.**

- **OPFS** for audio blobs — a real filesystem with usable throughput for recordings.
- **IndexedDB** for structured rows.
- Audio is written only if the user has recording enabled. Otherwise frames are analysed and
  discarded in memory.

### 7.1 Schema

Both stores are keyed by the same versioning fields as the archive format (§9), because the local
store and the export are the same data in two containers.

```sql
-- mirrored in IndexedDB object stores; shown as SQL for clarity
CREATE TABLE session (
  id              TEXT PRIMARY KEY,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  device_class    TEXT NOT NULL,     -- web | tauri-desktop | tauri-mobile | cli
  calibration_id  TEXT,              -- NULL => SPL values are NULL, not zero
  app_version     TEXT NOT NULL,
  core_version    TEXT NOT NULL,
  abi_version     INTEGER NOT NULL,
  schema_version  INTEGER NOT NULL
);

CREATE TABLE utterance (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,       -- sustained | phrase | glide | ddk | mpt
  phoneme_set   TEXT,
  duration_ms   INTEGER NOT NULL,
  metrics_json  TEXT NOT NULL,       -- AnalysisSummary
  created_at    INTEGER NOT NULL
);

CREATE TABLE metric_series (         -- downsampled for trend charts
  utterance_id  TEXT NOT NULL REFERENCES utterance(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL,       -- f0 | scale | hnr | cpp | spl | stability
  t_ms          INTEGER NOT NULL,
  value         REAL NOT NULL,
  confidence    REAL NOT NULL,
  PRIMARY KEY (utterance_id, channel, t_ms)
);

CREATE TABLE calibration (
  id                       TEXT PRIMARY KEY,
  device_class             TEXT NOT NULL,
  mic_model                TEXT,
  sensitivity_dbfs_at_94db REAL NOT NULL,
  method                   TEXT NOT NULL,   -- calibrator | reference_tone
  measured_at              INTEGER NOT NULL
);

CREATE TABLE measure_version (     -- one row per core version that produced stored data
  core_version  TEXT PRIMARY KEY,
  introduced_at INTEGER NOT NULL,
  notes         TEXT
);
```

**Metric channels.** Each `metric_series.channel` is either a per-frame field of §4.1 (`f0`,
`scale`, `hnr`, `cpp`, and `spl` when a calibration is attached) or a derived series. `stability`
is derived: the rolling standard deviation of `scale_semitones` over a short window (ten frames at
the default hop), in semitones, written only for frames with a measurable formant scale. Lower is
steadier. — *Definition recorded 2026-10-16 when the channel was first produced; the measure is
proposed and open to revision.*

### 7.2 Migrations and rollback

- **Forward-only, expand/contract**, on both the local store and the archive container.
- Because there is no server, "rollback" means serving the previous static bundle. Keep the
  previous release artifact and make that a documented, one-command operation for self-hosters.
- **Rollback safety rule:** a schema change must be readable by the immediately previous release,
  or it must be accompanied by an archive export prompt. Users must never be stuck with data they
  cannot open.
- Every migration ships with a fixture store at the previous version, and CI runs the migration
  against it.

---

## 8. History export/import

This replaces a sync tier entirely. It is the portability story, the backup story, and the way a
clinician moves a member's history between a phone and a workstation.

**Container:** a ZIP archive (inspectable, tooling everywhere, and ZIP is the right container here).
Two layouts inside:

- `manifest.json` — plaintext: format version, `schema_version`, `core_version`, `abi_version`,
  record counts, timestamp, and whether payloads are encrypted. Deliberately readable so a user can
  tell what a file is without a passphrase.
- `payload.enc` — the measurements, and optionally `audio/*` recordings, encrypted with
  XChaCha20-Poly1305 under a key derived with Argon2id from a user passphrase.

```json
{
  "format": "voice-history",
  "format_version": 1,
  "schema_version": 3,
  "core_version": "0.4.1",
  "abi_version": 1,
  "created_at": "2026-01-01T00:00:00Z",
  "encrypted": true,
  "kdf": { "algo": "argon2id", "m": 65536, "t": 3, "p": 1 },
  "counts": { "sessions": 42, "utterances": 310, "recordings": 12 }
}
```

**Rules:**
- Encrypted by default. A plaintext export must be an explicit, warned choice, because a history
  file sitting in a downloads folder for years is the realistic failure mode.
- Import handles version skew through the same migration ladder as the local store. An archive from
  a newer format version is refused with a clear message rather than partially parsed.
- **Never a silent overwrite.** Import merges by id and reports what it added, skipped, or
  conflicted on.
- Recordings are opt-in per export, separately from measurements, because the file sizes and the
  sensitivity are entirely different.

---

## 9. Measure versioning and ABI stability

**This is the section that protects users over time, and it is the one a solo project is most likely
to skip.**

The problem: a user accumulates months of trend data, the analysis algorithm improves, and their
historical points silently become incomparable with their new ones. The chart shows a change in the
user's voice that is actually a change in the software. That is the worst possible failure for a
measurement tool, and it is invisible unless the policy exists up front.

**Policy:**

1. **`CORE_VERSION` is semver, and MAJOR means "a published measure can shift beyond tolerance."**
   The tolerance is documented per measure — F0, formant frequencies, HNR, CPP, tilt, and
   `scale_semitones` each have their own band.
2. **Every stored record carries the `core_version` that produced it.** Sessions, utterances, and
   frames that matter.
3. **The UI must not plot across a `core_version` boundary without marking it.** A visible
   discontinuity, not a silent splice. If trends across the boundary would be misleading, the chart
   stops at it.
4. **Conformance fixtures are the test of the tolerance band.** When the fixtures show a measure has
   moved beyond its documented tolerance, that is a MAJOR bump — mechanically, not by judgement.
5. **`CORE_ABI_VERSION` is separate and stricter.** It versions the memory layout only. A mismatch
   is a hard startup failure.
6. **Fix bugs, but don't quietly change the number.** If the old value was wrong, the release note
   says so, the measure version moves, and historical points are labelled with the version that
   produced them.

---

## 10. Deployment and self-hosting

Designed for a clinician who has to justify this to someone else's IT review.

**What ships:**
- A static bundle — `index.html`, UI JS, `sonorant_core_bg.wasm`, the worklet shim — servable from any
  static host, CDN, object store, or a local Caddy/nginx. No environment variables, no server
  runtime, no database process.
- A CLI binary — the native `sonorant-cli` (crates.io) and the npm `sonorant-cli` Ink front end
  (§3) — and, when it exists, the desktop shell. Multi-arch images for `linux/amd64` and
  `linux/arm64`.
- Nothing else. There is no service tier.

**Operator requirements, documented prominently because they will be hit:**
- **HTTPS is mandatory.** `getUserMedia` requires a secure context. `localhost` counts as secure, so
  local development needs no certificate, but any LAN or public address does.
- A TLS certificate, which for a purely local deployment means a self-signed cert or a local CA.
  Document the workflow; it is the most likely place a self-hoster gets stuck.
- No COOP/COEP headers are required, since SAB is not used by default (§6.1).

**Upgrade and rollback:**
- Upgrading is replacing the static bundle. Rollback is restoring the previous one.
- The release artifacts keep the previous version, and the rollback procedure is one documented
  command. This is the entire rollback strategy, and it is sufficient because there is no stateful
  service and because §7.2 guarantees schema compatibility with the previous release.
- Archives are the user's backup. The app prompts for an export before any migration that a
  previous release could not read.

**Why a clinician can defend this:** nothing is collected, so there is no repository to protect,
no BAA to negotiate, no retention policy to write, and no vendor relationship. The honest framing
for their review is: *this is a local tool that runs in the browser on the user's own machine; it
has no server component and makes no network requests.*

---

## 11. Diagnostics

Replaces operational observability, because there are no operations.

- **Local diagnostics panel:** analysis latency p50/p95, capture dropout rate, mean formant
  confidence, input-integrity warnings, version strings (app, core, ABI, schema), and the
  measured audio path properties (sample rate, channel count, and what processing the browser
  actually applied).
- **Never transmitted.** There is no telemetry, no crash reporter, and no analytics SDK. This is a
  constraint on the codebase, not just a policy: no network client exists in the dependency graph.
- **Support without telemetry:** a "copy diagnostics" action produces a redacted blob the user
  chooses to paste into an issue. It contains counters, timings, and version strings. It contains
  **no measurements and no audio**, and the redaction is part of the function, not a user
  responsibility.

**Meaningful thresholds, surfaced in-app rather than alerted on:**
| Signal | Threshold | What it means to the user |
|---|---|---|
| Analysis latency p95 | > 20 ms | the device is struggling; suggest lower resolution |
| Capture dropout | > 0.5% of frames | another app is contending for audio |
| Mean formant confidence | < 0.6 | results are not trustworthy; usually a mic or room problem |
| Voicing confidence p05 | < 0.4 | input or environment problem |
| Input-integrity warnings | > 3 per session | the mic path is compromised |

---

## 12. Security review

**The central claim: audio captured in the browser has no code path to the network.** For a
clinician self-hosting this, that claim is the whole security story, so it must be *verifiable*
rather than asserted.

**How it is enforced and tested:**
- **`connect-src 'none'`** in the CSP. Not `'self'` — there is no endpoint to talk to. Anything
  that tries to make a request fails, which makes the claim testable by inspection.
- A CI test that scans the built bundle for any external origin and fails the build on a match.
  This catches a dependency that phones home, which is the realistic failure mode.
- No third-party scripts, no analytics, no error-reporting SDK. This excludes most commercial APM
  agents by construction.
- **Note:** the artifact renderer used during development permits `cdnjs.cloudflare.com`. The
  shipped app must not inherit that allowance.

**Supply chain:**
- `cargo-deny` licence and advisory gates, `cargo-audit`.
- SBOM and provenance attestations on published artifacts.
- The shipped `.wasm` hash is recorded and compared at startup; a mismatch is a hard failure.

**Threat model, named and bounded:**
| Threat | Mitigation |
|---|---|
| Device shared or lost | nothing is stored centrally; reliance on device encryption; no account to compromise |
| Malicious page framing the app | `frame-ancestors 'none'` |
| Compromised dependency exfiltrating audio | CSP `connect-src 'none'` + the bundle origin scan |
| Malicious fork of the project | out of scope technically; the mitigation is that the canonical source is documented and signed releases are published |
| PHI leaking into a diagnostics blob | redaction is part of the diagnostics function, not a user task |

**What is explicitly out of scope:** multi-tenant isolation, server-side authz, and audit trails.
There is no server and no tenancy. If a backend is ever added, this entire section is void and the
whole design must be revisited — which is the reason it is written down as a boundary rather than
left as an intention.

---

## 13. Calibration and the SPL path

- `sonorant-calibrate` stores a per-device sensitivity and converts dBFS to dB SPL.
- **A calibration is per device and per mic.** Shipping default sensitivities for common devices is
  a reasonable convenience, but any default must be labelled an estimate rather than a calibration,
  and `spl_db` stays `NaN` until a real calibration exists.
- The equipment category is verified: Class 1 acoustic calibrators produce 1 kHz at 94 dB (commonly
  also 114 dB) under IEC 60942, with ½″ couplers and ¼″ adapters. **A specific microphone and
  calibrator pairing is not researched here and must not be bought on the basis of this document.**
  That is a separate research pass with cited sources.
- SPL-dependent features are unreachable on the web target by design and gated on
  `calibration_id IS NOT NULL`.

---

## 14. Testing strategy

- **Unit:** `sonorant-core` numerics against synthetic signals with known formants (a cascade of known
  resonators) and known F0. Deterministic and fast; the majority of the suite.
- **Conformance oracle (the important one):** a fixture set of reference recordings with expected
  values measured in **Praat on a developer machine**. Praat is GPL and ships nothing — it generates
  fixtures only. Assertions use documented per-measure tolerance bands, not equality. These fixtures
  are published with the project, so the accuracy claim is inspectable and a fork cannot be the only
  authority on how the numbers are produced.
- **Property tests:** frame boundaries, arbitrary frame sizes, silence, clipping, NaN input. The
  core must never panic and never emit a non-finite value outside the documented `NaN` cases.
- **ABI test:** the JS reader against the core's layout for a given `CORE_ABI_VERSION`. A mismatch
  fails CI.
- **Archive round-trip tests:** export → import with version skew in both directions, truncated
  files, wrong passphrase, and a newer format version. All must fail cleanly.
- **Egress test:** the bundle origin scan (§12), run on every build.
- **Integration:** capture-shim conformance — the browser shim and native capture are driven with
  the same PCM fixture and must produce identical `AnalysisFrame` sequences.
- **Explicitly not tested:** perceptual quality. There is no automated assertion of "sounds better,"
  and there must never be one gating a release.

---

## 15. Build and release

- `wasm-pack` / `wasm-bindgen` for the web artifact; `cargo` for native targets.
- Multi-arch images for `linux/amd64` and `linux/arm64` (the homelab and Pi target needs arm64),
  with SBOM and provenance attestations.
- The shipped `.wasm`, the CLI binary, and the desktop shell are built from the same commit and the
  same `CORE_VERSION`. A release where they differ is a release defect.
- The previous release artifact is retained, because it is the rollback strategy (§7.2).
- Every release notes any `CORE_VERSION` change and what it means for existing history.

---

## 16. Open questions

1. Licences unverified for `pitch-detection`, `pyin-rs`, `hound`, `symphonia`, `zip`, and both Rust
   voice crates. All must be verified before any becomes a dependency.
2. Specific microphone and calibrator — separate equipment research pass with cited sources.
3. Phoneme classifier for per-vowel analysis: build in Rust, vendor, or defer past v1.
4. Whether the desktop shell ships in v1. If yes, `sonorant-capture` and the calibration flow move into
   the critical path rather than staying deferred. **Decided 2026-10-16: deferred for v1** (issue #2);
   SPL stays unreachable in v1 and the calibration flow stays parked (issue #1).
5. Argon2id parameters for the archive KDF — needs a decision against an explicit device-class
   time budget, since a phone must be able to open its own archive in reasonable time.
6. Whether the local store should be SQLite (via a WASM build) rather than IndexedDB. Deferred
   because IndexedDB handles the current row shapes and avoids a second storage engine.
7. **Per-frame measures below ~86 Hz.** The perturbation measures need
   `perturbation::MIN_PERIODS` (4) cycles and HNR needs several, so at the default 2048-sample
   frame and 44.1 kHz the floor is near 86 Hz; the tracker's own floor is 60 Hz
   (`DEFAULT_MIN_F0_HZ`, and ~43 Hz at most inside one frame). The consequences are recorded
   rather than hidden: `jitter_local` and `shimmer_local` are `NaN` below the floor, and `CREAK`
   catches only the edge of the pulse register, because canonical creak (20–60 Hz) reads
   unvoiced. **The fix is a longer analysis window** — a second, long-window pass for the
   low-frequency measures — which is a change to the §4.1 contract and therefore needs a
   decision. The `LOW_SNR` (10 dB) and `CREAK` (15 dB) thresholds are derived from where this
   pipeline's voicing gate actually sits and move with it; they are not clinical cuts.

---

## 17. What this document does not contain

Deliberately absent, because there is no backend and no organization: sync contracts and an OpenAPI
document, RBAC, audit logging, rate limiting, and compliance/BAA analysis. Screen specs and the
story breakdown are phase 6 and 7 deliverables. The npm package layout (`sonorant`, `sonorant-cli`)
and the TypeScript/Ink CLI are now specified here (§3), where they were previously absent. This
document is sufficient for a solo builder to start on the Rust `sonorant-cli` crate, which is the
correct first artifact.
