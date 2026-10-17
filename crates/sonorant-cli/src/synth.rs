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

pub struct Options {
    pub out: String,
    pub f0: f32,
    pub duration: f32,
    pub sample_rate: u32,
}

pub fn parse(args: &[String]) -> Result<Options, String> {
    let mut out = DEFAULT_OUT.to_string();
    let mut f0 = 150.0f32;
    let mut duration = 0.3f32;
    let mut sample_rate = 44_100u32;

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "--out" | "--f0" | "--duration" | "--sample-rate" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| format!("missing value for {arg}"))?;
                match arg {
                    "--out" => out = value.clone(),
                    "--f0" => f0 = crate::parse_number(value, arg)?,
                    "--duration" => duration = crate::parse_number(value, arg)?,
                    "--sample-rate" => sample_rate = crate::parse_number(value, arg)?,
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
    })
}

pub fn run(opts: &Options) -> Result<(), String> {
    let pcm = synthetic::vowel(
        opts.f0,
        &PRESET_VOWEL,
        opts.sample_rate as f32,
        opts.duration,
    );
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
