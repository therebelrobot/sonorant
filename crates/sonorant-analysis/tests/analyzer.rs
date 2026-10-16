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
    assert_eq!(a.push(&vec![0.0f32; 100]), 0, "sub-frame push yields nothing");
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
