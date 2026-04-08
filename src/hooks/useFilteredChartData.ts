import { useMemo, useState } from "react";
import type { TimeRange } from "@/lib/timeRange";
import { timeRangeMs } from "@/lib/timeRange";
import type { SharePricePoint } from "./useAtoms";

export interface ChartPoint {
  date: string;
  price: number;
}

export function useFilteredChartData(data: SharePricePoint[] | undefined) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1m");

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    const now = Date.now();
    const cutoff = now - timeRangeMs[timeRange];
    const filtered = data.filter(
      (p) => Number(p.block_timestamp) * 1000 >= cutoff
    );
    return filtered.map((p) => ({
      date: new Date(Number(p.block_timestamp) * 1000).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      price: Number(p.share_price) / 1e18,
    }));
  }, [data, timeRange]);

  return { chartData, timeRange, setTimeRange };
}
