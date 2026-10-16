//! Session state machine (TDD §4.1, §4.2). Owns session start/stop and the
//! baseline that `scale_semitones` is a log-ratio against.
//!
//! `scale_semitones = 12 * log2(scale / baseline)`, where `scale` is the frame's
//! [`formant_scale_hz`](sonorant_core::formants::formant_scale_hz). Negative means
//! a larger apparent tract, matching TDD §4.1.

use sonorant_core::formants::formant_scale_hz;

use crate::analyzer::{Analyzer, FrameAnalyzer};
use crate::frame::{AnalysisFrame, AnalysisParams};

/// How many voiced frames seed the baseline by default.
pub const DEFAULT_BASELINE_FRAMES: usize = 10;

/// Session start/stop and the baseline `scale_semitones` is measured against.
#[derive(Default)]
pub struct Session {
    baseline_frames: usize,
    collected: Vec<f32>,
    baseline: Option<f32>,
    active: bool,
}

impl Session {
    pub fn new() -> Self {
        Self::with_baseline_frames(DEFAULT_BASELINE_FRAMES)
    }

    pub fn with_baseline_frames(frames: usize) -> Self {
        Self {
            baseline_frames: frames.max(1),
            collected: Vec::new(),
            baseline: None,
            active: false,
        }
    }

    /// Begin a session: clears the baseline so it is re-established.
    pub fn start(&mut self) {
        self.active = true;
        self.baseline = None;
        self.collected.clear();
    }

    pub fn stop(&mut self) {
        self.active = false;
    }

    pub fn is_active(&self) -> bool {
        self.active
    }

    /// The established baseline scale in Hz, if any.
    pub fn baseline_hz(&self) -> Option<f32> {
        self.baseline
    }

    pub fn reset(&mut self) {
        self.active = false;
        self.baseline = None;
        self.collected.clear();
    }

    /// Apply the session baseline to a frame, setting `scale_semitones`.
    ///
    /// Before the baseline is established (or on a frame with no measurable
    /// scale), `scale_semitones` is `0.0`.
    pub fn observe(&mut self, frame: &mut AnalysisFrame) {
        let scale = formant_scale_hz(&frame.formants);
        match (self.baseline, scale) {
            (Some(baseline), Some(scale)) if baseline > 0.0 && scale > 0.0 => {
                frame.scale_semitones = 12.0 * (scale / baseline).log2();
            }
            _ => {
                frame.scale_semitones = 0.0;
                if self.baseline.is_none() {
                    if let Some(scale) = scale {
                        self.collected.push(scale);
                        if self.collected.len() >= self.baseline_frames {
                            self.baseline = Some(median(&self.collected));
                            self.collected.clear();
                        }
                    }
                }
            }
        }
    }
}

fn median(values: &[f32]) -> f32 {
    let mut sorted: Vec<f32> = values.iter().copied().filter(|v| v.is_finite()).collect();
    if sorted.is_empty() {
        return 0.0;
    }
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    sorted[sorted.len() / 2]
}

/// Drives a [`FrameAnalyzer`] and applies the session baseline to each drained
/// frame. `t_ms` is measured since the last [`SessionAnalyzer::start_session`].
pub struct SessionAnalyzer {
    inner: FrameAnalyzer,
    session: Session,
}

impl SessionAnalyzer {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            inner: FrameAnalyzer::new(sample_rate),
            session: Session::new(),
        }
    }

    pub fn session(&self) -> &Session {
        &self.session
    }

    pub fn session_mut(&mut self) -> &mut Session {
        &mut self.session
    }

    pub fn params(&self) -> AnalysisParams {
        self.inner.params()
    }

    /// Start a fresh session: the framing clock and the baseline both reset, so
    /// `t_ms` restarts at 0.
    pub fn start_session(&mut self) {
        self.inner.reset();
        self.session.start();
    }

    pub fn stop_session(&mut self) {
        self.session.stop();
    }
}

impl Analyzer for SessionAnalyzer {
    fn configure(&mut self, params: AnalysisParams) {
        self.inner.configure(params);
    }

    fn push(&mut self, pcm: &[f32]) -> usize {
        self.inner.push(pcm)
    }

    fn drain(&mut self, out: &mut [AnalysisFrame]) -> usize {
        let n = self.inner.drain(out);
        for frame in &mut out[..n] {
            self.session.observe(frame);
        }
        n
    }

    fn reset(&mut self) {
        self.inner.reset();
        self.session.reset();
    }
}
