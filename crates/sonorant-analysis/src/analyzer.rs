//! The `Analyzer` contract and the default frame-based implementation (TDD §4.1).
//!
//! The session baseline (`scale_semitones`) is layered on top in `session.rs`.
//! This module is the single-frame pipeline plus framing, which the CLI (S1.3)
//! and the WASM surface (S3.1) drive.

use sonorant_core::formants::{self, Formant, MAX_FORMANTS};
use sonorant_core::{cepstrum, features, lpc, pitch, spectrum, window};

use crate::frame::{flags, AnalysisFrame, AnalysisParams};

/// Relative frame-to-frame change at which a formant's stability term reaches 0.
const STABILITY_TOLERANCE: f32 = 0.10;
/// Mean formant confidence below which `FORMANT_UNSTABLE` is raised.
const UNSTABLE_MEAN_CONFIDENCE: f32 = 0.25;

/// The shared contract every surface drives (TDD §4.1). No acoustic maths in any
/// caller; the maths lives in `sonorant-core`.
pub trait Analyzer {
    fn configure(&mut self, params: AnalysisParams);
    /// Consume PCM, emit zero or more frames into internal state. Returns the
    /// number of frames produced.
    fn push(&mut self, pcm: &[f32]) -> usize;
    /// Copy out pending frames. Returns how many were written to `out`.
    fn drain(&mut self, out: &mut [AnalysisFrame]) -> usize;
    fn reset(&mut self);
}

/// Default `Analyzer`: buffers PCM and emits one `AnalysisFrame` per hop.
pub struct FrameAnalyzer {
    params: AnalysisParams,
    buffer: Vec<f32>,
    /// Session sample index of `buffer[0]`, for `t_ms`.
    buffer_origin: u64,
    pending: Vec<AnalysisFrame>,
    /// Previous frame's formant frequencies, for the stability term.
    prev_formant_hz: [f32; MAX_FORMANTS],
    has_prev: bool,
}

impl Default for FrameAnalyzer {
    fn default() -> Self {
        Self::new(44_100)
    }
}

impl FrameAnalyzer {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            params: AnalysisParams::new(sample_rate),
            buffer: Vec::new(),
            buffer_origin: 0,
            pending: Vec::new(),
            prev_formant_hz: [0.0; MAX_FORMANTS],
            has_prev: false,
        }
    }

    pub fn params(&self) -> AnalysisParams {
        self.params
    }

    fn analyze(&self, frame: &[f32], t_ms: u32) -> AnalysisFrame {
        let p = &self.params;
        let sr = p.sample_rate as f32;

        let pre = window::pre_emphasis(frame, p.pre_emphasis);
        let framed = window::apply(&pre, &window::hann(pre.len()));
        let magnitude = spectrum::magnitude(&spectrum::power_spectrum(&framed));
        let a = lpc::lpc_coefficients(&framed, p.lpc_order as usize);
        let found = formants::lpc_formants(&a, sr, p.max_formant_hz);
        let pitch_est = pitch::yin(
            frame,
            sr,
            pitch::DEFAULT_MIN_F0_HZ,
            pitch::DEFAULT_MAX_F0_HZ,
            p.voicing_threshold,
        );
        let cpp = cepstrum::cpp(&cepstrum::real_cepstrum(&framed), sr);

        let mut slot = [Formant::default(); MAX_FORMANTS];
        for (i, f) in found.iter().take(MAX_FORMANTS).enumerate() {
            slot[i] = *f;
        }

        let peak = frame.iter().fold(0.0f32, |m, x| m.max(x.abs()));
        let mut fl = flags::UNCALIBRATED;
        if peak >= 0.999 {
            fl += flags::CLIPPED;
        }

        AnalysisFrame {
            t_ms,
            f0_hz: pitch_est.f0_hz,
            voicing: pitch_est.confidence,
            f0_confidence: pitch_est.confidence,
            formants: slot,
            hnr_db: features::hnr_db(frame, sr, pitch_est.f0_hz),
            cpp_db: cpp,
            tilt_db_per_oct: features::spectral_tilt_db_per_oct(&magnitude, sr),
            h1_h2_db: features::h1_h2_db(&magnitude, sr, pitch_est.f0_hz),
            centroid_hz: features::centroid_hz(&magnitude, sr),
            // Session baseline is layered on top in session.rs (S2.2).
            scale_semitones: 0.0,
            rms_dbfs: features::rms_dbfs(frame),
            // Uncalibrated until a calibration exists (S7); flagged UNCALIBRATED.
            spl_db: f32::NAN,
            // Not implemented yet; voiced-cycle segmentation lands with S2.1.
            jitter_local: f32::NAN,
            shimmer_local: f32::NAN,
            flags: fl,
        }
    }

    fn produce(&mut self) -> usize {
        let frame_len = self.params.frame_len;
        let hop = self.params.hop;
        if frame_len == 0 || hop == 0 || self.buffer.len() < frame_len {
            return 0;
        }
        let sample_rate = self.params.sample_rate.max(1) as u64;
        let mut produced = 0;
        while self.buffer.len() >= frame_len {
            let t_ms = (self.buffer_origin * 1000 / sample_rate) as u32;
            let frame: Vec<f32> = self.buffer[..frame_len].to_vec();
            let mut analysis = self.analyze(&frame, t_ms);
            temper_stability(&self.prev_formant_hz, self.has_prev, &mut analysis);
            apply_unstable_flag(&mut analysis);
            for i in 0..MAX_FORMANTS {
                self.prev_formant_hz[i] = analysis.formants[i].hz;
            }
            self.has_prev = true;
            self.pending.push(analysis);
            produced += 1;
            let advance = hop.min(self.buffer.len());
            self.buffer.drain(..advance);
            self.buffer_origin += advance as u64;
        }
        produced
    }
}

