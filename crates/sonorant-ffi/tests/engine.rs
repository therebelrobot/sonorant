//! S3.1 tests: the `Engine` drives the `Analyzer` contract and exposes frames as a
//! contiguous `f32` block.

use sonorant_core::synthetic;
use sonorant_ffi::{Engine, FRAME_WORDS};

fn vowel(f0: f32) -> Vec<f32> {
    synthetic::vowel(
        f0,
        &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
        44100.0,
        0.5,
    )
}

#[test]
fn engine_reports_versions() {
    let engine = Engine::new(44100);
    assert_eq!(engine.abi_version(), 1);
    assert!(!engine.core_version().is_empty());
}

#[test]
fn engine_emits_frames_readable_as_f32_words() {
    let mut engine = Engine::new(44100);
    engine.configure(2048, 512, 24);

    let produced = engine.push(&vowel(150.0));
    assert!(produced > 0, "expected frames from a 0.5 s signal");
    assert_eq!(engine.frames_len(), produced);

    // The frame array is a flat f32 block: word 0 is t_ms (u32), word 1 is f0_hz.
    let words = unsafe {
        std::slice::from_raw_parts(engine.frames_ptr(), engine.frames_len() * FRAME_WORDS)
    };
    let f0 = words[1];
    assert!((f0 - 150.0).abs() / 150.0 < 0.05, "measured f0 {f0}");
    // spl_db (word 26) is NaN while uncalibrated.
    assert!(words[26].is_nan());
}

#[test]
fn reset_clears_frames() {
    let mut engine = Engine::new(44100);
    engine.configure(2048, 512, 24);
    assert!(engine.push(&vec![0.1f32; 8192]) > 0);

    engine.reset();
    assert_eq!(engine.frames_len(), 0);
    assert_eq!(engine.push(&vec![0.0f32; 64]), 0);
}
