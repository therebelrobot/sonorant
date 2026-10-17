//! S1.4 tests: the published fixture is reproducible from its recipe.
//!
//! The comparison is exact for everything that identifies the fixture, and
//! per-measure for the expected values. A byte-exact match of the whole document
//! would make the fixture platform-dependent: the LPC root-finder converts each
//! pole with `atan2`/`ln` (libm), which differ by a few ULP between macOS and
//! Linux, so the 4-dp formant values drift even though the analysis is unchanged.
//! TDD §14: assertions use documented per-measure tolerance bands, not equality.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

const DESCRIPTION: &str = "synthetic vowel, f0 150 Hz, formants 700/1220/2600 Hz, 0.3 s @ 44100 Hz";

fn tmp(name: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!("sonorant-fixture-test-{}-{name}", std::process::id()));
    p
}

/// A measure with a documented relative band (`f0_rel`, `formant_rel`).
fn check_rel(
    name: &str,
    measured: Option<f64>,
    expected: f64,
    tolerance: f64,
    failures: &mut Vec<String>,
) {
    match measured {
        Some(m) if expected != 0.0 => {
            let error = (m - expected).abs() / expected.abs();
            if error > tolerance {
                failures.push(format!(
                    "{name}: expected {expected}, produced {m} ({:.1}% off, band {:.1}%)",
                    error * 100.0,
                    tolerance * 100.0
                ));
            }
        }
        Some(_) => failures.push(format!("{name}: expected 0, cannot form a ratio")),
        None => failures.push(format!("{name}: no value (expected {expected})")),
    }
}

/// A measure with a documented absolute band (`perturbation_abs`), where a ratio
/// against a zero expectation would be meaningless.
fn check_abs(
    name: &str,
    measured: Option<f64>,
    expected: f64,
    tolerance: f64,
    failures: &mut Vec<String>,
) {
    match measured {
        Some(m) => {
            if (m - expected).abs() > tolerance {
                failures.push(format!(
                    "{name}: expected {expected}, produced {m} (band ±{tolerance})"
                ));
            }
        }
        None => failures.push(format!("{name}: no value (expected {expected})")),
    }
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

    let produced: Value = serde_json::from_str(&std::fs::read_to_string(&json).unwrap()).unwrap();
    let committed: Value = serde_json::from_str(
        &std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/reference/vowel-150.json"),
        )
        .unwrap(),
    )
    .unwrap();

    // Everything that identifies the fixture must match exactly. `tolerances` is
    // generated from `sonorant-core::tolerances`, so this also catches a band that
    // has drifted from the constant.
    for key in [
        "fixture_format",
        "generator",
        "core_version",
        "description",
        "input",
        "tolerances",
    ] {
        assert_eq!(
            produced[key], committed[key],
            "the committed fixture is stale: `{key}` differs; regenerate fixtures/reference/vowel-150.json"
        );
    }

    let tol = &committed["tolerances"];
    let f0_rel = tol["f0_rel"].as_f64().unwrap();
    let formant_rel = tol["formant_rel"].as_f64().unwrap();
    let perturbation_abs = tol["perturbation_abs"].as_f64().unwrap();

    let p = &produced["expected"];
    let c = &committed["expected"];
    let mut failures = Vec::new();

    check_rel(
        "f0_hz",
        p["f0_hz"].as_f64(),
        c["f0_hz"].as_f64().unwrap(),
        f0_rel,
        &mut failures,
    );

    let produced_formants = p["formants_hz"].as_array().unwrap();
    for (i, expected) in c["formants_hz"].as_array().unwrap().iter().enumerate() {
        check_rel(
            &format!("formants_hz[{i}]"),
            produced_formants.get(i).and_then(Value::as_f64),
            expected.as_f64().unwrap(),
            formant_rel,
            &mut failures,
        );
    }

    for measure in ["jitter_local", "shimmer_local"] {
        check_abs(
            measure,
            p[measure].as_f64(),
            c[measure].as_f64().unwrap(),
            perturbation_abs,
            &mut failures,
        );
    }

    // HNR and level carry no documented band (`docs/measure-tolerances.md`), so the
    // snapshot is compared exactly rather than against a threshold.
    for measure in ["hnr_db", "rms_dbfs"] {
        assert_eq!(
            p[measure], c[measure],
            "the committed fixture is stale: `{measure}` differs; regenerate fixtures/reference/vowel-150.json"
        );
    }

    assert!(
        failures.is_empty(),
        "the committed fixture is stale; regenerate fixtures/reference/vowel-150.json:\n  {}",
        failures.join("\n  ")
    );

    let _ = std::fs::remove_file(&wav);
    let _ = std::fs::remove_file(&json);
}
