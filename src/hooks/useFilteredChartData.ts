import { useMemo, useState } from "react";
import type { TimeRange } from "@/lib/timeRange";
import { timeRangeMs } from "@/lib/timeRange";
import { useSharePriceChart } from "./useAtoms";

export interface ChartPoint {
  date: string;
  price: number;
}

const intervalMap: Record<TimeRange, string> = {
  "1h": "5m",
  "4h": "15m",
  "1d": "1h",
  "1w": "6h",
  "1m": "1d",
};

function formatDate(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  const hour = d.getUTCHours();
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;

  switch (range) {
    case "1h":
    case "4h":
      return `${h12}:${String(d.getUTCMinutes()).padStart(2, "0")}${ampm}`;
    case "1d":
      return `${h12}${ampm}`;
    case "1w":
      return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${h12}${ampm}`;
    case "1m":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
}

export function useFilteredChartData(termId: string | undefined) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1m");

  const since = Date.now() - timeRangeMs[timeRange];
  const interval = intervalMap[timeRange];
  const chartQuery = useSharePriceChart(termId, since, interval);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!chartQuery.data) return [];
    return chartQuery.data.map((p) => ({
      date: formatDate(p.timestamp, timeRange),
      price: Number(p.value) / 1e18,
    }));
  }, [chartQuery.data, timeRange]);

  return { chartData, timeRange, setTimeRange };
}
