//! sonorant-analysis — frame pipeline, `AnalysisFrame` assembly, session state machine.
//!
//! Pure and portable: no target-specific code, no I/O (TDD §3). Depends on
//! `sonorant-core` for the numerics; this crate owns the contract types, the
//! `Analyzer` trait, and the frame pipeline. The session state machine (baseline
//! `scale_semitones`) lands here too (S2.2).
#![forbid(unsafe_code)]

pub mod analyzer;
pub mod frame;

pub use analyzer::{Analyzer, FrameAnalyzer};
pub use frame::{flags, AnalysisFrame, AnalysisParams};
