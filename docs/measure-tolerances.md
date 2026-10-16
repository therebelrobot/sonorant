# Measure tolerances

**Status:** initial (S1.1)
**Authority:** TDD §9 (measure versioning). Every published measure has a documented
tolerance band; when a measure moves beyond its band, that is a **MAJOR `CORE_VERSION`**
bump, mechanically rather than by judgement.

These are the bands the S1.1 tests assert against synthetic signals with known F0 and
known formants (a cascade of two-pole resonators). They are **initial**: the Praat-oracle
conformance fixtures in S2.3 are the authoritative check, and these bands will be
tightened to match Praat once those fixtures exist.

The numbers are defined once, in `sonorant-core::tolerances` (`F0_REL`, `FORMANT_REL`).
The tests and the S1.4 fixture generator read those constants; this document describes
them. Published reference fixtures live in [`fixtures/reference/`](../fixtures/reference/).

Signal conventions for the numbers below: sample rate 44.1 kHz, frame 2048 samples, LPC
order 24, pre-emphasis 0.97, Hann window.

| Measure | Band (synthetic) | Notes |
|---|---|---|
| F0 (`f0_hz`) | ±2 % | Measured within ±2 % for 90–300 Hz synthetic vowels; typically <1 % for clean periodic input. YIN with parabolic interpolation. |
| Formant frequencies (`formants[].hz`) | ±10 % (F1–F3) | On the published reference, F1–F3 land within ~3 %; the band is deliberately wider than the current error. To be tightened against Praat in S2.3. |
| Formant bandwidth | not asserted | Returned by the pole radius; no band until Praat conformance. |
| HNR (`hnr_db`) | not asserted | Computed via the normalized autocorrelation at the pitch period (Boersma). No band until Praat conformance. |
| CPP (`cpp_db`) | not asserted | **Provisional and simplified** — a relative linear value, not Praat's CPP. Calibrated in S2.3. |
| Spectral tilt (`tilt_db_per_oct`) | not asserted | Least-squares slope of `20*log10(magnitude)` vs `log2(frequency)`. |
| H1–H2 (`h1_h2_db`) | not asserted | Harmonic-amplitude difference at the nearest spectrum bins. |
| RMS (`rms_dbfs`) | exact floor: −160 dBFS | Silence returns the floor; never `-inf`. |

## Documented non-finite (`NaN`) cases

The core never emits a non-finite value outside these cases (TDD §14):

- `spl_db` — `NaN` whenever no calibration is active (TDD §4.2). The frame analyzer
  sets it and raises the `UNCALIBRATED` flag.
- `jitter_local`, `shimmer_local` — `NaN` until voiced-cycle segmentation lands with
  S2.1. `NaN` means "not measured", never a measured zero.
- `hnr_db`, `h1_h2_db` — `NaN` for an unvoiced frame (`f0_hz <= 0`) or a frame with no
  usable harmonics.
- `cpp_db` — `NaN` when the quefrency band is too small to measure a peak.

All other outputs are finite for all inputs, including silence, clipping, and `NaN`
input (see `crates/sonorant-core/tests/numerics.rs`).

`scale_semitones` is `0.0` until the session baseline is established;
`sonorant-analysis::Session` (S2.2) then sets it as `12 * log2(formant_scale / baseline)`,
where `formant_scale` is the geometric mean of the measured formants.

## Changing these numbers

A change to any band, or a measure moving outside its band, is a `CORE_VERSION` change
under TDD §9. Update this file and the release notes together.
