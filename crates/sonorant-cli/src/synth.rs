//! `synth` — write a synthetic reference WAV from the in-repo signal generator.
//!
//! The reference is deterministic and reproducible from its recipe, so a fixture
//! built on it is reproducible without shipping a binary recording (TDD §14).

use std::path::Path;

use sonorant_core::synthetic;

use crate::wav;

/// The reference vowel used by the committed fixtures (S1.4).
pub const PRESET_VOWEL: [(f32, f32); 3] = [(700.0, 80.0), (1220.0, 90.0), (2600.0, 120.0)];
/// Default output path when `--out` is omitted.
pub const DEFAULT_OUT: &str = "sonorant-reference.wav";

/// The preset vowel with its formant centre frequencies scaled by `scale`
/// (bandwidths unchanged). `1.0` is the preset exactly. A scale < 1 models a
/// longer vocal tract (more resonance); > 1 a shorter one (less resonance).
pub fn scaled_vowel(scale: f32) -> [(f32, f32); 3] {
    PRESET_VOWEL.map(|(hz, bw)| (hz * scale, bw))
}

pub struct Options {
    pub out: String,
    pub f0: f32,
    pub duration: f32,
    pub sample_rate: u32,
    pub formant_scale: f32,
}

pub fn parse(args: &[String]) -> Result<Options, String> {
    let mut out = DEFAULT_OUT.to_string();
    let mut f0 = 150.0f32;
    let mut duration = 0.3f32;
    let mut sample_rate = 44_100u32;
    let mut formant_scale = 1.0f32;

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "--out" | "--f0" | "--duration" | "--sample-rate" | "--formant-scale" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| format!("missing value for {arg}"))?;
                match arg {
                    "--out" => out = value.clone(),
                    "--f0" => f0 = crate::parse_number(value, arg)?,
                    "--duration" => duration = crate::parse_number(value, arg)?,
                    "--sample-rate" => sample_rate = crate::parse_number(value, arg)?,
                    "--formant-scale" => formant_scale = crate::parse_number(value, arg)?,
                    _ => unreachable!(),
                }
                i += 1;
            }
            other if other.starts_with('-') => return Err(format!("unknown option: {other}")),
            other => return Err(format!("unexpected argument: {other}")),
        }
        i += 1;
    }

    Ok(Options {
        out,
        f0,
        duration,
        sample_rate,
        formant_scale,
    })
}

pub fn run(opts: &Options) -> Result<(), String> {
    let formants = scaled_vowel(opts.formant_scale);
    let pcm = synthetic::vowel(opts.f0, &formants, opts.sample_rate as f32, opts.duration);
    if pcm.is_empty() {
        return Err(
            "sonorant-cli: the requested signal is empty; check --f0 and --duration.".to_string(),
        );
    }
    wav::write_mono_f32(Path::new(&opts.out), opts.sample_rate, &pcm)?;
    eprintln!(
        "sonorant-cli: wrote {} ({} samples, {} Hz, f0 {:.1} Hz)",
        opts.out,
        pcm.len(),
        opts.sample_rate,
        opts.f0
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{scaled_vowel, PRESET_VOWEL};

    #[test]
    fn scale_one_is_the_preset_exactly() {
        assert_eq!(scaled_vowel(1.0), PRESET_VOWEL);
    }

    #[test]
    fn scale_moves_the_formants_and_keeps_the_bandwidths() {
        let scaled = scaled_vowel(1.2);
        for (i, (hz, bw)) in scaled.iter().enumerate() {
            let (preset_hz, preset_bw) = PRESET_VOWEL[i];
            assert!((hz - preset_hz * 1.2).abs() < 1e-3);
            assert_eq!(*bw, preset_bw);
        }
    }
}
