//! sonorant-core — acoustic numerics: FFT wrappers, LPC, YIN, cepstrum, formants.
//!
//! Pure and portable: no target-specific code, no I/O. Takes `&[f32]`, returns
//! structs (TDD §3). The acoustic layer is written in-house (TDD §5).
#![forbid(unsafe_code)]

pub mod analyzer;
pub mod cepstrum;
pub mod complex;
pub mod features;
pub mod formants;
pub mod frame;
pub mod lpc;
pub mod pitch;
pub mod spectrum;
pub mod synthetic;
pub mod tolerances;
pub mod window;

pub use analyzer::{Analyzer, FrameAnalyzer};
pub use formants::{Formant, MAX_FORMANTS};
pub use frame::{flags, AnalysisFrame, AnalysisParams};
pub use pitch::Pitch;

/// The core version that produced stored data (TDD §9). Semver; a MAJOR bump
/// means a published measure can shift beyond its documented tolerance.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
