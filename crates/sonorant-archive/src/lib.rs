//! sonorant-archive — history export/import container (TDD §8).
//!
//! A ZIP with a plaintext, self-describing `manifest.json` and a payload entry.
//! The manifest is deliberately readable without a passphrase: a user can tell
//! what a file is before opening it. Encryption (S6.2) changes only the payload
//! entry and fills in `kdf`; the manifest stays plaintext.

use std::io::{Read, Seek, Write};

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