/// Temper each formant's confidence by how little it moved since the previous
/// frame (TDD §4.1: prominence "tempered by pole stability across neighbouring
/// frames"). The first frame is treated as fully stable.
fn temper_stability(prev: &[f32; MAX_FORMANTS], has_prev: bool, frame: &mut AnalysisFrame) {
    if !has_prev {
        return;
    }
    for i in 0..MAX_FORMANTS {
        let now = frame.formants[i].hz;
        let before = prev[i];
        if now > 0.0 && before > 0.0 {
            let relative = ((now - before).abs() / now).min(1.0);
            let stability = (1.0 - relative / STABILITY_TOLERANCE).clamp(0.0, 1.0);
            frame.formants[i].confidence =
                (frame.formants[i].confidence * stability).clamp(0.0, 1.0);
        }
    }
}

/// Raise `FORMANT_UNSTABLE` when the frame has formants but their mean confidence
/// is below the threshold.
fn apply_unstable_flag(frame: &mut AnalysisFrame) {
    let confidences: Vec<f32> = frame
        .formants
        .iter()
        .filter(|f| f.hz > 0.0)
        .map(|f| f.confidence)
        .collect();
    if confidences.is_empty() {
        return;
    }
    let mean = confidences.iter().sum::<f32>() / confidences.len() as f32;
    if mean < UNSTABLE_MEAN_CONFIDENCE {
        frame.flags += flags::FORMANT_UNSTABLE;
    }
}

impl Analyzer for FrameAnalyzer {
    fn configure(&mut self, params: AnalysisParams) {
        self.params = params;
        self.reset();
    }

    fn push(&mut self, pcm: &[f32]) -> usize {
        self.buffer.extend_from_slice(pcm);
        self.produce()
    }

    fn drain(&mut self, out: &mut [AnalysisFrame]) -> usize {
        let n = out.len().min(self.pending.len());
        out[..n].copy_from_slice(&self.pending[..n]);
        self.pending.drain(..n);
        n
    }

    fn reset(&mut self) {
        self.buffer.clear();
        self.buffer_origin = 0;
        self.pending.clear();
        self.prev_formant_hz = [0.0; MAX_FORMANTS];
        self.has_prev = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame_with(formants: &[f32]) -> AnalysisFrame {
        let mut f = AnalysisFrame::default();
        for (i, &hz) in formants.iter().enumerate() {
            f.formants[i] = Formant {
                hz,
                bandwidth_hz: 100.0,
                confidence: 0.8,
            };
        }
        f
    }

    #[test]
    fn first_frame_is_not_tempered() {
        let mut f = frame_with(&[700.0, 1220.0, 2600.0]);
        temper_stability(&[0.0; MAX_FORMANTS], false, &mut f);
        assert!((f.formants[0].confidence - 0.8).abs() < 1e-6);
    }

    #[test]
    fn a_jump_across_frames_reduces_confidence() {
        let prev = [700.0f32, 1220.0, 2600.0, 0.0, 0.0];
        let mut stable = frame_with(&[702.0, 1222.0, 2602.0]);
        temper_stability(&prev, true, &mut stable);
        let mut jumped = frame_with(&[900.0, 1220.0, 2600.0]);
        temper_stability(&prev, true, &mut jumped);
        assert!(
            stable.formants[0].confidence > jumped.formants[0].confidence,
            "stable {:?} should beat jumped {:?}",
            stable.formants[0].confidence,
            jumped.formants[0].confidence
        );
        assert!(jumped.formants[0].confidence < 0.8);
    }

    #[test]
    fn unstable_flag_raised_on_low_mean_confidence() {
        let mut f = frame_with(&[700.0, 1220.0, 2600.0]);
        for formant in f.formants.iter_mut() {
            formant.confidence = 0.1;
        }
        apply_unstable_flag(&mut f);
        assert_ne!((f.flags as i64) & (flags::FORMANT_UNSTABLE as i64), 0);
    }
}
