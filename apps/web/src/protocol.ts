// Message shapes shared by the analysis Worker and the main thread (TDD §6.1).
// The worklet uses the same `PCM` string; it is kept import-free on purpose.

export const PCM = "sonorant/pcm";
export const FRAMES = "sonorant/frames";
export const READY = "sonorant/ready";
export const ERROR = "sonorant/error";
export const RECORD_START = "sonorant/record-start";
export const RECORD_STOP = "sonorant/record-stop";
export const RECORDING = "sonorant/recording";
export const VERSIONS = "sonorant/versions";
export const ARCHIVE_DESCRIBE = "sonorant/archive-describe";
export const ARCHIVE_EXPORT = "sonorant/archive-export";
export const ARCHIVE_IMPORT = "sonorant/archive-import";
export const ARCHIVE_RESULT = "sonorant/archive-result";
export const ARCHIVE_ERROR = "sonorant/archive-error";
