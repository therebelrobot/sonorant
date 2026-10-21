// sonorant-react — reusable React visualizations for Sonorant voice analysis.
//
// These components render the frame objects the Rust core produces (via the
// `sonorant` npm package). They contain no acoustic maths: they map, classify and
// draw values the core already measured, and every component renders an
// accessible text alternative beside its chart.
//
// Import the default stylesheet once (`sonorant-react/styles.css`) or bring your
// own — every component renders plain markup with stable class names.

export * from "./model";
export * from "./smoothing";

export { VoicePad } from "./components/VoicePad";
export type { VoicePadProps } from "./components/VoicePad";

export { TrendChart } from "./components/TrendChart";
export type { TrendChartProps } from "./components/TrendChart";

export { FrameSummary } from "./components/FrameSummary";
export type { FrameSummaryProps } from "./components/FrameSummary";

export { QualityMeters } from "./components/QualityMeters";
export type { QualityMetersProps, QualityChannel } from "./components/QualityMeters";

export { FlagList } from "./components/FlagList";
export type { FlagListProps } from "./components/FlagList";

export { ConfidenceBadge } from "./components/ConfidenceBadge";
export type { ConfidenceBadgeProps } from "./components/ConfidenceBadge";
