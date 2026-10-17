//! The `Analyzer` contract and the default frame-based implementation (TDD §4.1).
//!
//! The session baseline (`scale_semitones`) is layered on top in `session.rs`.
//! This module is the single-frame pipeline plus framing, which the CLI (S1.3)
//! and the WASM surface (S3.1) drive.

use sonorant_core::formants::{self, Formant, MAX_FORMANTS};
use sonorant_core::{cepstrum, features, lpc, perturbation, pitch, spectrum, window};

use crate::frame::{flags, AnalysisFrame, AnalysisParams};

/// Relative frame-to-frame change at which a formant's stability term reaches 0.
const STABILITY_TOLERANCE: f32 = 0.10;
/// Mean formant confidence below which `FORMANT_UNSTABLE` is raised.
const UNSTABLE_MEAN_CONFIDENCE: f32 = 0.25;
/// Within this of full scale counts as the digital rail.
const RAIL_EPSILON: f32 = 1e-6;
/// Consecutive samples at the rail required to call it an overload.
const RAIL_RUN: usize = 3;

/// `CLIPPED` means the input *overloaded*: the waveform was held at the digital
/// rail, so its shape there is gone and level and perturbation on this frame are
/// not trustworthy.
///
/// A single sample that touches full scale is a **peak**, not an overload — every
/// recording normalised to peak amplitude is exactly that case, including this
/// project's own reference fixture. Requiring a run distinguishes the two: an
/// overload produces consecutive samples pinned at the rail, a smooth peak does
/// not.
fn has_rail_run(frame: &[f32]) -> bool {
    let mut run = 0usize;
    for value in frame {
        if value.abs() >= 1.0 - RAIL_EPSILON {
            run += 1;
            if run >= RAIL_RUN {
                return true;
            }
        } else {
            run = 0;
        }
    }
    false
}

/// Harmonicity floor for `LOW_SNR`.
///
/// **Derived, not copied.** The clinical cut is 7 dB (Yumoto, Gould & Baer 1982;
/// Boersma 1993 is the HNR method used here), but 7 dB is unreachable in this
/// pipeline: measured on the synthetic vowel, a voiced frame bottoms out at
/// ~8.9 dB, because a frame noisy enough to go lower is no longer detected as
/// voiced. 10 dB is the level at which a *voiced* frame is at the edge of
/// voicing, which is what the flag means.
const LOW_SNR_HNR_DB: f32 = 10.0;

/// Creak is a low, aperiodic pulse register (Hollien & Michel 1968; Keating,
/// Kuang & Esposito 2012): low **and** poorly periodic, not one or the other.
///
/// With the tracker floor at `pitch::DEFAULT_MIN_F0_HZ` (45 Hz) this reaches the
/// pulse register up to `CREAK_MAX_F0_HZ`. Measured on a synthetic pulse train it
/// fires from 49 Hz to 70 Hz under mild turbulence, and stays silent on a *clean*
/// low voice of the same pitch — which is the distinction that matters, since
/// many people simply have a low voice. Below ~43 Hz it cannot fire at all: YIN
/// cannot test a lag longer than half the frame, so fry at 20–40 Hz still reads
/// unvoiced (TDD §16.7). The 15 dB is derived from where this pipeline's
/// harmonicity sits in that band, not from a clinical cut.
const CREAK_MAX_F0_HZ: f32 = 70.0;
const CREAK_MAX_HNR_DB: f32 = 15.0;

/// `LOW_SNR`: a **voiced** frame whose harmonicity is too low to trust. An
/// unvoiced frame has no harmonicity to judge (HNR is `NaN`), so it is not
/// flagged — "unvoiced" is already its own answer.
fn is_low_snr(pitch_est: &pitch::Pitch, hnr_db: f32) -> bool {
    pitch_est.f0_hz > 0.0 && hnr_db.is_finite() && hnr_db < LOW_SNR_HNR_DB
}

