//! WAV read/write helpers.

use std::fs::File;
use std::path::Path;

use crate::{input_error, unsupported};

/// Open a WAV and read it to mono `f32` in `[-1, 1]` (channel 0 if multi-channel).
pub fn open_and_read(path: &str) -> Result<(hound::WavSpec, Vec<f32>), String> {
    let file = File::open(path).map_err(|e| input_error(path, &e.to_string()))?;
    let mut reader = hound::WavReader::new(file).map_err(|e| unsupported(&e.to_string()))?;
    let spec = reader.spec();
    let mono = read_mono(&mut reader, &spec, path)?;
    Ok((spec, mono))
}

fn read_mono(
    reader: &mut hound::WavReader<File>,
    spec: &hound::WavSpec,
    path: &str,
) -> Result<Vec<f32>, String> {
    let channels = spec.channels as usize;
    let mut interleaved: Vec<f32> = Vec::new();
    match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Float, 32) => {
            for sample in reader.samples::<f32>() {
                interleaved.push(sample.map_err(|e| input_error(path, &e.to_string()))?);
            }
        }
        (hound::SampleFormat::Int, bits @ (16 | 24 | 32)) => {
            let scale = (1i64 << (bits - 1)) as f32;
            for sample in reader.samples::<i32>() {
                let value = sample.map_err(|e| input_error(path, &e.to_string()))?;
                interleaved.push(value as f32 / scale);
            }
        }
        _ => {
            return Err(unsupported(&format!(
                "unsupported sample format: {:?} {}-bit",
                spec.sample_format, spec.bits_per_sample
            )));
        }
    }
    Ok(if channels <= 1 {
        interleaved
    } else {
        interleaved.iter().step_by(channels).copied().collect()
    })
}

/// Write 32-bit float mono PCM to a WAV.
pub fn write_mono_f32(path: &Path, sample_rate: u32, pcm: &[f32]) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let write_error =
        |e: hound::Error| format!("sonorant-cli: could not write {}: {e}", path.display());
    let mut writer = hound::WavWriter::create(path, spec).map_err(write_error)?;
    for &sample in pcm {
        writer.write_sample(sample).map_err(write_error)?;
    }
    writer.finalize().map_err(write_error)?;
    Ok(())
}
