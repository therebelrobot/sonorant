//! S1.3 tests: the batch analyser emits frames for a WAV, and fails cleanly on a
//! missing or unsupported file.

use std::path::{Path, PathBuf};
use std::process::Command;

use sonorant_core::synthetic;

fn tmp(name: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!("sonorant-cli-test-{}-{name}", std::process::id()));
    p
}

fn write_wav(path: &Path, f0: f32) {
    let pcm = synthetic::vowel(
        f0,
        &[(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)],
        44100.0,
        0.3,
    );
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 44100,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut writer = hound::WavWriter::create(path, spec).unwrap();
    for sample in pcm {
        writer.write_sample(sample).unwrap();
    }
    writer.finalize().unwrap();
}

#[test]
fn analyses_a_wav_to_csv() {
    let path = tmp("ok.wav");
    write_wav(&path, 150.0);

    let out = Command::new(env!("CARGO_BIN_EXE_sonorant-cli"))
        .arg(&path)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "exit {:?}, stderr: {}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr)
    );

    let stdout = String::from_utf8(out.stdout).unwrap();
    let mut lines = stdout.lines();
    assert!(lines.next().unwrap().starts_with("t_ms,f0_hz,voicing,f0_confidence"));

    let row = lines.next().expect("expected at least one frame");
    let f0: f32 = row.split(',').nth(1).unwrap().parse().unwrap();
    assert!((f0 - 150.0).abs() / 150.0 < 0.05, "measured f0 {f0}");

    let _ = std::fs::remove_file(&path);
}

#[test]
fn missing_file_exits_nonzero_with_cause() {
    let path = tmp("does-not-exist.wav");
    let _ = std::fs::remove_file(&path);

    let out = Command::new(env!("CARGO_BIN_EXE_sonorant-cli"))
        .arg(&path)
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("could not read input file"),
        "stderr: {stderr}"
    );
}

#[test]
fn unsupported_file_exits_nonzero() {
    let path = tmp("not-a-wav.txt");
    std::fs::write(&path, "this is definitely not a wav file").unwrap();

    let out = Command::new(env!("CARGO_BIN_EXE_sonorant-cli"))
        .arg(&path)
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("not supported"), "stderr: {stderr}");

    let _ = std::fs::remove_file(&path);
}
