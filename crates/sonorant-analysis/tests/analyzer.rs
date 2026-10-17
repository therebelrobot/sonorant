//! S1.2 tests: `AnalysisParams` defaults, the `Analyzer` push/drain contract, and
//! `reset`. (The pipeline now lives in `sonorant-analysis`.)

use sonorant_analysis::{flags, AnalysisFrame, AnalysisParams, Analyzer, FrameAnalyzer};
use sonorant_core::synthetic;

const SR: f32 = 44100.0;

fn vowel(f0: f32) -> Vec<f32> {
    synthetic::vowel(
        f0,
        &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
        SR,
        0.5,
    )
}

#[test]
fn defaults_follow_the_spec() {
    let p = AnalysisParams::new(44_100);
    assert_eq!(p.frame_len, 2048);
    assert_eq!(p.hop, 512);
    assert!((p.pre_emphasis - 0.97).abs() < 1e-6);
    assert_eq!(p.lpc_order, 24);
    assert!((p.max_formant_hz - 5500.0).abs() < 1e-3);

    assert_eq!(AnalysisParams::new(16_000).lpc_order, 18);
    assert_eq!(AnalysisParams::new(8_000).lpc_order, 18);
    assert_eq!(AnalysisParams::new(44_100).lpc_order, 24);
}

#[test]
fn push_drain_counts_match() {
    let mut a = FrameAnalyzer::new(44_100);
    let pushed = a.push(&vowel(150.0));
    assert!(pushed > 0, "expected frames from a 0.5 s signal");

    let mut out = vec![AnalysisFrame::default(); pushed + 4];
    let drained = a.drain(&mut out);
    assert_eq!(drained, pushed, "drain count must match frames written");
    assert_eq!(a.drain(&mut out), 0, "second drain yields nothing");

    assert!(out[0].f0_hz > 0.0);
    assert!((out[0].f0_hz - 150.0).abs() / 150.0 < 0.05);
    assert!(out[0].spl_db.is_nan());
    assert!(out[0].flags >= flags::UNCALIBRATED);
}

#[test]
fn reset_clears_state() {
    let mut a = FrameAnalyzer::new(44_100);
    a.push(&vowel(150.0));
    a.reset();

    let mut out = vec![AnalysisFrame::default(); 16];
    assert_eq!(a.drain(&mut out), 0, "reset must clear pending frames");
    assert_eq!(
        a.push(&vec![0.0f32; 100]),
        0,
        "sub-frame push yields nothing"
    );
}

#[test]
fn configure_adopts_parameters() {
    let mut a = FrameAnalyzer::new(44_100);
    let mut p = AnalysisParams::new(44_100);
    p.frame_len = 1024;
    p.hop = 256;
    a.configure(p);

    assert_eq!(a.params().frame_len, 1024);
    assert_eq!(a.push(&vec![0.1f32; 1024]), 1);
}

#[test]
fn stable_vowel_yields_confident_formants_without_the_unstable_flag() {
    let mut a = FrameAnalyzer::new(44_100);
    a.push(&vowel(150.0));
    let mut out = vec![AnalysisFrame::default(); 64];
    let n = a.drain(&mut out);
    let last = &out[n - 1];

    assert!(last.formants[0].hz > 0.0);
    for formant in &last.formants {
        assert!((0.0..=1.0).contains(&formant.confidence));
    }
    assert_eq!(
        (last.flags as i64) & (flags::FORMANT_UNSTABLE as i64),
        0,
        "a steady vowel should not be flagged unstable"
    );
}

#[test]
fn frame_layout_is_thirty_words() {
    use core::mem::size_of;
    // TDD §4.4: 29 f32 + 1 u32 = 30 words, padding-free.
    assert_eq!(size_of::<AnalysisFrame>(), 30 * 4);
    assert_eq!(size_of::<sonorant_core::Formant>(), 3 * 4);
}

