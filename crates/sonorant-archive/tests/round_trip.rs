//! S6.4 tests: export → import round-trips records, and every skew/failure mode
//! fails cleanly without touching the existing store.

use std::io::Cursor;

use serde_json::json;
use sonorant_archive::{
    ArchiveError, Bundle, Counts, FORMAT, FORMAT_VERSION, Manifest, ManifestParams, Record,
    SCHEMA_VERSION, bundle_json, import_archive, write_archive, write_container,
};

fn rec(id: &str, n: i64) -> Record {
    Record {
        id: id.to_string(),
        data: json!({ "n": n }),
    }
}

fn full_bundle() -> Bundle {
    Bundle {
        sessions: vec![rec("s1", 1), rec("s2", 2)],
        utterances: vec![rec("u1", 10)],
        metric_series: vec![rec("m1", 100), rec("m2", 200)],
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
            sessions: 2,
            utterances: 1,
            recordings: 0,
        },
    }
}

fn archive(bundle: &Bundle, passphrase: Option<&str>) -> Cursor<Vec<u8>> {
    let mut buffer = Cursor::new(Vec::new());
    write_archive(&mut buffer, params(), bundle_json(bundle).unwrap().as_bytes(), passphrase)
        .unwrap();
    buffer.set_position(0);
    buffer
}

fn archive_with_manifest(manifest: &Manifest, bundle: &Bundle) -> Cursor<Vec<u8>> {
    let mut buffer = Cursor::new(Vec::new());
    write_container(&mut buffer, manifest, bundle_json(bundle).unwrap().as_bytes()).unwrap();
    buffer.set_position(0);
    buffer
}

#[test]
fn round_trip_preserves_every_record() {
    let source = full_bundle();
    let mut buffer = archive(&source, None);

    let (merged, report) = import_archive(&mut buffer, None, &Bundle::default()).unwrap();

    assert_eq!(merged, source, "all records survive the round trip");
    assert_eq!(report.added, 5);
    assert_eq!(report.skipped, 0);
    assert_eq!(report.conflicted, 0);
}

#[test]
fn a_round_trip_through_encryption_preserves_records() {
    let source = full_bundle();
    let mut buffer = archive(&source, Some("passphrase"));

    let (merged, _) = import_archive(&mut buffer, Some("passphrase"), &Bundle::default()).unwrap();
    assert_eq!(merged, source);
}

#[test]
fn an_older_format_and_schema_still_import() {
    let source = full_bundle();
    let older = Manifest {
        format: FORMAT.to_string(),
        format_version: 0,
        schema_version: 0,
        core_version: "0.0.1".to_string(),
        abi_version: 1,
        created_at: "x".to_string(),
        encrypted: false,
        kdf: None,
        counts: Counts {
            sessions: 2,
            utterances: 1,
            recordings: 0,
        },
    };
    let mut buffer = archive_with_manifest(&older, &source);

    let (merged, report) = import_archive(&mut buffer, None, &Bundle::default()).unwrap();
    assert_eq!(report.added, 5, "an older archive is accepted and imported");
    assert_eq!(merged, source);
}

#[test]
fn failures_are_clean_and_leave_the_existing_store_untouched() {
    let existing = Bundle {
        sessions: vec![rec("s1", 1)],
        utterances: Vec::new(),
        metric_series: Vec::new(),
    };
    let before = existing.clone();

    // Newer format.
    let newer = Manifest {
        format: FORMAT.to_string(),
        format_version: FORMAT_VERSION + 1,
        schema_version: SCHEMA_VERSION,
        core_version: "9.9.9".to_string(),
        abi_version: 1,
        created_at: "x".to_string(),
        encrypted: false,
        kdf: None,
        counts: Counts::default(),
    };
    let mut newer_buffer = archive_with_manifest(&newer, &Bundle::default());
    assert!(matches!(
        import_archive(&mut newer_buffer, None, &existing),
        Err(ArchiveError::UnsupportedFormat { .. })
    ));

    // Newer schema.
    let newer_schema = Manifest {
        format_version: FORMAT_VERSION,
        schema_version: SCHEMA_VERSION + 1,
        ..newer.clone()
    };
    let mut schema_buffer = archive_with_manifest(&newer_schema, &Bundle::default());
    assert!(matches!(
        import_archive(&mut schema_buffer, None, &existing),
        Err(ArchiveError::UnsupportedSchema { .. })
    ));

    // Truncated file.
    assert!(import_archive(Cursor::new(vec![0u8; 16]), None, &existing).is_err());

    // Wrong passphrase.
    let mut encrypted = archive(&full_bundle(), Some("right"));
    assert!(matches!(
        import_archive(&mut encrypted, Some("wrong"), &existing),
        Err(ArchiveError::WrongPassphrase)
    ));

    assert_eq!(existing, before, "the existing store is never mutated");
}

#[test]
fn a_duplicate_import_is_idempotent_without_overwriting() {
    let source = full_bundle();
    let first = {
        let mut buffer = archive(&source, None);
        import_archive(&mut buffer, None, &Bundle::default()).unwrap().0
    };

    let mut second = archive(&source, None);
    let (merged, report) = import_archive(&mut second, None, &first).unwrap();

    assert_eq!(report.added, 0);
    assert_eq!(report.skipped, 5, "re-importing the same records changes nothing");
    assert_eq!(merged, first);
}
