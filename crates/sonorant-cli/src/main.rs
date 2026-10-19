//! sonorant-cli — native batch analyser and fixture generator (TDD §3, §17).

mod analyse;
mod fixture;
mod synth;
mod wav;

use std::env;
use std::process::ExitCode;

use sonorant_analysis::{AnalysisFrame, AnalysisParams, Analyzer, FrameAnalyzer, SessionAnalyzer};

pub(crate) const EXIT_OK: u8 = 0;
pub(crate) const EXIT_INPUT: u8 = 1;
pub(crate) const EXIT_USAGE: u8 = 2;

const USAGE: &str = "\
sonorant-cli — batch voice analysis

USAGE:
    sonorant-cli <INPUT.wav> [OPTIONS]           analyse a WAV; CSV to stdout
    sonorant-cli analyse <INPUT.wav> [OPTIONS]
    sonorant-cli fixture <INPUT.wav> [OPTIONS]   write a regression fixture (JSON)
    sonorant-cli synth [OPTIONS]                 write a synthetic reference WAV

ANALYSIS OPTIONS (analyse, fixture):
    --frame-len <N>     analysis frame length in samples (default 2048)
    --hop <N>           hop between frames in samples (default 512)
    --lpc-order <N>     LPC order (default clamp(2 + sample_rate/1000, 18, 24))

analyse OPTIONS:
    --limit <N>         stop after N frames
    --session           apply the session baseline (scale_semitones), as the app does
    --quiet             do not print the summary to stderr

fixture OPTIONS:
    --out <FILE>        write the fixture here (default: stdout)
    --description <T>   plain-language description of the reference recording

synth OPTIONS:
    --f0 <HZ>           fundamental (default 150)
    --duration <S>      seconds (default 0.3)
    --sample-rate <HZ>  (default 44100)
    --formant-scale <X> scale the preset vowel's formants (default 1.0)
    --out <FILE>        output path (default sonorant-reference.wav)

    -h, --help          print this help
    -V, --version       print the version

EXIT CODES:
    0  success
    1  input error (missing or unsupported file, or a read failure)
    2  usage error
";

enum Command {
    Analyse(analyse::Options),
    Fixture(fixture::Options),
    Synth(synth::Options),
    Help,
    Version,
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let command = match parse(&args) {
        Ok(command) => command,
        Err(message) => {
            eprintln!("sonorant-cli: {message}\n\n{USAGE}");
            return ExitCode::from(EXIT_USAGE);
        }
    };
    let result = match command {
        Command::Help => {
            println!("{USAGE}");
            return ExitCode::from(EXIT_OK);
        }
        Command::Version => {
            println!("sonorant-cli {}", env!("CARGO_PKG_VERSION"));
            return ExitCode::from(EXIT_OK);
        }
        Command::Analyse(o) => analyse::run(&o),
        Command::Fixture(o) => fixture::run(&o),
        Command::Synth(o) => synth::run(&o),
    };
    match result {
        Ok(()) => ExitCode::from(EXIT_OK),
        Err(message) => {
            eprintln!("{message}");
            ExitCode::from(EXIT_INPUT)
        }
    }
}

fn parse(args: &[String]) -> Result<Command, String> {
    match args.first().map(String::as_str) {
        None => Err("missing command or input file".to_string()),
        Some("-h") | Some("--help") => Ok(Command::Help),
        Some("-V") | Some("--version") => Ok(Command::Version),
        Some("synth") => synth::parse(&args[1..]).map(Command::Synth),
        Some("fixture") => fixture::parse(&args[1..]).map(Command::Fixture),
        Some("analyse") => analyse::parse(&args[1..]).map(Command::Analyse),
        Some(_) => analyse::parse(args).map(Command::Analyse),
    }
}

/// The effective params for a run, given optional CLI overrides.
pub(crate) fn params_for(
    sample_rate: u32,
    frame_len: Option<usize>,
    hop: Option<usize>,
    lpc_order: Option<u16>,
) -> AnalysisParams {
    let mut params = AnalysisParams::new(sample_rate);
    if let Some(v) = frame_len {
        params.frame_len = v;
    }
    if let Some(v) = hop {
        params.hop = v;
    }
    if let Some(v) = lpc_order {
        params.lpc_order = v;
    }
    params
}

/// Analyse mono PCM through the `Analyzer` contract.
pub(crate) fn analyze_pcm(params: AnalysisParams, mono: &[f32]) -> Vec<AnalysisFrame> {
    let mut analyzer = FrameAnalyzer::new(params.sample_rate);
    analyzer.configure(params);
    analyzer.push(mono);
    let mut frames = Vec::new();
    let mut chunk = vec![AnalysisFrame::default(); 512];
    loop {
        let n = analyzer.drain(&mut chunk);
        if n == 0 {
            break;
        }
        frames.extend_from_slice(&chunk[..n]);
    }
    frames
}

/// Analyse mono PCM through the `SessionAnalyzer`, so the session baseline is
/// applied and `scale_semitones` is a log-ratio against the session's first
/// voiced frames (TDD §4.1). The plain `analyze_pcm` leaves it at 0.
pub(crate) fn analyze_pcm_session(params: AnalysisParams, mono: &[f32]) -> Vec<AnalysisFrame> {
    let mut analyzer = SessionAnalyzer::new(params.sample_rate);
    analyzer.configure(params);
    analyzer.start_session();
    analyzer.push(mono);
    let mut frames = Vec::new();
    let mut chunk = vec![AnalysisFrame::default(); 512];
    loop {
        let n = analyzer.drain(&mut chunk);
        if n == 0 {
            break;
        }
        frames.extend_from_slice(&chunk[..n]);
    }
    frames
}

pub(crate) fn parse_number<T: std::str::FromStr>(value: &str, flag: &str) -> Result<T, String> {
    value
        .parse::<T>()
        .map_err(|_| format!("{flag} expects a number, got \"{value}\""))
}

pub(crate) fn input_error(path: &str, cause: &str) -> String {
    format!(
        "sonorant-cli: could not read input file: {path}\n  cause: {cause}\n  next:  check the path and that the file is a readable WAV, then try again."
    )
}

pub(crate) fn unsupported(cause: &str) -> String {
    format!(
        "sonorant-cli: this file format is not supported.\n  cause: {cause}\n  next:  supply a WAV file (16/24/32-bit PCM or 32-bit float)."
    )
}

pub(crate) fn fmt(value: f32) -> String {
    if value.is_nan() {
        "NaN".to_string()
    } else {
        format!("{value:.4}")
    }
}
