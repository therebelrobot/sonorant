//! sonorant-archive — history export/import container (TDD §8).
//!
//! A ZIP with a plaintext, self-describing `manifest.json` and a payload entry.
//! The manifest is deliberately readable without a passphrase: a user can tell
//! what a file is before opening it. Encryption (S6.2) changes only the payload
//! entry and fills in `kdf`; the manifest stays plaintext.

use std::io::{Read, Seek, Write};

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// Container format name, as written into `manifest.json`.
pub const FORMAT: &str = "voice-history";
/// Container format version (the layout of the ZIP and manifest).
pub const FORMAT_VERSION: u32 = 1;
/// Schema version of the records inside the payload.
pub const SCHEMA_VERSION: u32 = 1;

pub const MANIFEST_NAME: &str = "manifest.json";
/// Payload entry when the archive is not encrypted.
pub const PAYLOAD_PLAIN: &str = "payload.json";
/// Payload entry when the archive is encrypted.
pub const PAYLOAD_ENCRYPTED: &str = "payload.enc";

#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("malformed archive: {0}")]
    Malformed(String),
    #[error("the passphrase did not open the archive")]
    WrongPassphrase,
    #[error("crypto error: {0}")]
    Crypto(String),
    #[error("this archive was made by a newer version of the app (format v{found}); this version supports v{supported}. Update the app, then import again. Nothing was changed.")]
    UnsupportedFormat { found: u32, supported: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Counts {
    pub sessions: u64,
    pub utterances: u64,
    pub recordings: u64,
}

/// KDF parameters, recorded so an archive can be opened later. `None` when the
/// payload is not encrypted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Kdf {
    pub algo: String,
    pub m: u32,
    pub t: u32,
    pub p: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub schema_version: u32,
    pub core_version: String,
    pub abi_version: u32,
    pub created_at: String,
    pub encrypted: bool,
    pub kdf: Option<Kdf>,
    pub counts: Counts,
}

#[derive(Clone)]
pub struct ManifestParams {
    pub core_version: String,
    pub abi_version: u32,
    pub schema_version: u32,
    pub created_at: String,
    pub encrypted: bool,
    pub kdf: Option<Kdf>,
    pub counts: Counts,
}

pub fn manifest(params: ManifestParams) -> Manifest {
    Manifest {
        format: FORMAT.to_string(),
        format_version: FORMAT_VERSION,
        schema_version: params.schema_version,
        core_version: params.core_version,
        abi_version: params.abi_version,
        created_at: params.created_at,
        encrypted: params.encrypted,
        kdf: params.kdf,
        counts: params.counts,
    }
}

/// The payload entry name for a given encryption setting.
pub fn payload_name(encrypted: bool) -> &'static str {
    if encrypted {
        PAYLOAD_ENCRYPTED
    } else {
        PAYLOAD_PLAIN
    }
}

pub fn manifest_json(manifest: &Manifest) -> Result<String, ArchiveError> {
    Ok(serde_json::to_string_pretty(manifest)?)
}

/// Write a container: `manifest.json` then the payload entry.
pub fn write_container<W: Write + Seek>(
    writer: W,
    manifest: &Manifest,
    payload: &[u8],
) -> Result<W, ArchiveError> {
    // Stored, not deflated: the payload is encrypted in the normal case, so
    // compression buys nothing, and it avoids an extra dependency.
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let mut zip = ZipWriter::new(writer);

    zip.start_file(MANIFEST_NAME, options)?;
    zip.write_all(manifest_json(manifest)?.as_bytes())?;

    zip.start_file(payload_name(manifest.encrypted), options)?;
    zip.write_all(payload)?;

    Ok(zip.finish()?)
}

/// Read only the manifest. Works without a passphrase, by design.
pub fn read_manifest<R: Read + Seek>(reader: R) -> Result<Manifest, ArchiveError> {
    let mut archive = ZipArchive::new(reader)?;
    let mut file = archive.by_name(MANIFEST_NAME)?;
    let mut text = String::new();
    file.read_to_string(&mut text)?;
    Ok(serde_json::from_str(&text)?)
}

/// A plain-language description of a container, for a user who found the file.
pub fn describe(manifest: &Manifest) -> String {
    let lock = if manifest.encrypted {
        "encrypted"
    } else {
        "not encrypted"
    };
    format!(
        "Sonorant voice history (format {} v{}); {} session(s), {} utterance(s), {} recording(s); created {}; {}.",
        manifest.format,
        manifest.format_version,
        manifest.counts.sessions,
        manifest.counts.utterances,
        manifest.counts.recordings,
        manifest.created_at,
        lock
    )
}

