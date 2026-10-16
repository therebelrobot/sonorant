//! sonorant-core — acoustic numerics: FFT wrappers, LPC, YIN, cepstrum, formants.
//!
//! Pure and portable: no target-specific code, no I/O. Takes `&[f32]`, returns
//! structs (TDD §3). The acoustic layer is written in-house (TDD §5).
#![forbid(unsafe_code)]
