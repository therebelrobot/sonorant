# Measure tolerances

**Status:** initial (S1.1)
**Authority:** TDD §9 (measure versioning). Every published measure has a documented
tolerance band; when a measure moves beyond its band, that is a **MAJOR `CORE_VERSION`**
bump, mechanically rather than by judgement.

These are the bands the S1.1 tests assert against synthetic signals with known F0 and
known formants (a cascade of two-pole resonators). They are **initial**: the Praat-oracle
conformance fixtures in S2.3 are the authoritative check, and these bands will be
tightened to match Praat once those fixtures exist.

The numbers are defined once, in `sonorant-core::tolerances` (`F0_REL`, `FORMANT_REL`,
`PERTURBATION_ABS`). The tests and the S1.4 fixture generator read those constants; this
document describes them. Published reference fixtures live in
[`fixtures/reference/`](../fixtures/reference/).

Signal conventions for the numbers below: sample rate 44.1 kHz, frame 2048 samples, LPC
order 24, pre-emphasis 0.97, Hann window.

| Measure | Band (synthetic) | Notes |
|---|---|---|
| F0 (`f0_hz`) | ±2 % | Measured within ±2 % for 90–300 Hz synthetic vowels; typically <1 % for clean periodic input. YIN with parabolic interpolation. |
| Formant frequencies (`formants[].hz`) | ±10 % (F1–F3) | On the published reference, F1–F3 land within ~3 %; the band is deliberately wider than the current error. To be tightened against Praat in S2.3. |
| Formant bandwidth | not asserted | Returned by the pole radius; no band until Praat conformance. |
| HNR (`hnr_db`) | not asserted | Boersma's normalised autocorrelation coefficient at the pitch period, taken over the lagged overlap. **Corrected 2026-10-16:** the coefficient was previously divided by the *whole* frame's energy, a bias of about `lag / frame_len` — so a low voice read as a noisy one (a clean 68 Hz pulse train read 3.0 dB; it now reads ~60 dB). No band until Praat conformance. |
| CPP (`cpp_db`) | not asserted | **Provisional and simplified** — a relative linear value, not Praat's CPP. Calibrated in S2.3. |
| Spectral tilt (`tilt_db_per_oct`) | not asserted | Least-squares slope of `20*log10(magnitude)` vs `log2(frequency)`. |
| H1–H2 (`h1_h2_db`) | not asserted | Harmonic-amplitude difference at the nearest spectrum bins. |
| RMS (`rms_dbfs`) | exact floor: −160 dBFS | Silence returns the floor; never `-inf`. |
| Jitter (`jitter_local`) | ±0.1 pp (synthetic) | Voiced-cycle **period** perturbation, in percent: `100 · mean(|Tᵢ − Tᵢ₊₁|) / mean(T)`. Measured exactly on `synthetic::perturbed_pulse_train`, whose period sequence is known. Praat's `jitter (local)` is the same formula; the band is confirmed against it in S2.3. |
| Shimmer (`shimmer_local`) | ±0.1 pp (synthetic) | Voiced-cycle **amplitude** perturbation, in percent, on the peak `|x|` within each cycle. Measured exactly on the synthetic pulse train. Praat's `shimmer (local)` has the same shape; the amplitude definition is confirmed in S2.3. |

"pp" is percentage points — these two are already percentages, so the band is absolute.

