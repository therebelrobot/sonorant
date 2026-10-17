//! S2.3 conformance: our measures must match an oracle within the documented
//! tolerance bands. See `docs/conformance.md`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn check(
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
                    "{name}: expected {expected}, measured {m} ({:.1}% off, band {:.1}%)",
                    error * 100.0,
                    tolerance * 100.0
                ));
            }
        }
        Some(_) => failures.push(format!("{name}: oracle expected 0, cannot form a ratio")),
        None => failures.push(format!("{name}: no measurable value (expected {expected})")),
    }
}

/// The same idea for a measure whose expected value is zero (a perfectly periodic
/// reference), where a ratio would be meaningless.
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
                    "{name}: expected {expected}, measured {m} (band ±{tolerance})"
                ));
            }
        }
        None => failures.push(format!("{name}: no measurable value (expected {expected})")),
    }
}

#[test]
fn measures_match_the_oracle_within_tolerance() {
    let root = repo_root();
    let oracle: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("fixtures/oracle/vowel-150.json")).unwrap(),
    )
    .unwrap();

    let reference = root.join(oracle["reference"].as_str().unwrap());
    let out =
        std::env::temp_dir().join(format!("sonorant-conformance-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_sonorant-cli"))
        .arg("fixture")
        .arg(&reference)
        .arg("--description")
        .arg("conformance run")
        .arg("--out")
        .arg(&out)
        .status()
        .unwrap();
    assert!(status.success(), "fixture generation failed");

    let measured: Value = serde_json::from_str(&std::fs::read_to_string(&out).unwrap()).unwrap();
    let _ = std::fs::remove_file(&out);

    let mut failures = Vec::new();

    let f0 = &oracle["measures"]["f0_hz"];
    check(
        "f0_hz",
        measured["expected"]["f0_hz"].as_f64(),
        f0["expected"].as_f64().unwrap(),
        f0["tolerance_rel"].as_f64().unwrap(),
        &mut failures,
    );

    let expected_formants = oracle["measures"]["formants_hz"].as_array().unwrap();
    let measured_formants = measured["expected"]["formants_hz"].as_array().unwrap();
    for (i, spec) in expected_formants.iter().enumerate() {
        check(
            &format!("formants_hz[{i}]"),
            measured_formants.get(i).and_then(Value::as_f64),
            spec["expected"].as_f64().unwrap(),
            spec["tolerance_rel"].as_f64().unwrap(),
            &mut failures,
        );
    }

    if let Some(perturbation) = oracle["measures"].get("perturbation") {
        for measure in ["jitter_local", "shimmer_local"] {
            let spec = &perturbation[measure];
            let tolerance = spec["tolerance_abs"].as_f64().unwrap();
            assert!(
                (tolerance - sonorant_core::tolerances::PERTURBATION_ABS as f64).abs() < 1e-6,
                "the oracle's {measure} band has drifted from tolerances::PERTURBATION_ABS"
            );
            check_abs(
                measure,
                measured["expected"][measure].as_f64(),
                spec["expected"].as_f64().unwrap(),
                tolerance,
                &mut failures,
            );
        }
    }

    assert!(
        failures.is_empty(),
        "conformance failures:\n  {}",
        failures.join("\n  ")
    );
}
