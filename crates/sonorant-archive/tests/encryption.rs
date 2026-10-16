//! S6.2 tests: AEAD payload encryption under an Argon2id-derived key.

use std::io::Cursor;

use sonorant_archive::{
    ArchiveError, Counts, SCHEMA_VERSION, decrypt_payload, default_kdf, encrypt_payload,
    read_manifest, read_payload, write_archive,
};

fn params() -> sonorant_archive::ManifestParams {
    sonorant_archive::ManifestParams {
        core_version: "0.1.0".to_string(),
        abi_version: 1,
        schema_version: SCHEMA_VERSION,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        encrypted: false,
        kdf: None,
        counts: Counts {
            sessions: 1,
            utterances: 1,
            recordings: 0,
        },
    }
}

#[test]
fn default_kdf_is_the_chosen_budget() {
    let kdf = default_kdf();
    assert_eq!(kdf.algo, "argon2id");
    assert_eq!((kdf.m, kdf.t, kdf.p), (65_536, 3, 1));
}

#[test]
fn encrypted_payload_round_trips() {
    let kdf = default_kdf();
    let plain = b"{\"sessions\":[]}";
    let encrypted = encrypt_payload("correct horse", plain, &kdf).expect("encrypt");
    assert_ne!(&encrypted[..], &plain[..], "ciphertext differs from plaintext");
    assert_eq!(
        decrypt_payload("correct horse", &encrypted, &kdf).expect("decrypt"),
        plain
    );
}

#[test]
fn a_wrong_passphrase_fails_cleanly() {
    let kdf = default_kdf();
    let encrypted = encrypt_payload("right", b"secret", &kdf).expect("encrypt");
    assert!(matches!(
        decrypt_payload("wrong", &encrypted, &kdf),
        Err(ArchiveError::WrongPassphrase)
    ));
}

#[test]
fn a_truncated_payload_is_rejected() {
    let kdf = default_kdf();
    assert!(matches!(
        decrypt_payload("x", &[0u8; 8], &kdf),
        Err(ArchiveError::Malformed(_))
    ));
}

#[test]
fn encrypted_archive_records_the_kdf_and_round_trips_with_the_passphrase() {
    let mut buffer = Cursor::new(Vec::new());
    write_archive(&mut buffer, params(), b"{\"sessions\":[]}", Some("pass")).expect("write");

    buffer.set_position(0);
    let m = read_manifest(&mut buffer).unwrap();
    assert!(m.encrypted);
    assert_eq!(m.kdf.as_ref().unwrap().m, 65_536, "kdf recorded in the manifest");

    buffer.set_position(0);
    assert_eq!(
        read_payload(&mut buffer, Some("pass")).unwrap(),
        b"{\"sessions\":[]}"
    );

    buffer.set_position(0);
    assert!(read_payload(&mut buffer, Some("nope")).is_err());
}

#[test]
fn plaintext_archive_needs_no_passphrase_and_records_no_kdf() {
    let mut buffer = Cursor::new(Vec::new());
    write_archive(&mut buffer, params(), b"plain", None).expect("write");

    buffer.set_position(0);
    let m = read_manifest(&mut buffer).unwrap();
    assert!(!m.encrypted);
    assert!(m.kdf.is_none());

    buffer.set_position(0);
    assert_eq!(read_payload(&mut buffer, None).unwrap(), b"plain");
}

#[test]
fn an_encrypted_archive_without_a_passphrase_is_refused() {
    let mut buffer = Cursor::new(Vec::new());
    write_archive(&mut buffer, params(), b"secret", Some("pass")).expect("write");
    buffer.set_position(0);
    assert!(matches!(
        read_payload(&mut buffer, None),
        Err(ArchiveError::WrongPassphrase)
    ));
}
