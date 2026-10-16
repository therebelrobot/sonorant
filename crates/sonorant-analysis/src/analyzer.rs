//! The `Analyzer` contract and the default frame-based implementation (TDD §4.1).
//!
//! The session state machine and the `scale_semitones` baseline are added here in
//! S2.2. This module is the single-frame pipeline plus framing, which the CLI
//! (S1.3) and the WASM surface (S3.1) drive.

use sonorant_core::{cepstrum, features, formants, lpc, pitch, spectrum, window};

use crate::frame::{flags, AnalysisFrame, AnalysisParams};

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

        let mut slot = [formants::Formant::default(); formants::MAX_FORMANTS];
        for (i, f) in found.iter().take(formants::MAX_FORMANTS).enumerate() {
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
            // Session baseline is supplied by the session layer (S2.2).
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
            self.pending.push(self.analyze(&frame, t_ms));
            produced += 1;
            let advance = hop.min(self.buffer.len());
            self.buffer.drain(..advance);
            self.buffer_origin += advance as u64;
        }
        produced
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
    }
}
