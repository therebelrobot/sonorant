//! `fixture` — produce a regression fixture from a reference recording.
//!
//! The fixture records the expected values and the documented per-measure
//! tolerance bands, and is published with the project so a fork cannot be the only
//! authority on how the numbers are produced (TDD §1, §14). The expected values
//! are a snapshot of the current core; the independent oracle (Praat) is S2.3.

use std::fs;

use sonorant_analysis::{AnalysisFrame, AnalysisParams};
use sonorant_core::{tolerances, CORE_VERSION};

use crate::wav;
use crate::{analyze_pcm, params_for, parse_number};

pub struct Options {
    pub input: String,
    pub out: Option<String>,
    pub description: String,
    pub frame_len: Option<usize>,
    pub hop: Option<usize>,
    pub lpc_order: Option<u16>,
}

pub fn parse(args: &[String]) -> Result<Options, String> {
    let mut input: Option<String> = None;
    let mut out = None;
    let mut description = "reference recording".to_string();
    let mut frame_len = None;
    let mut hop = None;
    let mut lpc_order = None;

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "--out" | "--description" | "--frame-len" | "--hop" | "--lpc-order" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| format!("missing value for {arg}"))?;
                match arg {
                    "--out" => out = Some(value.clone()),
                    "--description" => description = value.clone(),
                    "--frame-len" => frame_len = Some(parse_number(value, arg)?),
                    "--hop" => hop = Some(parse_number(value, arg)?),
                    "--lpc-order" => lpc_order = Some(parse_number(value, arg)?),
                    _ => unreachable!(),
                }
                i += 1;
            }
            other if other.starts_with('-') && other != "-" => {
                return Err(format!("unknown option: {other}"));
            }
            other => {
                if input.is_some() {
                    return Err(format!("unexpected extra argument: {other}"));
                }
                input = Some(other.to_string());
            }
        }
        i += 1;
    }

    let input = input.ok_or_else(|| "missing input file".to_string())?;
    Ok(Options {
        input,
        out,
        description,
        frame_len,
        hop,
        lpc_order,
    })
}

pub fn run(opts: &Options) -> Result<(), String> {
    let (spec, mono) = wav::open_and_read(&opts.input)?;
    let params = params_for(spec.sample_rate, opts.frame_len, opts.hop, opts.lpc_order);
    let frames = analyze_pcm(params, &mono);
    let json = build_fixture(
        &opts.description,
        spec.sample_rate,
        spec.channels,
        params,
        &frames,
    );

    match &opts.out {
        Some(path) => {
            fs::write(path, &json)
                .map_err(|e| format!("sonorant-cli: could not write {path}: {e}"))?;
            eprintln!(
                "sonorant-cli: wrote {path} ({} frame(s), core {})",
                frames.len(),
                CORE_VERSION
            );
        }
        None => print!("{json}"),
    }
    Ok(())
}

fn median(values: &[f32]) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut sorted: Vec<f32> = values.iter().copied().filter(|v| v.is_finite()).collect();
    if sorted.is_empty() {
        return None;
    }
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Some(sorted[sorted.len() / 2])
}

fn num(value: Option<f32>) -> String {
    match value {
        Some(v) if v.is_finite() => format!("{v:.4}"),
        _ => "null".to_string(),
    }
}

/// Minimal JSON string escaping; descriptions are plain text but may contain a
/// quote or backslash.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(c),
        }
    }
    out
}

fn build_fixture(
    description: &str,
    sample_rate: u32,
    channels: u16,
    params: AnalysisParams,
    frames: &[AnalysisFrame],
) -> String {
    let voiced: Vec<f32> = frames
        .iter()
        .filter(|f| f.f0_hz > 0.0)
        .map(|f| f.f0_hz)
        .collect();
    let f0 = median(&voiced);

    let formants: Vec<Option<f32>> = (0..3)
        .map(|i| {
            median(
                &frames
                    .iter()
                    .filter(|f| f.formants[i].hz > 0.0)
                    .map(|f| f.formants[i].hz)
                    .collect::<Vec<f32>>(),
            )
        })
        .collect();

    let hnr = median(&frames.iter().map(|f| f.hnr_db).collect::<Vec<f32>>());
    let rms = median(&frames.iter().map(|f| f.rms_dbfs).collect::<Vec<f32>>());
    let jitter = median(&frames.iter().map(|f| f.jitter_local).collect::<Vec<f32>>());
    let shimmer = median(&frames.iter().map(|f| f.shimmer_local).collect::<Vec<f32>>());

    let mut s = String::new();
    s.push_str("{\n");
    s.push_str("  \"fixture_format\": 1,\n");
    s.push_str(&format!(
        "  \"generator\": \"sonorant-cli {}\",\n",
        env!("CARGO_PKG_VERSION")
    ));
    s.push_str(&format!("  \"core_version\": \"{CORE_VERSION}\",\n"));
    s.push_str(&format!(
        "  \"description\": \"{}\",\n",
        escape(description)
    ));
    s.push_str("  \"input\": {\n");
    s.push_str(&format!("    \"sample_rate\": {sample_rate},\n"));
    s.push_str(&format!("    \"channels\": {channels},\n"));
    s.push_str(&format!("    \"frame_len\": {},\n", params.frame_len));
    s.push_str(&format!("    \"hop\": {},\n", params.hop));
    s.push_str(&format!("    \"lpc_order\": {},\n", params.lpc_order));
    s.push_str(&format!("    \"frames\": {}\n", frames.len()));
    s.push_str("  },\n");
    s.push_str("  \"tolerances\": {\n");
    s.push_str(&format!("    \"f0_rel\": {},\n", tolerances::F0_REL));
    s.push_str(&format!(
        "    \"formant_rel\": {},\n",
        tolerances::FORMANT_REL
    ));
    s.push_str(&format!(
        "    \"perturbation_abs\": {}\n",
        tolerances::PERTURBATION_ABS
    ));
    s.push_str("  },\n");
    s.push_str("  \"expected\": {\n");
    s.push_str(&format!("    \"f0_hz\": {},\n", num(f0)));
    s.push_str(&format!(
        "    \"formants_hz\": [{}, {}, {}],\n",
        num(formants[0]),
        num(formants[1]),
        num(formants[2])
    ));
    s.push_str(&format!("    \"hnr_db\": {},\n", num(hnr)));
    s.push_str(&format!("    \"rms_dbfs\": {},\n", num(rms)));
    s.push_str(&format!("    \"jitter_local\": {},\n", num(jitter)));
    s.push_str(&format!("    \"shimmer_local\": {}\n", num(shimmer)));
    s.push_str("  }\n}\n");
    s
}
