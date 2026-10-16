//! sonorant-cli — native batch analyser (TDD §3, §17).
//!
//! The project's first artifact: read a WAV, drive it through the `Analyzer`
//! contract, and write one CSV row per `AnalysisFrame` to stdout. No browser and
//! no capture layer — a fast, debuggable loop on real recordings.

use std::env;
use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::process::ExitCode;

use sonorant_core::{flags, AnalysisFrame, AnalysisParams, Analyzer, FrameAnalyzer};

const EXIT_OK: u8 = 0;
const EXIT_INPUT: u8 = 1;
const EXIT_USAGE: u8 = 2;

const USAGE: &str = "\
sonorant-cli — batch voice analysis

USAGE:
    sonorant-cli [OPTIONS] <INPUT.wav>

OPTIONS:
    --frame-len <N>     analysis frame length in samples (default 2048)
    --hop <N>           hop between frames in samples (default 512)
    --lpc-order <N>     LPC order (default clamp(2 + sample_rate/1000, 18, 24))
    --limit <N>         stop after N frames
    --quiet             do not print the summary to stderr
    -h, --help          print this help
    -V, --version       print the version

OUTPUT:
    CSV to stdout: one header row, then one row per analysis frame. Measurements
    are in the analysis core's units (Hz, dB, semitones, milliseconds). Unmeasured
    values are printed as NaN.

EXIT CODES:
    0  success
    1  input error (missing or unsupported file, or a read failure)
    2  usage error
";

/// Output column order, kept in lockstep with [`write_row`].
const HEADER: &str = "t_ms,f0_hz,voicing,f0_confidence,\
f1_hz,f1_bw,f1_conf,f2_hz,f2_bw,f2_conf,f3_hz,f3_bw,f3_conf,f4_hz,f4_bw,f4_conf,f5_hz,f5_bw,f5_conf,\
hnr_db,cpp_db,tilt_db_per_oct,h1_h2_db,centroid_hz,scale_semitones,rms_dbfs,spl_db,jitter_local,shimmer_local,flags";

struct Options {
    input: String,
    frame_len: Option<usize>,
    hop: Option<usize>,
    lpc_order: Option<u16>,
    limit: Option<usize>,
    quiet: bool,
}

enum Parsed {
    Run(Options),
    Help,
    Version,
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match parse(&args) {
        Ok(Parsed::Help) => {
            println!("{USAGE}");
            ExitCode::from(EXIT_OK)
        }
        Ok(Parsed::Version) => {
            println!("sonorant-cli {}", env!("CARGO_PKG_VERSION"));
            ExitCode::from(EXIT_OK)
        }
        Ok(Parsed::Run(opts)) => match run(&opts) {
            Ok(()) => ExitCode::from(EXIT_OK),
            Err(message) => {
                eprintln!("{message}");
                ExitCode::from(EXIT_INPUT)
            }
        },
        Err(message) => {
            eprintln!("sonorant-cli: {message}\n\n{USAGE}");
            ExitCode::from(EXIT_USAGE)
        }
    }
}

fn parse(args: &[String]) -> Result<Parsed, String> {
    let mut input: Option<String> = None;
    let mut frame_len = None;
    let mut hop = None;
    let mut lpc_order = None;
    let mut limit = None;
    let mut quiet = false;

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "-h" | "--help" => return Ok(Parsed::Help),
            "-V" | "--version" => return Ok(Parsed::Version),
            "--quiet" => quiet = true,
            "--frame-len" | "--hop" | "--lpc-order" | "--limit" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| format!("missing value for {arg}"))?;
                let n: u32 = value
                    .parse()
                    .map_err(|_| format!("{arg} expects a number, got \"{value}\""))?;
                match arg {
                    "--frame-len" => frame_len = Some(n as usize),
                    "--hop" => hop = Some(n as usize),
                    "--lpc-order" => lpc_order = Some(n as u16),
                    "--limit" => limit = Some(n as usize),
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
    Ok(Parsed::Run(Options {
        input,
        frame_len,
        hop,
        lpc_order,
        limit,
        quiet,
    }))
}

fn run(opts: &Options) -> Result<(), String> {
    let path = &opts.input;
    let file = File::open(path).map_err(|e| input_error(path, &e.to_string()))?;
    let mut reader = hound::WavReader::new(file).map_err(|e| unsupported(&e.to_string()))?;
    let spec = reader.spec();

    let mono = read_mono(&mut reader, &spec, path)?;

    let mut params = AnalysisParams::new(spec.sample_rate);
    if let Some(v) = opts.frame_len {
        params.frame_len = v;
    }
    if let Some(v) = opts.hop {
        params.hop = v;
    }
    if let Some(v) = opts.lpc_order {
        params.lpc_order = v;
    }

    let mut analyzer = FrameAnalyzer::new(spec.sample_rate);
    analyzer.configure(params);
    analyzer.push(&mono);

    let mut frames: Vec<AnalysisFrame> = Vec::new();
    let mut chunk = vec![AnalysisFrame::default(); 512];
    loop {
        let n = analyzer.drain(&mut chunk);
        if n == 0 {
            break;
        }
        frames.extend_from_slice(&chunk[..n]);
    }
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
            "sonorant-cli: {path} — {} Hz, {} channel(s), {:.2} s, {} frame(s)",
            spec.sample_rate,
            spec.channels,
            duration,
            frames.len()
        );
        if frames.iter().any(|f| (f.flags as i64) & (flags::UNCALIBRATED as i64) != 0) {
            eprintln!(
                "sonorant-cli: uncalibrated — spl_db is NaN; calibrate in the app to show SPL"
            );
        }
    }
    Ok(())
}

/// Read the file to mono `f32` in `[-1, 1]`, taking channel 0 when multi-channel.
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

fn input_error(path: &str, cause: &str) -> String {
    format!(
        "sonorant-cli: could not read input file: {path}\n  cause: {cause}\n  next:  check the path and that the file is a readable WAV, then try again."
    )
}

fn unsupported(cause: &str) -> String {
    format!(
        "sonorant-cli: this file format is not supported.\n  cause: {cause}\n  next:  supply a WAV file (16/24/32-bit PCM or 32-bit float)."
    )
}

fn output_error(cause: &str) -> String {
    format!("sonorant-cli: could not write output: {cause}")
}

fn fmt(value: f32) -> String {
    if value.is_nan() {
        "NaN".to_string()
    } else {
        format!("{value:.4}")
    }
}

fn write_row<W: Write>(w: &mut W, f: &AnalysisFrame) -> io::Result<()> {
    let mut cols: Vec<String> = Vec::with_capacity(30);
    cols.push(format!("{}", f.t_ms));
    cols.push(fmt(f.f0_hz));
    cols.push(fmt(f.voicing));
    cols.push(fmt(f.f0_confidence));
    for formant in &f.formants {
        cols.push(fmt(formant.hz));
        cols.push(fmt(formant.bandwidth_hz));
        cols.push(fmt(formant.confidence));
    }
    cols.push(fmt(f.hnr_db));
    cols.push(fmt(f.cpp_db));
    cols.push(fmt(f.tilt_db_per_oct));
    cols.push(fmt(f.h1_h2_db));
    cols.push(fmt(f.centroid_hz));
    cols.push(fmt(f.scale_semitones));
    cols.push(fmt(f.rms_dbfs));
    cols.push(fmt(f.spl_db));
    cols.push(fmt(f.jitter_local));
    cols.push(fmt(f.shimmer_local));
    cols.push(fmt(f.flags));
    writeln!(w, "{}", cols.join(","))
}
