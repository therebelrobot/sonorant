//! S1.1 integration tests: measure the numerics against synthetic signals with
//! known F0 and known formants, and check robustness on degenerate input.
//!
//! Tolerance bands asserted here are the ones documented in
//! `docs/measure-tolerances.md`.

use sonorant_core::{features, formants, lpc, pitch, spectrum, synthetic, window};

const SR: f32 = 44100.0;
const FRAME: usize = 2048;

fn lpc_of(signal: &[f32], order: usize) -> Vec<f32> {
    let pre = window::pre_emphasis(signal, 0.97);
    let win = window::hann(pre.len());
    let framed = window::apply(&pre, &win);
    lpc::lpc_coefficients(&framed, order)
}

#[test]
fn pitch_tracks_synthetic_f0() {
    for &f0 in &[90.0f32, 120.0, 180.0, 300.0] {
        let sig = synthetic::vowel(
            f0,
            &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
            SR,
            0.3,
        );
        let frame = &sig[4000..4000 + FRAME];
        let p = pitch::yin(
            frame,
            SR,
            pitch::DEFAULT_MIN_F0_HZ,
            pitch::DEFAULT_MAX_F0_HZ,
            pitch::DEFAULT_THRESHOLD,
        );
        println!("f0={f0} measured={} conf={}", p.f0_hz, p.confidence);
        assert!(p.f0_hz > 0.0, "frame should be voiced at f0={f0}");
        assert!(
            ((p.f0_hz - f0) / f0).abs() < 0.02,
            "f0 {f0} measured {}",
            p.f0_hz
        );
    }
}

#[test]
fn formants_track_synthetic_vowel() {
    let expected = [700.0f32, 1220.0, 2600.0];
    let sig = synthetic::vowel(
        120.0,
        &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
        SR,
        0.5,
    );
    let frame = &sig[8000..8000 + FRAME];
    let a = lpc_of(frame, 24);
    let fs = formants::lpc_formants(&a, SR, 5500.0);
    println!(
        "formants: {:?}",
        fs.iter()
            .map(|f| (f.hz, f.bandwidth_hz, f.confidence))
            .collect::<Vec<_>>()
    );
    assert!(fs.len() >= 3, "expected >=3 formants, got {}", fs.len());
    for (f, &e) in fs.iter().zip(expected.iter()) {
        assert!(
            ((f.hz - e) / e).abs() < 0.10,
            "formant expected {e} Hz, measured {} Hz",
            f.hz
        );
    }
}

#[test]
fn silence_is_unvoiced_and_finite() {
    let frame = vec![0.0f32; FRAME];
    let p = pitch::yin(
        &frame,
        SR,
        pitch::DEFAULT_MIN_F0_HZ,
        pitch::DEFAULT_MAX_F0_HZ,
        pitch::DEFAULT_THRESHOLD,
    );
    assert!(p.f0_hz <= 0.0, "silence must be unvoiced, got {}", p.f0_hz);
    let a = lpc_of(&frame, 24);
    assert!(formants::lpc_formants(&a, SR, 5500.0).is_empty());
    assert!(features::rms_dbfs(&frame).is_finite());
    assert_eq!(features::rms_dbfs(&frame), features::DBFS_FLOOR);
}

#[test]
fn degenerate_input_never_panics() {
    let inputs: Vec<Vec<f32>> = vec![
        Vec::new(),
        vec![0.0],
        vec![1.0; 7],
        vec![f32::NAN; 512],
        vec![f32::INFINITY; 512],
        (0..1000).map(|i| if i % 2 == 0 { 1.0 } else { -1.0 }).collect(), // clipping
        (0..513).map(|i| (i as f32 * 0.1).sin()).collect(),               // odd size
    ];
    for frame in inputs {
        let _ = spectrum::power_spectrum(&frame);
        let _ = sonorant_core::cepstrum::real_cepstrum(&frame);
        let _ = sonorant_core::cepstrum::cpp(
            &sonorant_core::cepstrum::real_cepstrum(&frame),
            SR,
        );
        let _ = features::rms_dbfs(&frame);
        let a = lpc_of(&frame, 24);
        let fs = formants::lpc_formants(&a, SR, 5500.0);
        for f in &fs {
            assert!(f.hz.is_finite(), "non-finite formant hz for len {}", frame.len());
            assert!(f.bandwidth_hz.is_finite());
            assert!(f.confidence.is_finite());
        }
        let _ = pitch::yin(
            &frame,
            SR,
            pitch::DEFAULT_MIN_F0_HZ,
            pitch::DEFAULT_MAX_F0_HZ,
            pitch::DEFAULT_THRESHOLD,
        );
    }
}

#[test]
fn spectral_features_are_finite_on_a_voiced_frame() {
    let sig = synthetic::vowel(
        150.0,
        &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
        SR,
        0.3,
    );
    let frame = &sig[4000..4000 + FRAME];
    let pre = window::pre_emphasis(frame, 0.97);
    let win = window::hann(pre.len());
    let framed = window::apply(&pre, &win);
    let mag = spectrum::magnitude(&spectrum::power_spectrum(&framed));
    let p = pitch::yin(
        frame,
        SR,
        pitch::DEFAULT_MIN_F0_HZ,
        pitch::DEFAULT_MAX_F0_HZ,
        pitch::DEFAULT_THRESHOLD,
    );
    assert!(p.f0_hz > 0.0, "frame should be voiced");
    assert!(features::rms_dbfs(frame).is_finite());
    assert!(features::hnr_db(frame, SR, p.f0_hz).is_finite());
    assert!(features::h1_h2_db(&mag, SR, p.f0_hz).is_finite());
    assert!(features::spectral_tilt_db_per_oct(&mag, SR).is_finite());
    assert!(features::centroid_hz(&mag, SR).is_finite());
    let cep = sonorant_core::cepstrum::real_cepstrum(&framed);
    assert!(sonorant_core::cepstrum::cpp(&cep, SR).is_finite());
}
