//! S1.4 tests: the published fixture is reproducible from its recipe.

use std::path::{Path, PathBuf};
use std::process::Command;

const DESCRIPTION: &str = "synthetic vowel, f0 150 Hz, formants 700/1220/2600 Hz, 0.3 s @ 44100 Hz";

fn tmp(name: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!("sonorant-fixture-test-{}-{name}", std::process::id()));
    p
}

#[test]
fn committed_fixture_is_reproducible() {
    let bin = env!("CARGO_BIN_EXE_sonorant-cli");
    let wav = tmp("repro.wav");
    let json = tmp("repro.json");
    let _ = std::fs::remove_file(&wav);
    let _ = std::fs::remove_file(&json);

    let synth = Command::new(bin)
        .args([
            "synth",
            "--f0",
            "150",
            "--duration",
            "0.3",
            "--sample-rate",
            "44100",
            "--out",
        ])
        .arg(&wav)
        .status()
        .unwrap();
    assert!(synth.success(), "synth failed");

    let fixture = Command::new(bin)
        .arg("fixture")
        .arg(&wav)
        .arg("--description")
        .arg(DESCRIPTION)
        .arg("--out")
        .arg(&json)
        .status()
        .unwrap();
    assert!(fixture.success(), "fixture generation failed");

    let produced = std::fs::read_to_string(&json).unwrap();
    let committed = std::fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/reference/vowel-150.json"),
    )
    .unwrap();

    assert_eq!(
        produced, committed,
        "the committed fixture is stale; regenerate fixtures/reference/vowel-150.json"
    );

    let _ = std::fs::remove_file(&wav);
    let _ = std::fs::remove_file(&json);
}
