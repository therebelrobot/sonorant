//! Archive FFI tests: the surface wraps `sonorant-archive` with no extra logic.

use serde_json::{Value, json};
use sonorant_ffi::{archive_describe, archive_export, archive_import};

fn bundle_json() -> String {
    json!({
        "sessions": [{ "id": "s1", "data": { "core_version": "0.1.0" } }],
        "utterances": [],
        "metric_series": []
    })
    .to_string()
}

const EMPTY: &str = "{\"sessions\":[],\"utterances\":[],\"metric_series\":[]}";

#[test]
fn export_then_describe_and_import_round_trips() {
    let bytes = archive_export(&bundle_json(), "0.1.0", 1, "2026-01-01T00:00:00Z", Some("pass".into()))
        .expect("export");

    let described = archive_describe(&bytes).expect("describe");
    assert!(described.contains("voice history"));

    let imported: Value =
        serde_json::from_str(&archive_import(&bytes, EMPTY, Some("pass".into())).expect("import"))
            .expect("json");
    assert_eq!(imported["report"]["added"], 1);
    assert_eq!(imported["bundle"]["sessions"][0]["id"], "s1");
}

#[test]
fn a_wrong_passphrase_is_an_error_not_a_panic() {
    let bytes = archive_export(&bundle_json(), "0.1.0", 1, "t", Some("right".into())).expect("export");
    assert!(archive_import(&bytes, EMPTY, Some("wrong".into())).is_err());
}

#[test]
fn a_plaintext_export_can_be_imported_without_a_passphrase() {
    let bytes = archive_export(&bundle_json(), "0.1.0", 1, "t", None).expect("export");
    let imported = archive_import(&bytes, EMPTY, None).expect("import");
    assert!(imported.contains("added"));
}

#[test]
fn a_damaged_archive_is_an_error() {
    assert!(archive_describe(&[0u8; 16]).is_err());
}
