import type { VoiceFrame } from "../model";
import { confidenceBand } from "../model";

export interface QualityMetersProps {
  frame: VoiceFrame;
  /** Which measures to show. Defaults to all voice-quality measures. */
  channels?: QualityChannel[];
}

export type QualityChannel = "hnr" | "cpp" | "tilt" | "h1_h2" | "centroid" | "jitter" | "shimmer";

interface MeterSpec {
  key: QualityChannel;
  label: string;
  units: string;
  read: (frame: VoiceFrame) => number;
  note?: string;
}

const METERS: MeterSpec[] = [
  { key: "hnr", label: "Harmonics-to-noise (HNR)", units: "dB", read: (f) => f.hnr_db ?? Number.NaN },
  { key: "cpp", label: "Cepstral peak prominence (CPP)", units: "dB", read: (f) => f.cpp_db ?? Number.NaN },
  { key: "tilt", label: "Spectral tilt", units: "dB/oct", read: (f) => f.tilt_db_per_oct ?? Number.NaN },
  { key: "h1_h2", label: "Vocal weight (H1–H2)", units: "dB", read: (f) => f.h1_h2_db ?? Number.NaN },
  { key: "centroid", label: "Spectral centroid", units: "Hz", read: (f) => f.centroid_hz ?? Number.NaN },
  {
    key: "jitter",
    label: "Jitter (local)",
    units: "%",
    read: (f) => f.jitter_local ?? Number.NaN,
    note: "confidence follows the pitch estimate",
  },
  {
    key: "shimmer",
    label: "Shimmer (local)",
    units: "%",
    read: (f) => f.shimmer_local ?? Number.NaN,
    note: "confidence follows the pitch estimate",
  },
];

/**
 * A readout of the voice-quality measures for a frame.
 *
 * Each measure carries the frame's confidence band. A measure the core could not
 * compute (NaN) is shown as "not measured here", never as zero — an absent
 * number is information (TDD §4.2).
 */
export function QualityMeters({ frame, channels }: QualityMetersProps) {
  const specs = channels ? METERS.filter((m) => channels.includes(m.key)) : METERS;
  const band = confidenceBand(frame.f0_confidence);
  return (
    <dl className="sonorant-meters" aria-label="Voice-quality measures">
      {specs.map((spec) => {
        const value = spec.read(frame);
        const missing = !Number.isFinite(value);
        return (
          <div className="sonorant-meters__row" key={spec.key}>
            <dt className="sonorant-meters__label">
              {spec.label} <span className="sonorant-meters__units">({spec.units})</span>
            </dt>
            <dd className="sonorant-meters__value">
              {missing ? (
                <span className="sonorant-meters__missing">not measured here</span>
              ) : (
                <>
                  {value.toFixed(3)}{" "}
                  <span className="sonorant-meters__confidence" data-band={band}>
                    confidence: {band}
                  </span>
                  {spec.note ? <span className="sonorant-meters__note"> — {spec.note}</span> : null}
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
