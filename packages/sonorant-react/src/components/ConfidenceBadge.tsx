import { confidenceBand } from "../model";
import type { ConfidenceBand } from "../model";

export interface ConfidenceBadgeProps {
  value: number;
  /** What the confidence applies to, e.g. "pitch". */
  of?: string;
}

/**
 * A confidence indication rendered as text. Nothing in Sonorant is shown
 * without one (brief principle 3), and the band is always spelled out so it does
 * not depend on colour.
 */
export function ConfidenceBadge({ value, of }: ConfidenceBadgeProps) {
  const band = confidenceBand(value);
  const text = of ? `confidence (${of}): ${band}` : `confidence: ${band}`;
  return (
    <span className="sonorant-badge" data-band={band}>
      {text}
    </span>
  );
}

export type { ConfidenceBand };
