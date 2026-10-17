//! `analyse` — drive a WAV through the `Analyzer` and write CSV to stdout.

use std::io::{self, BufWriter, Write};

use sonorant_analysis::{flags, AnalysisFrame};

use crate::wav;
use crate::{parse_number, params_for};

/// Output column order, kept in lockstep with [`write_row`].
const HEADER: &str = "t_ms,f0_hz,voicing,f0_confidence,\
f1_hz,f1_bw,f1_conf,f2_hz,f2_bw,f2_conf,f3_hz,f3_bw,f3_conf,f4_hz,f4_bw,f4_conf,f5_hz,f5_bw,f5_conf,\
hnr_db,cpp_db,tilt_db_per_oct,h1_h2_db,centroid_hz,scale_semitones,rms_dbfs,spl_db,jitter_local,shimmer_local,flags";

pub struct Options {
    pub input: String,
    pub frame_len: Option<usize>,
    pub hop: Option<usize>,
    pub lpc_order: Option<u16>,
    pub limit: Option<usize>,
    pub quiet: bool,
    /// Apply the session baseline, so `scale_semitones` is meaningful.
    pub session: bool,
}

pub fn parse(args: &[String]) -> Result<Options, String> {
    let mut input: Option<String> = None;
    let mut frame_len = None;
    let mut hop = None;
    let mut lpc_order = None;
    let mut limit = None;
    let mut quiet = false;
    let mut session = false;

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "--quiet" => quiet = true,
            "--session" => session = true,
            "--frame-len" | "--hop" | "--lpc-order" | "--limit" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| format!("missing value for {arg}"))?;
                let n: usize = parse_number(value, arg)?;
                match arg {
                    "--frame-len" => frame_len = Some(n),
                    "--hop" => hop = Some(n),
                    "--lpc-order" => lpc_order = Some(n as u16),
                    "--limit" => limit = Some(n),
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
        frame_len,
        hop,
        lpc_order,
        limit,
        quiet,
        session,
    })
}

pub fn run(opts: &Options) -> Result<(), String> {
    let (spec, mono) = wav::open_and_read(&opts.input)?;
    let params = params_for(spec.sample_rate, opts.frame_len, opts.hop, opts.lpc_order);
    let mut frames = if opts.session {
        crate::analyze_pcm_session(params, &mono)
    } else {
        crate::analyze_pcm(params, &mono)
    };
    if let Some(limit) = opts.limit {
        frames.truncate(limit);
    }

    let stdout = io::stdout();
    let mut out = BufWriter::new(stdout.lock());
    writeln!(out, "{HEADER}").map_err(|e| output_error(&e.to_string()))?;
    for frame in &frames {
        write_row(&mut out, frame).map_err(|e| output_error(&e.to_string()))?;
    }
    out.flush().map_err(|e| output_error(&e.to_string()))?;

    if !opts.quiet {
        let duration = mono.len() as f32 / spec.sample_rate.max(1) as f32;
        eprintln!(
            "sonorant-cli: {} — {} Hz, {} channel(s), {:.2} s, {} frame(s)",
            opts.input,
            spec.sample_rate,
            spec.channels,
            duration,
            frames.len()
        );
        if frames
            .iter()
            .any(|f| (f.flags as i64) & (flags::UNCALIBRATED as i64) != 0)
        {
            eprintln!(
                "sonorant-cli: uncalibrated — spl_db is NaN; calibrate in the app to show SPL"
            );
        }
    }
    Ok(())
}

fn output_error(cause: &str) -> String {
    format!("sonorant-cli: could not write output: {cause}")
}

fn write_row<W: Write>(w: &mut W, f: &AnalysisFrame) -> io::Result<()> {
    let mut cols: Vec<String> = Vec::with_capacity(30);
    cols.push(format!("{}", f.t_ms));
    cols.push(crate::fmt(f.f0_hz));
    cols.push(crate::fmt(f.voicing));
    cols.push(crate::fmt(f.f0_confidence));
    for formant in &f.formants {
        cols.push(crate::fmt(formant.hz));
        cols.push(crate::fmt(formant.bandwidth_hz));
        cols.push(crate::fmt(formant.confidence));
    }
    cols.push(crate::fmt(f.hnr_db));
    cols.push(crate::fmt(f.cpp_db));
    cols.push(crate::fmt(f.tilt_db_per_oct));
    cols.push(crate::fmt(f.h1_h2_db));
    cols.push(crate::fmt(f.centroid_hz));
    cols.push(crate::fmt(f.scale_semitones));
    cols.push(crate::fmt(f.rms_dbfs));
    cols.push(crate::fmt(f.spl_db));
    cols.push(crate::fmt(f.jitter_local));
    cols.push(crate::fmt(f.shimmer_local));
    cols.push(crate::fmt(f.flags));
    writeln!(w, "{}", cols.join(","))
}
