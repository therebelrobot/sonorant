import { activeFlags } from "../model";

export interface FlagListProps {
  flags: number;
  /** Copy shown when no flag is active. */
  emptyText?: string;
}

/**
 * Input-integrity flags as text, never colour alone. A flag is a note about the
 * input, not a judgement about the voice (brief principle 6).
 */
export function FlagList({ flags, emptyText = "none" }: FlagListProps) {
  const labels = activeFlags(flags);
  if (labels.length === 0) {
    return <p className="sonorant-flags">Input notes: {emptyText}.</p>;
  }
  return (
    <p className="sonorant-flags">
      Input notes: {labels.join(", ")}.
    </p>
  );
}
