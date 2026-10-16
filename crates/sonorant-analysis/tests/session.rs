//! S2.2 tests: the session baseline and `scale_semitones`, and `t_ms` since
//! session start.

use sonorant_analysis::{AnalysisFrame, Analyzer, Session, SessionAnalyzer};
use sonorant_core::synthetic;

fn frame_with(formants: &[f32]) -> AnalysisFrame {
    let mut f = AnalysisFrame::default();
    for (i, &hz) in formants.iter().enumerate() {
        f.formants[i].hz = hz;
    }
    f
}

#[test]
fn ratio_is_log2_against_the_session_baseline() {
    let mut session = Session::with_baseline_frames(3);
    session.start();

    // Seed the baseline with three identical frames.
    for _ in 0..3 {
        let mut f = frame_with(&[700.0, 1220.0, 2600.0]);
        session.observe(&mut f);
        assert_eq!(f.scale_semitones, 0.0, "no ratio until the baseline is set");
    }
    assert!(session.baseline_hz().is_some());

    let ratio = 2f32.powf(1.0 / 12.0); // one semitone up
    let mut up = frame_with(&[700.0 * ratio, 1220.0 * ratio, 2600.0 * ratio]);
    session.observe(&mut up);
    assert!((up.scale_semitones - 1.0).abs() < 1e-3, "got {}", up.scale_semitones);

    let mut down = frame_with(&[700.0 / ratio, 1220.0 / ratio, 2600.0 / ratio]);
    session.observe(&mut down);
    assert!((down.scale_semitones + 1.0).abs() < 1e-3, "got {}", down.scale_semitones);
}

#[test]
fn baseline_is_a_finite_positive_scale() {
    let mut session = Session::with_baseline_frames(3);
    session.start();
    for hz in [600.0f32, 800.0, 1000.0] {
        let mut f = frame_with(&[hz, hz * 1.5, hz * 2.0]);
        session.observe(&mut f);
    }
    let baseline = session.baseline_hz().expect("baseline established");
    assert!(baseline.is_finite() && baseline > 0.0);
}

#[test]
fn start_restarts_t_ms_and_baseline() {
    let mut a = SessionAnalyzer::new(44100);
    a.start_session();
    let sig = synthetic::vowel(
        150.0,
        &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
        44100.0,
        0.4,
    );
    a.push(&sig);

    let mut out = vec![AnalysisFrame::default(); 64];
    let n = a.drain(&mut out);
    assert!(n > 0);
    assert_eq!(out[0].t_ms, 0, "t_ms is measured since session start");
    assert!(out[n - 1].t_ms > out[0].t_ms);
    // On a constant vowel the baseline is established, so later frames sit near 0.
    assert!(
        out[n - 1].scale_semitones.abs() < 0.5,
        "got {}",
        out[n - 1].scale_semitones
    );

    // Restart: the clock resets to 0.
    a.start_session();
    a.push(&sig);
    let mut out2 = vec![AnalysisFrame::default(); 64];
    let n2 = a.drain(&mut out2);
    assert!(n2 > 0);
    assert_eq!(out2[0].t_ms, 0);
}
