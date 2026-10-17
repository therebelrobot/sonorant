//! S6.3 tests: import merges by id, reports added/skipped/conflicted, never
//! silently overwrites, refuses a newer format, and fails cleanly when damaged.

use std::io::Cursor;

use serde_json::json;
use sonorant_archive::{
    ArchiveError, Bundle, Counts, FORMAT, FORMAT_VERSION, Manifest, ManifestParams, Record,
    SCHEMA_VERSION, bundle_json, import_archive, merge_bundles, write_archive, write_container,
};

fn rec(id: &str, n: i64) -> Record {
    Record {
        id: id.to_string(),
        data: json!({ "n": n }),
    }
}

fn bundle(sessions: Vec<Record>) -> Bundle {
    Bundle {
        sessions,
        utterances: Vec::new(),
        metric_series: Vec::new(),
    }
}

fn params() -> ManifestParams {
    ManifestParams {
        core_version: "0.1.0".to_string(),
        abi_version: 1,
        schema_version: SCHEMA_VERSION,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        encrypted: false,
        kdf: None,
        counts: Counts {
            sessions: 0,
            utterances: 0,
            recordings: 0,
        },
    }
}

fn archive_of(source: &Bundle, passphrase: Option<&str>) -> Cursor<Vec<u8>> {
    let mut buffer = Cursor::new(Vec::new());
    let payload = bundle_json(source).unwrap();
    write_archive(&mut buffer, params(), payload.as_bytes(), passphrase).unwrap();
    buffer.set_position(0);
    buffer
}

#[test]
fn merge_adds_skips_and_conflicts_without_overwriting() {
    let existing = bundle(vec![rec("a", 1), rec("b", 2)]);
    let incoming = bundle(vec![rec("b", 2), rec("c", 3), rec("b", 99)]);

    let (merged, report) = merge_bundles(&existing, &incoming);

    assert_eq!(report.added, 1);
    assert_eq!(report.skipped, 1);
    assert_eq!(report.conflicted, 1);
    assert_eq!(report.conflicts, vec!["b".to_string()]);
    assert!(report.line().contains("kept your existing copy"));

    let b = merged.sessions.iter().find(|r| r.id == "b").unwrap();
    assert_eq!(b.data["n"], json!(2), "the existing copy is kept, never overwritten");
    assert!(merged.sessions.iter().any(|r| r.id == "c"));
}

#[test]
fn import_round_trips_a_plaintext_archive_and_reports() {
    let source = bundle(vec![rec("a", 1), rec("b", 2)]);
    let mut buffer = archive_of(&source, None);

    let existing = bundle(vec![rec("a", 1)]);
    let (merged, report) = import_archive(&mut buffer, None, &existing).unwrap();

    assert_eq!(report.added, 1, "b is new");
    assert_eq!(report.skipped, 1, "a is identical");
    assert_eq!(merged.sessions.len(), 2);
}

#[test]
fn import_reads_an_encrypted_archive_only_with_the_right_passphrase() {
    let source = bundle(vec![rec("a", 1)]);
    let mut buffer = archive_of(&source, Some("pass"));

    let (merged, report) = import_archive(&mut buffer, Some("pass"), &Bundle::default()).unwrap();
    assert_eq!(report.added, 1);
    assert_eq!(merged.sessions.len(), 1);

    buffer.set_position(0);
    assert!(matches!(
        import_archive(&mut buffer, Some("wrong"), &Bundle::default()),
        Err(ArchiveError::WrongPassphrase)
    ));
}

#[test]
fn a_newer_format_version_is_refused_with_a_clear_message() {
    let newer = Manifest {
        format: FORMAT.to_string(),
        format_version: FORMAT_VERSION + 1,
        schema_version: SCHEMA_VERSION,
        core_version: "9.9.9".to_string(),
        abi_version: 1,
        created_at: "x".to_string(),
        encrypted: false,
        kdf: None,
        counts: Counts {
            sessions: 0,
            utterances: 0,
            recordings: 0,
        },
    };
    let mut buffer = Cursor::new(Vec::new());
    write_container(&mut buffer, &newer, b"{}").unwrap();
    buffer.set_position(0);

    let error = import_archive(&mut buffer, None, &Bundle::default()).unwrap_err();
    assert!(matches!(
        error,
        ArchiveError::UnsupportedFormat { found, .. } if found == FORMAT_VERSION + 1
    ));
    assert!(error.to_string().contains("newer version"));
}

#[test]
fn a_truncated_archive_fails_cleanly() {
    let bytes = vec![0u8; 24];
    assert!(import_archive(Cursor::new(bytes), None, &Bundle::default()).is_err());
}
