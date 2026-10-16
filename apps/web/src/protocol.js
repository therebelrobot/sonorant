// Message shapes shared by the analysis Worker and the main thread (TDD §6.1).
// The worklet uses the same `PCM` string; it is kept import-free on purpose.

export const PCM = "sonorant/pcm";
export const FRAMES = "sonorant/frames";
export const READY = "sonorant/ready";
export const ERROR = "sonorant/error";
