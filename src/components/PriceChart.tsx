import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { TimeRange } from "@/lib/timeRange";
import { tooltipStyle } from "@/lib/timeRange";
import type { ChartPoint } from "@/hooks/useFilteredChartData";
import type { SharePricePoint } from "@/hooks/useAtoms";

interface PriceChartProps {
  rawData: SharePricePoint[] | undefined;
  chartData: ChartPoint[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function PriceChart({
  rawData,
  chartData,
  timeRange,
  onTimeRangeChange,
}: PriceChartProps) {
  if (!rawData || rawData.length <= 1) return null;

  return (
    <div className="space-y-4">
      <Tabs
        value={timeRange}
        onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
      >
        <TabsList>
          <TabsTrigger value="1h">1H</TabsTrigger>
          <TabsTrigger value="4h">4H</TabsTrigger>
          <TabsTrigger value="1d">1D</TabsTrigger>
          <TabsTrigger value="1w">1W</TabsTrigger>
          <TabsTrigger value="1m">1M</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-5 h-5 text-olive" />
            Share Price Over Time
          </CardTitle>
          <CardDescription>TRUST per share</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [
                  `${Number(value).toFixed(4)} TRUST`,
                  "Price",
                ]}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--olive)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
