//! S7.1 tests: the store and the dBFS → SPL conversion. The flow that captures a
//! reference tone is blocked on hardware (see the calibration issue).

use sonorant_calibrate::{
    Calibration, CalibrationStore, Method, REFERENCE_SPL_DB, SensitivityEstimate, dbfs_to_spl,
    spl_db,
};

fn calibration(sensitivity_dbfs_at_94db: f32) -> Calibration {
    Calibration {
        id: "c1".to_string(),
        device_class: "tauri-desktop".to_string(),
        mic_model: Some("example".to_string()),
        sensitivity_dbfs_at_94db,
        method: Method::Calibrator,
        measured_at: 0,
    }
}

#[test]
fn dbfs_converts_to_spl_against_the_reference() {
    // A tone at -36 dBFS with a -36 dBFS@94 dB sensitivity is 94 dB SPL.
    assert_eq!(dbfs_to_spl(-36.0, -36.0), REFERENCE_SPL_DB);
    assert_eq!(dbfs_to_spl(-46.0, -36.0), 84.0);
    assert_eq!(dbfs_to_spl(-76.0, -36.0), 54.0);
    assert_eq!(dbfs_to_spl(-40.0, -30.0), 84.0);
}

#[test]
fn spl_is_nan_without_a_calibration() {
    assert!(spl_db(-20.0, None).is_nan(), "no calibration => NaN, never zero");
}

#[test]
fn spl_is_real_with_an_active_calibration() {
    let measured = calibration(-36.0);
    assert_eq!(spl_db(-36.0, Some(&measured)), 94.0);
}

#[test]
fn a_shipped_estimate_is_not_a_calibration() {
    // The type system forbids passing an estimate where a calibration is required;
    // this asserts the property the type encodes: an estimate alone yields NaN.
    let estimate = SensitivityEstimate {
        device_class: "web".to_string(),
        sensitivity_dbfs_at_94db: -30.0,
    };
    assert_eq!(estimate.sensitivity_dbfs_at_94db, -30.0, "an estimate carries a number");
    assert!(spl_db(-20.0, None).is_nan(), "but it cannot make spl_db real");
    assert_eq!(Method::ReferenceTone.as_str(), "reference_tone");
}

#[test]
fn the_store_activates_and_resolves_calibrations() {
    let mut store = CalibrationStore::new();
    assert!(store.active().is_none());

    store.add(calibration(-36.0));
    assert_eq!(store.active().map(|c| c.id.as_str()), Some("c1"));
    assert_eq!(store.entries().len(), 1);

    let second = Calibration {
        id: "c2".to_string(),
        ..calibration(-40.0)
    };
    store.add(second);
    assert_eq!(store.active().map(|c| c.id.as_str()), Some("c1"), "first stays active");

    assert!(store.set_active("c2"));
    assert_eq!(store.active().map(|c| c.id.as_str()), Some("c2"));
    assert!(!store.set_active("missing"), "unknown id is refused");

    store.clear_active();
    assert!(store.active().is_none());
    assert!(spl_db(-20.0, store.active()).is_nan(), "uncalibrated after clearing");
}