/// `CREAK`: voiced, in the pulse register, and aperiodic.
fn is_creak(pitch_est: &pitch::Pitch, hnr_db: f32) -> bool {
    pitch_est.f0_hz > 0.0
        && pitch_est.f0_hz <= CREAK_MAX_F0_HZ
        && hnr_db.is_finite()
        && hnr_db < CREAK_MAX_HNR_DB
}

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
    /// The samples immediately before `buffer[0]`, so the periodicity measures can
    /// look back `measurement_len` samples rather than one frame.
    history: Vec<f32>,
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
            history: Vec::new(),
            pending: Vec::new(),
            prev_formant_hz: [0.0; MAX_FORMANTS],
            has_prev: false,
        }
    }

    pub fn params(&self) -> AnalysisParams {
        self.params
    }

    fn analyze(&self, frame: &[f32], measurement: &[f32], t_ms: u32) -> AnalysisFrame {
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
        // Harmonicity and the octave check use the long window, not the frame.
        let hnr_db = features::hnr_db(measurement, sr, pitch_est.f0_hz);

        let mut slot = [Formant::default(); MAX_FORMANTS];
        for (i, f) in found.iter().take(MAX_FORMANTS).enumerate() {
            slot[i] = *f;
        }

        // Voiced-cycle perturbation (TDD §4.1). `NaN` when the measurement window
        // is unvoiced or holds fewer than `MIN_PERIODS` cycles — see
        // `perturbation`.
        let (jitter_local, shimmer_local) =
            perturbation::jitter_shimmer(measurement, sr, pitch_est.f0_hz);

        let mut fl = flags::UNCALIBRATED;
        if has_rail_run(frame) {
            fl += flags::CLIPPED;
        }
        if features::is_subharmonic(measurement, sr, pitch_est.f0_hz) {
            fl += flags::SUBHARMONIC;
        }
        if is_low_snr(&pitch_est, hnr_db) {
            fl += flags::LOW_SNR;
        }
        if is_creak(&pitch_est, hnr_db) {
            fl += flags::CREAK;
        }

        AnalysisFrame {
            t_ms,
            f0_hz: pitch_est.f0_hz,
            voicing: pitch_est.confidence,
            f0_confidence: pitch_est.confidence,
            formants: slot,
            hnr_db,
            cpp_db: cpp,
            tilt_db_per_oct: features::spectral_tilt_db_per_oct(&magnitude, sr),
            h1_h2_db: features::h1_h2_db(&magnitude, sr, pitch_est.f0_hz),
            centroid_hz: features::centroid_hz(&magnitude, sr),
            // Session baseline is layered on top in session.rs (S2.2).
            scale_semitones: 0.0,
            rms_dbfs: features::rms_dbfs(frame),
            // Uncalibrated until a calibration exists (S7); flagged UNCALIBRATED.
            spl_db: f32::NAN,
            jitter_local,
            shimmer_local,
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
        // How far back the periodicity window reaches, beyond the frame itself.
        let keep = self.params.measurement_len.saturating_sub(frame_len);
        let mut produced = 0;
        while self.buffer.len() >= frame_len {
            let t_ms = (self.buffer_origin * 1000 / sample_rate) as u32;
            let frame: Vec<f32> = self.buffer[..frame_len].to_vec();

            // Periodicity needs several cycles, which one frame does not hold below
            // ~86 Hz, so HNR and the perturbation measures look back over the
            // measurement window instead of the frame.
            let mut measurement = Vec::with_capacity(keep + frame_len);
            if keep > 0 {
                let start = self.history.len().saturating_sub(keep);
                measurement.extend_from_slice(&self.history[start..]);
            }
            measurement.extend_from_slice(&frame);

            let mut analysis = self.analyze(&frame, &measurement, t_ms);
            temper_stability(&self.prev_formant_hz, self.has_prev, &mut analysis);
            apply_unstable_flag(&mut analysis);
            for i in 0..MAX_FORMANTS {
                self.prev_formant_hz[i] = analysis.formants[i].hz;
            }
            self.has_prev = true;
            self.pending.push(analysis);
            produced += 1;

            let advance = hop.min(self.buffer.len());
            if keep > 0 {
                self.history.extend_from_slice(&self.buffer[..advance]);
                let excess = self.history.len().saturating_sub(keep);
                if excess > 0 {
                    self.history.drain(..excess);
                }
            }
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
        self.history.clear();
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
