//! S3.2 ABI test: the committed wire-layout manifest (the JS reader's view) must
//! match the core's actual `AnalysisFrame` layout. A mismatch fails CI.

use core::mem::{offset_of, size_of};

use serde_json::Value;
use sonorant_analysis::{AnalysisFrame, CORE_ABI_VERSION};
use sonorant_core::{Formant, MAX_FORMANTS};
use sonorant_ffi::{require_abi, FRAME_WORDS};

fn manifest() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/abi/frame_layout.v1.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn offset_words(manifest: &Value, name: &str) -> usize {
    manifest["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["name"] == name)
        .unwrap_or_else(|| panic!("manifest has no field {name}"))["offset_words"]
        .as_u64()
        .unwrap() as usize
}

#[test]
fn layout_matches_the_manifest() {
    let m = manifest();
    assert_eq!(m["abi_version"].as_u64().unwrap() as u32, CORE_ABI_VERSION);
    assert_eq!(m["frame_words"].as_u64().unwrap() as usize, FRAME_WORDS);
    assert_eq!(size_of::<AnalysisFrame>(), FRAME_WORDS * 4);
    assert_eq!(size_of::<Formant>(), 12);
    assert_eq!(m["fields"].as_array().unwrap().len(), FRAME_WORDS);

    let scalar = [
        ("t_ms", offset_of!(AnalysisFrame, t_ms)),
        ("f0_hz", offset_of!(AnalysisFrame, f0_hz)),
        ("voicing", offset_of!(AnalysisFrame, voicing)),
        ("f0_confidence", offset_of!(AnalysisFrame, f0_confidence)),
        ("hnr_db", offset_of!(AnalysisFrame, hnr_db)),
        ("cpp_db", offset_of!(AnalysisFrame, cpp_db)),
        ("tilt_db_per_oct", offset_of!(AnalysisFrame, tilt_db_per_oct)),
        ("h1_h2_db", offset_of!(AnalysisFrame, h1_h2_db)),
        ("centroid_hz", offset_of!(AnalysisFrame, centroid_hz)),
        ("scale_semitones", offset_of!(AnalysisFrame, scale_semitones)),
        ("rms_dbfs", offset_of!(AnalysisFrame, rms_dbfs)),
        ("spl_db", offset_of!(AnalysisFrame, spl_db)),
        ("jitter_local", offset_of!(AnalysisFrame, jitter_local)),
        ("shimmer_local", offset_of!(AnalysisFrame, shimmer_local)),
        ("flags", offset_of!(AnalysisFrame, flags)),
    ];
    for (name, byte_offset) in scalar {
        assert_eq!(byte_offset % 4, 0, "{name} is not word-aligned");
        assert_eq!(
            offset_words(&m, name),
            byte_offset / 4,
            "manifest disagrees with the core for {name}"
        );
    }

    let formants_base = offset_of!(AnalysisFrame, formants);
    for i in 0..MAX_FORMANTS {
        for (j, field) in ["hz", "bandwidth_hz", "confidence"].iter().enumerate() {
            let name = format!("formants[{i}].{field}");
            let expected = (formants_base + i * size_of::<Formant>() + j * 4) / 4;
            assert_eq!(
                offset_words(&m, &name),
                expected,
                "manifest disagrees with the core for {name}"
            );
        }
    }
}

#[test]
fn abi_mismatch_is_a_hard_failure() {
    assert!(require_abi(CORE_ABI_VERSION).is_ok());
    let error = require_abi(CORE_ABI_VERSION + 1).unwrap_err();
    assert!(error.contains("mismatch"), "unexpected message: {error}");
}
