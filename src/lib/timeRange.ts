export type TimeRange = "1h" | "4h" | "1d" | "1w" | "1m";

export const timeRangeMs: Record<TimeRange, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1m": 2_592_000_000,
};

export const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--foreground)",
};
