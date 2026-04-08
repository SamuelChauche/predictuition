import { useMemo, useState } from "react";
import type { TimeRange } from "@/lib/timeRange";
import { timeRangeMs } from "@/lib/timeRange";
import { useSharePriceHistory } from "./useAtoms";

export interface ChartPoint {
  date: string;
  price: number;
}

export function useFilteredChartData(termId: string | undefined) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1m");

  const since = Date.now() - timeRangeMs[timeRange];
  const priceHistory = useSharePriceHistory(termId, since);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!priceHistory.data) return [];
    return priceHistory.data.map((p) => ({
      date: new Date(Number(p.block_timestamp) * 1000).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      price: Number(p.share_price) / 1e18,
    }));
  }, [priceHistory.data]);

  return { chartData, timeRange, setTimeRange };
}
