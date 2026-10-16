//! sonorant-analysis — frame pipeline, `AnalysisFrame` assembly, session state machine.
//!
//! Pure and portable: no target-specific code, no I/O (TDD §3). Depends on
//! `sonorant-core` for the numerics; this crate owns the contract types, the
//! `Analyzer` trait, the frame pipeline, and the session state machine.
#![forbid(unsafe_code)]

pub mod analyzer;
pub mod frame;
pub mod session;

pub use analyzer::{Analyzer, FrameAnalyzer};
pub use frame::{flags, AnalysisFrame, AnalysisParams};
pub use session::{Session, SessionAnalyzer, DEFAULT_BASELINE_FRAMES};
