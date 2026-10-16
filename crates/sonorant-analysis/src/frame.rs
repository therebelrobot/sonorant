//! The analysis contract types (TDD §4.1): `AnalysisFrame`, `AnalysisParams`, and
//! the frame flag bitfield.
//!
//! `Formant` is a numerics type and lives in `sonorant-core`; `AnalysisFrame`
//! embeds it. The `Analyzer` trait and the frame pipeline are in `analyzer.rs`.

use sonorant_core::formants::{Formant, MAX_FORMANTS};

/// Frame flags, stored as bits of the `f32` `flags` field so the struct stays
/// all-`f32` and reads as a flat `Float32Array` (TDD §4.1, §4.4).
pub mod flags {
    pub const CLIPPED: f32 = 1.0;
    pub const LOW_SNR: f32 = 2.0;
    pub const CREAK: f32 = 4.0;
    pub const SUBHARMONIC: f32 = 8.0;
    pub const FORMANT_UNSTABLE: f32 = 16.0;
    pub const UNCALIBRATED: f32 = 32.0;
}

/// One analysis frame (TDD §4.1). `#[repr(C)]`, all-`f32` fields plus the `u32`
/// `t_ms`, so the struct is a flat, padding-free block the WASM boundary copies
/// and the JS side reads as a `Float32Array` (TDD §4.4: 29 `f32` + 1 `u32` = 30
/// words).
#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct AnalysisFrame {
    /// Since session start.
    pub t_ms: u32,
    /// `<= 0.0` means unvoiced.
    pub f0_hz: f32,
    /// 0..1.
    pub voicing: f32,
    /// 0..1.
    pub f0_confidence: f32,
    pub formants: [Formant; MAX_FORMANTS],
    pub hnr_db: f32,
    /// Cepstral peak prominence.
    pub cpp_db: f32,
    /// Long-term average spectral tilt.
    pub tilt_db_per_oct: f32,
    /// Vocal-weight proxy.
    pub h1_h2_db: f32,
    pub centroid_hz: f32,
    /// Vowel-independent formant scale, semitones, relative to the session's own
    /// baseline. Supplied by the session layer (S2.2); `0.0` until then.
    pub scale_semitones: f32,
    pub rms_dbfs: f32,
    /// `NaN` unless a calibration is active (TDD §4.2).
    pub spl_db: f32,
    pub jitter_local: f32,
    pub shimmer_local: f32,
    /// Bitfield of [`flags`].
    pub flags: f32,
}

/// Analysis configuration (TDD §4.1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AnalysisParams {
    pub sample_rate: u32,
    pub frame_len: usize,
    pub hop: usize,
    pub pre_emphasis: f32,
    pub lpc_order: u16,
    pub max_formant_hz: f32,
    pub voicing_threshold: f32,
}

/// Default LPC order: `clamp(2 + sample_rate / 1000, 18, 24)` (TDD §4.1).
pub fn default_lpc_order(sample_rate: u32) -> u16 {
    (2 + sample_rate / 1000).clamp(18, 24) as u16
}

impl AnalysisParams {
    /// Spec defaults (TDD §4.1): `frame_len` 2048, `hop` 512, `pre_emphasis`
    /// 0.97, `max_formant_hz` 5500, LPC order `clamp(2 + sr/1000, 18, 24)`.
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            frame_len: 2048,
            hop: 512,
            pre_emphasis: 0.97,
            lpc_order: default_lpc_order(sample_rate),
            max_formant_hz: 5500.0,
            voicing_threshold: sonorant_core::pitch::DEFAULT_THRESHOLD,
        }
    }
}
