//! Documented per-measure tolerance bands (TDD §9; see `docs/measure-tolerances.md`).
//!
//! These constants are the single source the tests and the S1.4 fixture generator
//! read, so a measure moving beyond its band is caught mechanically rather than by
//! judgement.

/// Relative tolerance for `f0_hz`.
pub const F0_REL: f32 = 0.02;

/// Relative tolerance for the formant frequencies (F1–F3).
pub const FORMANT_REL: f32 = 0.10;

/// Absolute tolerance for the perturbation measures (`jitter_local`,
/// `shimmer_local`), in percentage points, against the synthetic pulse trains
/// whose period and amplitude sequence are known exactly.
pub const PERTURBATION_ABS: f32 = 0.1;
