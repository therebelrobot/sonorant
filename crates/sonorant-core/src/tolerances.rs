//! Documented per-measure tolerance bands (TDD §9; see `docs/measure-tolerances.md`).
//!
//! These constants are the single source the tests and the S1.4 fixture generator
//! read, so a measure moving beyond its band is caught mechanically rather than by
//! judgement.

/// Relative tolerance for `f0_hz`.
pub const F0_REL: f32 = 0.02;

/// Relative tolerance for the formant frequencies (F1–F3).
pub const FORMANT_REL: f32 = 0.10;
