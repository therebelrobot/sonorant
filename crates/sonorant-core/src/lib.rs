//! sonorant-core — acoustic numerics: FFT wrappers, LPC, YIN, cepstrum, formants.
//!
//! Pure and portable: no target-specific code, no I/O. Takes `&[f32]`, returns
//! structs (TDD §3). The acoustic layer is written in-house (TDD §5).
#![forbid(unsafe_code)]

pub mod cepstrum;
pub mod complex;
pub mod features;
pub mod formants;
pub mod lpc;
pub mod pitch;
pub mod spectrum;
pub mod synthetic;
pub mod window;

pub use formants::{Formant, MAX_FORMANTS};
pub use pitch::Pitch;

/// Frame flags, stored as bits of the `f32` bitfield in `AnalysisFrame` (TDD §4.1).
pub mod flags {
    pub const CLIPPED: f32 = 1.0;
    pub const LOW_SNR: f32 = 2.0;
    pub const CREAK: f32 = 4.0;
    pub const SUBHARMONIC: f32 = 8.0;
    pub const FORMANT_UNSTABLE: f32 = 16.0;
    pub const UNCALIBRATED: f32 = 32.0;
}