// --- Encryption (S6.2) ---------------------------------------------------------
//
// XChaCha20-Poly1305 under an Argon2id-derived key. The key parameters are
// recorded in `manifest.json`; the salt and nonce travel with the ciphertext as
// `salt || nonce || ciphertext` inside `payload.enc`.

pub const KDF_ALGO: &str = "argon2id";
/// 64 MiB — chosen against a device-class time budget (~0.5–1 s on a phone).
pub const DEFAULT_M: u32 = 65_536;
pub const DEFAULT_T: u32 = 3;
pub const DEFAULT_P: u32 = 1;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;

pub fn default_kdf() -> Kdf {
    Kdf {
        algo: KDF_ALGO.to_string(),
        m: DEFAULT_M,
        t: DEFAULT_T,
        p: DEFAULT_P,
    }
}

fn derive_key(passphrase: &[u8], salt: &[u8], kdf: &Kdf) -> Result<[u8; KEY_LEN], ArchiveError> {
    let params = Params::new(kdf.m, kdf.t, kdf.p, Some(KEY_LEN))
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; KEY_LEN];
    argon2
        .hash_password_into(passphrase, salt, &mut key)
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;
    Ok(key)
}

fn random_bytes(out: &mut [u8]) -> Result<(), ArchiveError> {
    getrandom::getrandom(out).map_err(|e| ArchiveError::Crypto(e.to_string()))
}

/// Encrypt `payload`, returning `salt || nonce || ciphertext`.
pub fn encrypt_payload(
    passphrase: &str,
    payload: &[u8],
    kdf: &Kdf,
) -> Result<Vec<u8>, ArchiveError> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    random_bytes(&mut salt)?;
    random_bytes(&mut nonce_bytes)?;

    let key = derive_key(passphrase.as_bytes(), &salt, kdf)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;
    let nonce = XNonce::try_from(&nonce_bytes[..])
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;
    let ciphertext = cipher
        .encrypt(&nonce, payload)
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;

    let mut out = Vec::with_capacity(SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypt `salt || nonce || ciphertext`. A wrong passphrase is a clean error and
/// changes nothing.
pub fn decrypt_payload(
    passphrase: &str,
    encrypted: &[u8],
    kdf: &Kdf,
) -> Result<Vec<u8>, ArchiveError> {
    if encrypted.len() < SALT_LEN + NONCE_LEN {
        return Err(ArchiveError::Malformed(
            "encrypted payload is too short".to_string(),
        ));
    }
    let (salt, rest) = encrypted.split_at(SALT_LEN);
    let (nonce_bytes, ciphertext) = rest.split_at(NONCE_LEN);

    let key = derive_key(passphrase.as_bytes(), salt, kdf)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;
    let nonce = XNonce::try_from(nonce_bytes)
        .map_err(|e| ArchiveError::Crypto(e.to_string()))?;
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| ArchiveError::WrongPassphrase)
}

/// Read the payload entry out of a container (encrypted or not).
pub fn read_payload<R: Read + Seek>(
    reader: R,
    passphrase: Option<&str>,
) -> Result<Vec<u8>, ArchiveError> {
    let mut archive = ZipArchive::new(reader)?;
    let manifest = {
        let mut file = archive.by_name(MANIFEST_NAME)?;
        let mut text = String::new();
        file.read_to_string(&mut text)?;
        serde_json::from_str::<Manifest>(&text)?
    };

    let name = payload_name(manifest.encrypted);
    let mut file = archive.by_name(name)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;

    if !manifest.encrypted {
        return Ok(bytes);
    }
    let kdf = manifest
        .kdf
        .ok_or_else(|| ArchiveError::Malformed("encrypted archive has no kdf".to_string()))?;
    let passphrase = passphrase
        .ok_or(ArchiveError::WrongPassphrase)?;
    decrypt_payload(passphrase, &bytes, &kdf)
}

/// Write an archive. `None` is a **plaintext export**, which the UI must gate
/// behind an explicit, warned choice; encryption is the default.
pub fn write_archive<W: Write + Seek>(
    writer: W,
    params: ManifestParams,
    payload: &[u8],
    passphrase: Option<&str>,
) -> Result<W, ArchiveError> {
    match passphrase {
        Some(pass) => {
            let kdf = params.kdf.clone().unwrap_or_else(default_kdf);
            let encrypted = encrypt_payload(pass, payload, &kdf)?;
            let m = manifest(ManifestParams {
                encrypted: true,
                kdf: Some(kdf),
                ..params
            });
            write_container(writer, &m, &encrypted)
        }
        None => {
            let m = manifest(ManifestParams {
                encrypted: false,
                kdf: None,
                ..params
            });
            write_container(writer, &m, payload)
        }
    }
}