**Formant confidence.** Each formant's confidence is its pole prominence (falling off
with pole bandwidth) multiplied by a frame-to-frame **stability** term: a formant that
moved more than 10 % since the previous frame loses confidence, and `FORMANT_UNSTABLE`
is raised when the mean formant confidence falls below 0.25. The constants live in
`sonorant-analysis` (`STABILITY_TOLERANCE`, `UNSTABLE_MEAN_CONFIDENCE`, set by the
TDD's confidence definition in §4.1).

**Perturbation (`jitter_local`, `shimmer_local`).** Cycle boundaries are **found, not
assumed**: from each epoch the next is the lag near `sample_rate / f0` that best aligns
the waveform with itself (normalised cross-correlation over one glottal pulse, searched
within ±25 % of the expected period). Assuming a constant period would measure the
assumption rather than the voice. Praat's *local* definitions are used, so both are
percentages and a perfectly steady voice reads 0.

HNR and these measures are taken over the **measurement window** (`measurement_len`, 4096
samples, ~93 ms), not the 2048-sample frame: periodicity needs several cycles, and a 46 ms
frame does not hold four below ~86 Hz. Pitch, formants and the spectral features still come
from the frame, so the pitch track keeps its time resolution. The frames overlap inside the
window, so these series are smoothed.

Neither has a dedicated confidence field, and the flat all-`f32` frame (TDD §4.4) has no
room to add one without a `CORE_ABI_VERSION` bump. Their confidence is therefore the
frame's **`f0_confidence`**: the period marks are derived from the pitch estimate, so a
frame whose pitch is uncertain is a frame whose perturbation is uncertain. This is
recorded in the TDD (§4.1) rather than left implicit, because the §4.2 rule is that a
value without a confidence is not displayable.

## Documented non-finite (`NaN`) cases

The core never emits a non-finite value outside these cases (TDD §14):

- `spl_db` — `NaN` whenever no calibration is active (TDD §4.2). The frame analyzer
  sets it and raises the `UNCALIBRATED` flag.
- `jitter_local`, `shimmer_local` — `NaN` for an unvoiced frame (`f0_hz <= 0`), or when the
  **measurement window** holds fewer than `sonorant_core::perturbation::MIN_PERIODS` (4) detected
  cycles. `NaN` means "not measured", never a measured zero. At the default 4096-sample window
  (~93 ms) that is roughly f0 ≥ 45 Hz. Before that window existed the floor was ~86 Hz, because a
  2048-sample frame does not hold four cycles below it.
- `hnr_db`, `h1_h2_db` — `NaN` for an unvoiced frame (`f0_hz <= 0`) or a frame with no
  usable harmonics.
- `cpp_db` — `NaN` when the quefrency band is too small to measure a peak.

All other outputs are finite for all inputs, including silence, clipping, and `NaN`
input (see `crates/sonorant-core/tests/numerics.rs`).

`scale_semitones` is `0.0` until the session baseline is established;
`sonorant-analysis::Session` (S2.2) then sets it as `12 * log2(formant_scale / baseline)`,
where `formant_scale` is the geometric mean of the measured formants.

## Frame-flag thresholds

The flags are part of the measured surface (TDD §4.1), so their thresholds are recorded here.
All live in `sonorant-analysis`.

| Flag | Set when | Why this number |
|---|---|---|
| `CLIPPED` | a run of ≥ 3 consecutive samples within 1e-6 of the digital rail | A single sample at full scale is a peak, not an overload: every recording normalised to peak amplitude is that case. |
| `LOW_SNR` | voiced and `hnr_db < 10` | **Derived, not copied.** The clinical cut is 7 dB, but a frame noisy enough to reach it is no longer detected as voiced; measured on the synthetic vowel, a voiced frame bottoms out near 8.9 dB. 10 dB is "voiced, at the edge of voicing". |
| `CREAK` | voiced, `f0_hz <= 70`, and `hnr_db < 15` | Canonical creak (20–60 Hz) is below the tracker's 60 Hz floor and reads *unvoiced*, so this catches the low, poorly-periodic edge only — the tracker floor is the limit, not the window (TDD §16.7). The number is derived from where this pipeline's harmonicity sits in that band, not from a clinical cut. |
| `SUBHARMONIC` | the lag at twice the reported period is more periodic than the reported period by more than `features::SUBHARMONIC_MARGIN` (0.05), measured over the measurement window | YIN takes the *smallest* lag under threshold, so a strong half-period similarity reports an octave-high f0 — a wrong number read as a change in the voice. |
| `FORMANT_UNSTABLE` | the frame has formants and their mean confidence is < 0.25 | As TDD §4.1. |
| `UNCALIBRATED` | no calibration is attached | As TDD §4.2. |

## Changing these numbers

A change to any band, or a measure moving outside its band, is a `CORE_VERSION` change
under TDD §9. Update this file and the release notes together.
