import type { VoiceFrame } from "../model";
import { summarize } from "../model";

export interface FrameSummaryProps {
  frame: VoiceFrame;
  /** Whether a calibration is attached (SPL is honestly blank until then). */
  calibrated?: boolean;
  heading?: string;
}

/**
 * The accessible, confidence-bearing summary of a frame: the written equivalent
 * of the pad. Every line states its confidence, and a value that is not reliably
 * measured is shown as an explanation, not as a number.
 */
export function FrameSummary({ frame, calibrated = false, heading }: FrameSummaryProps) {
  const summary = summarize(frame, { calibrated });
  return (
    <section className="sonorant-summary" aria-label={heading ?? summary.heading}>
      <h3 className="sonorant-summary__heading">{heading ?? summary.heading}</h3>
      {summary.caveat && (
        <p className="sonorant-summary__caveat" role="status">
          {summary.caveat}
        </p>
      )}
      <ul className="sonorant-summary__lines">
        {summary.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