#[test]
fn a_peak_at_full_scale_is_not_a_clip_but_a_rail_run_is() {
    // The synthetic vowel is normalised to exactly 1.0 at each pulse peak. One
    // sample at the rail is a peak, not an overload.
    let mut steady = FrameAnalyzer::new(44_100);
    steady.push(&vowel(150.0));
    let mut out = vec![AnalysisFrame::default(); 64];
    let drained = steady.drain(&mut out);
    assert!(drained > 0);
    for frame in &out[..drained] {
        assert_eq!(
            (frame.flags as i64) & (flags::CLIPPED as i64),
            0,
            "a single-sample peak at full scale is not a clip"
        );
    }

    // Samples pinned at the rail for a run are.
    let mut overloaded = FrameAnalyzer::new(44_100);
    overloaded.push(&vec![1.0f32; 2048]);
    let mut out = vec![AnalysisFrame::default(); 4];
    let drained = overloaded.drain(&mut out);
    assert!(drained > 0);
    assert_ne!(
        (out[0].flags as i64) & (flags::CLIPPED as i64),
        0,
        "a run at the digital rail is a clip"
    );

    // Two touching samples are still a peak, not a flat top.
    let mut two = FrameAnalyzer::new(44_100);
    let mut signal = vec![0.0f32; 2048];
    signal[100] = 1.0;
    signal[101] = 1.0;
    two.push(&signal);
    let mut out = vec![AnalysisFrame::default(); 4];
    let drained = two.drain(&mut out);
    assert!(drained > 0);
    assert_eq!(
        (out[0].flags as i64) & (flags::CLIPPED as i64),
        0,
        "two samples at the rail is not yet a flat top"
    );
}

/// Deterministic noise, so the flag tests are reproducible.
struct Lcg(u64);
impl Lcg {
    fn next_f32(&mut self) -> f32 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        ((self.0 >> 33) as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

fn analyze(signal: &[f32]) -> Vec<AnalysisFrame> {
    let mut analyzer = FrameAnalyzer::new(44_100);
    analyzer.push(signal);
    let mut out = vec![AnalysisFrame::default(); 512];
    let mut frames = Vec::new();
    loop {
        let n = analyzer.drain(&mut out);
        if n == 0 {
            break;
        }
        frames.extend_from_slice(&out[..n]);
    }
    frames
}

fn has(frame: &AnalysisFrame, flag: f32) -> bool {
    (frame.flags as i64) & (flag as i64) != 0
}

#[test]
fn low_snr_marks_a_voiced_frame_at_the_edge_of_voicing() {
    let mut signal = vowel(150.0);
    for value in signal.iter_mut() {
        *value *= 0.45;
    }
    let mut noise = Lcg(7);
    for value in signal.iter_mut() {
        *value += 0.22 * noise.next_f32();
    }

    let frames = analyze(&signal);
    let flagged: Vec<&AnalysisFrame> = frames.iter().filter(|f| has(f, flags::LOW_SNR)).collect();
    assert!(!flagged.is_empty(), "a noisy voiced frame is low signal");
    for frame in flagged {
        assert!(
            frame.f0_hz > 0.0,
            "low signal is a property of a voiced frame"
        );
        assert!(frame.hnr_db < 10.0);
    }
}

#[test]
fn a_clean_vowel_is_neither_low_signal_nor_creak() {
    for frame in &analyze(&vowel(150.0)) {
        assert!(
            !has(frame, flags::LOW_SNR),
            "clean harmonicity is {} dB",
            frame.hnr_db
        );
        assert!(
            !has(frame, flags::CREAK),
            "150 Hz is not the pulse register"
        );
    }
}

#[test]
fn creak_marks_a_low_barely_periodic_frame() {
    let mut signal = synthetic::perturbed_pulse_train(&[650], &[1.0], 44_100.0, 0.5);
    let mut noise = Lcg(11);
    for value in signal.iter_mut() {
        *value += 0.05 * noise.next_f32();
    }

    let frames = analyze(&signal);
    let frame = frames
        .iter()
        .find(|f| has(f, flags::CREAK))
        .expect("a low, barely periodic frame is creak");
    assert!(frame.f0_hz > 0.0 && frame.f0_hz <= 70.0);
    assert!(frame.hnr_db < 15.0);
}

#[test]
fn a_clean_low_frame_is_not_creak() {
    // Low but strongly periodic: a low voice, not a pulse register.
    let signal = synthetic::perturbed_pulse_train(&[650], &[1.0], 44_100.0, 0.5);
    for frame in &analyze(&signal) {
        assert!(
            !has(frame, flags::CREAK),
            "clean low harmonicity is {} dB",
            frame.hnr_db
        );
    }
}

#[test]
fn subharmonic_marks_an_octave_high_estimate() {
    // True period 600 samples carried by an amplitude alternation, so the tracker
    // can lock onto the 300-sample half-period and report an octave-high f0.
    let signal = synthetic::perturbed_pulse_train(&[300, 300], &[1.0, 0.55], 44_100.0, 0.5);
    let frames = analyze(&signal);
    let frame = frames
        .iter()
        .find(|f| has(f, flags::SUBHARMONIC))
        .expect("an octave-high estimate is flagged");
    assert!(frame.f0_hz > 0.0);
}

#[test]
fn a_clean_vowel_is_not_subharmonic() {
    for frame in &analyze(&vowel(150.0)) {
        assert!(
            !has(frame, flags::SUBHARMONIC),
            "a clean periodic frame has no octave error"
        );
    }
}
