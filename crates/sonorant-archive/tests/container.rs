//! S6.1 tests: the container round-trips its manifest, and the manifest is
//! readable without a passphrase.

use std::io::Cursor;

use sonorant_archive::{
    Counts, FORMAT, FORMAT_VERSION, MANIFEST_NAME, PAYLOAD_PLAIN, SCHEMA_VERSION, describe,
    manifest, read_manifest, write_container,
};

fn sample(encrypted: bool) -> sonorant_archive::Manifest {
    manifest(sonorant_archive::ManifestParams {
        core_version: "0.1.0".to_string(),
        abi_version: 1,
        schema_version: SCHEMA_VERSION,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        encrypted,
        kdf: None,
        counts: Counts {
            sessions: 3,
            utterances: 12,
            recordings: 1,
        },
    })
}

#[test]
fn manifest_carries_every_field() {
    let m = sample(false);
    assert_eq!(m.format, FORMAT);
    assert_eq!(m.format_version, FORMAT_VERSION);
    assert_eq!(m.schema_version, SCHEMA_VERSION);
    assert_eq!(m.core_version, "0.1.0");
    assert_eq!(m.abi_version, 1);
    assert_eq!(m.created_at, "2026-01-01T00:00:00Z");
    assert!(!m.encrypted);
    assert!(m.kdf.is_none());
    assert_eq!(m.counts.sessions, 3);
}

#[test]
fn container_round_trips_the_manifest() {
    let m = sample(false);
    let mut buffer = Cursor::new(Vec::new());
    write_container(&mut buffer, &m, b"{\"sessions\":[]}").expect("write");

    buffer.set_position(0);
    let read = read_manifest(&mut buffer).expect("read");
    assert_eq!(read, m, "the manifest survives the round trip");
}

#[test]
fn a_plaintext_container_holds_a_payload_file() {
    let m = sample(false);
    let mut buffer = Cursor::new(Vec::new());
    write_container(&mut buffer, &m, b"{}").expect("write");

    buffer.set_position(0);
    let archive = zip::ZipArchive::new(&mut buffer).expect("zip");
    let names: Vec<String> = archive
        .file_names()
        .map(|name| name.expect("entry name").to_string())
        .collect();
    assert!(names.contains(&MANIFEST_NAME.to_string()));
    assert!(names.contains(&PAYLOAD_PLAIN.to_string()));
}

#[test]
fn the_manifest_tells_a_user_what_the_file_is_without_a_passphrase() {
    let m = sample(false);
    let text = describe(&m);
    assert!(text.contains("voice history"));
    assert!(text.contains("3 session(s)"));
    assert!(text.contains("12 utterance(s)"));
    assert!(text.contains("not encrypted"));

    let encrypted = describe(&sample(true));
    assert!(encrypted.contains("encrypted"));
}