// --- Import and merge (S6.3) ---------------------------------------------------
//
// Import merges by id and reports what it added, skipped, or conflicted on. A
// conflict keeps the existing copy: import NEVER silently overwrites.

use std::collections::HashMap;

/// One stored record. `id` is the merge key; `data` is the record body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    pub data: serde_json::Value,
}

/// The payload of an archive: the stored collections.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Bundle {
    pub sessions: Vec<Record>,
    pub utterances: Vec<Record>,
    pub metric_series: Vec<Record>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportReport {
    pub added: usize,
    pub skipped: usize,
    pub conflicted: usize,
    /// ids where the incoming record differed from the existing one
    pub conflicts: Vec<String>,
}

impl ImportReport {
    /// A plain-language report line (phase 6 S4.3).
    pub fn line(&self) -> String {
        format!(
            "Added {} record(s), skipped {} already present, {} conflict(s) kept your existing copy.",
            self.added, self.skipped, self.conflicted
        )
    }
}

pub fn bundle_json(bundle: &Bundle) -> Result<String, ArchiveError> {
    Ok(serde_json::to_string_pretty(bundle)?)
}

fn merge_collection(
    existing: &[Record],
    incoming: &[Record],
    report: &mut ImportReport,
) -> Vec<Record> {
    let mut index: HashMap<String, Record> =
        existing.iter().cloned().map(|r| (r.id.clone(), r)).collect();
    let mut added = Vec::new();

    for record in incoming {
        match index.get(&record.id) {
            None => {
                index.insert(record.id.clone(), record.clone());
                added.push(record.clone());
                report.added += 1;
            }
            Some(current) if current == record => report.skipped += 1,
            Some(_) => {
                // Keep the existing copy; report the conflict.
                report.conflicted += 1;
                report.conflicts.push(record.id.clone());
            }
        }
    }

    let mut merged = existing.to_vec();
    merged.extend(added);
    merged
}

/// Merge `incoming` into `existing`: by id, added / skipped / conflicted.
pub fn merge_bundles(existing: &Bundle, incoming: &Bundle) -> (Bundle, ImportReport) {
    let mut report = ImportReport::default();
    let merged = Bundle {
        sessions: merge_collection(&existing.sessions, &incoming.sessions, &mut report),
        utterances: merge_collection(&existing.utterances, &incoming.utterances, &mut report),
        metric_series: merge_collection(
            &existing.metric_series,
            &incoming.metric_series,
            &mut report,
        ),
    };
    (merged, report)
}

/// Refuse an archive this version cannot read, before touching any payload.
pub fn ensure_supported(manifest: &Manifest) -> Result<(), ArchiveError> {
    if manifest.format != FORMAT {
        return Err(ArchiveError::Malformed(format!(
            "not a {FORMAT} archive (found {:?})",
            manifest.format
        )));
    }
    if manifest.format_version > FORMAT_VERSION {
        return Err(ArchiveError::UnsupportedFormat {
            found: manifest.format_version,
            supported: FORMAT_VERSION,
        });
    }
    Ok(())
}

fn read_entry<R: Read + Seek>(archive: &mut ZipArchive<R>, name: &str) -> Result<Vec<u8>, ArchiveError> {
    let mut file = archive.by_name(name)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Import an archive into `existing`. Refuses a newer format, fails cleanly on a
/// damaged file, and returns the merge report. Never mutates `existing`.
pub fn import_archive<R: Read + Seek>(
    reader: R,
    passphrase: Option<&str>,
    existing: &Bundle,
) -> Result<(Bundle, ImportReport), ArchiveError> {
    let mut archive = ZipArchive::new(reader)?;

    let manifest_bytes = read_entry(&mut archive, MANIFEST_NAME)?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)?;
    ensure_supported(&manifest)?;

    let payload = read_entry(&mut archive, payload_name(manifest.encrypted))?;
    let payload = if manifest.encrypted {
        let kdf = manifest
            .kdf
            .ok_or_else(|| ArchiveError::Malformed("encrypted archive has no kdf".to_string()))?;
        decrypt_payload(passphrase.ok_or(ArchiveError::WrongPassphrase)?, &payload, &kdf)?
    } else {
        payload
    };

    let incoming: Bundle = serde_json::from_slice(&payload)?;
    Ok(merge_bundles(existing, &incoming))
}
