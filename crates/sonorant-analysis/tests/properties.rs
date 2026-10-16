//! S2.4 property tests: the core never panics on degenerate input, never emits a
//! value outside the documented `NaN` cases, and marks silence unvoiced.
//!
//! Deterministic and dependency-free: a small LCG generates the noise shapes, so a
//! failure is reproducible.

use sonorant_analysis::{
    AnalysisFrame, AnalysisParams, Analyzer, FrameAnalyzer, SessionAnalyzer,
};

/// A tiny deterministic LCG (Numerical Recipes constants).
struct Lcg(u64);

impl Lcg {
    fn next_u32(&mut self) -> u32 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) as u32
    }

    fn next_f32(&mut self) -> f32 {
        (self.next_u32() as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

fn shapes() -> Vec<Vec<f32>> {
    let mut mlcg = Lcg(0x1234_5678_9abc_def0);
    let mut noise: Vec<f32> = (0..4096).map(|_| mlcg.next_f32()).collect();
    let mut loud = Lcg(7);
    let mut over: Vec<f32> = (0..1024).map(|_| loud.next_f32() * 100.0).collect();

    let mut shapes = vec![
        Vec::new(),
        vec![0.0],
        vec![1.0; 5],
        vec![0.0; 2048],
        vec![1.0; 2048],
        vec![-1.0; 2048],
        vec![f32::NAN; 2048],
        vec![f32::INFINITY; 2048],
        vec![f32::NEG_INFINITY; 2048],
        (0..2048)
            .map(|i| if i % 2 == 0 { 1.0 } else { -1.0 })
            .collect(),
        (0..2049).map(|i| (i as f32 * 0.01).sin()).collect(),
    ];
    shapes.push(std::mem::take(&mut noise));
    shapes.push(std::mem::take(&mut over));
    shapes
}

/// Non-finite values are permitted only in the documented cases (`hnr_db`,
/// `h1_h2_db`, `cpp_db`, `spl_db`, `jitter_local`, `shimmer_local`).
fn assert_outputs_sane(frame: &AnalysisFrame, context: &str) {
    for (name, value) in [
        ("f0_hz", frame.f0_hz),
        ("voicing", frame.voicing),
        ("f0_confidence", frame.f0_confidence),
        ("tilt_db_per_oct", frame.tilt_db_per_oct),
        ("centroid_hz", frame.centroid_hz),
        ("scale_semitones", frame.scale_semitones),
        ("rms_dbfs", frame.rms_dbfs),
        ("flags", frame.flags),
    ] {
        assert!(value.is_finite(), "{context}: {name} is {value}");
    }
    assert!((0.0..=1.0).contains(&frame.voicing), "{context}: voicing out of range");
    assert!(
        (0.0..=1.0).contains(&frame.f0_confidence),
        "{context}: f0_confidence out of range"
    );
    for (i, formant) in frame.formants.iter().enumerate() {
        assert!(formant.hz.is_finite(), "{context}: formants[{i}].hz not finite");
        assert!(
            formant.bandwidth_hz.is_finite(),
            "{context}: formants[{i}].bandwidth_hz not finite"
        );
        assert!(
            (0.0..=1.0).contains(&formant.confidence),
            "{context}: formants[{i}].confidence out of range"
        );
    }
}

fn drain_all<A: Analyzer>(analyzer: &mut A, context: &str) {
    let mut out = vec![AnalysisFrame::default(); 512];
    loop {
        let n = analyzer.drain(&mut out);
        if n == 0 {
            break;
        }
        for frame in &out[..n] {
            assert_outputs_sane(frame, context);
        }
    }
}

#[test]
fn pipeline_never_panics_and_outputs_stay_finite() {
    // Bound the frames analysed per configuration so the sweep stays fast; the
    // property is about degenerate shapes and sizes, not long runs.
    const MAX_FRAMES: usize = 48;
    for frame_len in [1usize, 2, 3, 7, 64, 256, 512, 1024, 2048] {
        for hop in [1usize, (frame_len / 2).max(1), frame_len] {
            let take_limit = frame_len.saturating_add(hop.saturating_mul(MAX_FRAMES));
            for signal in shapes() {
                let take = take_limit.min(signal.len());
                let input = &signal[..take];
                let context = format!("len={frame_len} hop={hop} samples={take}");

                let mut params = AnalysisParams::new(44_100);
                params.frame_len = frame_len;
                params.hop = hop;

                let mut analyzer = FrameAnalyzer::new(44_100);
                analyzer.configure(params);
                analyzer.push(input);
                drain_all(&mut analyzer, &context);
            }
        }
    }
}

#[test]
fn silence_is_unvoiced_through_the_pipeline() {
    let mut analyzer = FrameAnalyzer::new(44_100);
    analyzer.push(&vec![0.0f32; 44_100]);

    let mut out = vec![AnalysisFrame::default(); 512];
    let mut seen = 0usize;
    loop {
        let n = analyzer.drain(&mut out);
        if n == 0 {
            break;
        }
        for frame in &out[..n] {
            assert!(
                frame.f0_hz <= 0.0,
                "silence must be unvoiced, got f0 = {}",
                frame.f0_hz
            );
            seen += 1;
        }
    }
    assert!(seen > 0, "silence should still produce frames");
}

#[test]
fn session_analyzer_survives_nan_input() {
    let mut analyzer = SessionAnalyzer::new(44_100);
    analyzer.start_session();
    analyzer.push(&vec![f32::NAN; 8192]);

    let mut out = vec![AnalysisFrame::default(); 256];
    let mut seen = 0usize;
    loop {
        let n = analyzer.drain(&mut out);
        if n == 0 {
            break;
        }
        for frame in &out[..n] {
            assert!(frame.scale_semitones.is_finite());
            seen += 1;
        }
    }
    assert!(seen > 0);
}
