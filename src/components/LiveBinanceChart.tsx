import { useEffect, useRef } from "react";
import {
  createChart,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  AreaSeries,
} from "lightweight-charts";
import type { PricePoint } from "@/hooks/useBinancePrice";

const UP_HEX = "#d3f8e2";
const DOWN_HEX = "#f694c1";
const UP_RGB = "211,248,226";
const DOWN_RGB = "246,148,193";
const OPEN_LINE_HEX = "#ede7b1";

interface LiveBinanceChartProps {
  history: PricePoint[];
  livePrice: number | null;
  openingPrice: number | null;
  isUp: boolean;
  height?: number;
}

export function LiveBinanceChart({
  history,
  livePrice,
  openingPrice,
  isUp,
  height = 260,
}: LiveBinanceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const openLineRef = useRef<IPriceLine | null>(null);
  const lastTimeRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#b9c1d2",
      },
      grid: {
        horzLines: { color: "rgba(255,255,255,0.06)" },
        vertLines: { color: "rgba(255,255,255,0.06)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(255,255,255,0.1)",
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.1)",
      },
      crosshair: {
        horzLine: { color: "rgba(255,255,255,0.3)", labelBackgroundColor: "#1e2329" },
        vertLine: { color: "rgba(255,255,255,0.3)", labelBackgroundColor: "#1e2329" },
      },
      handleScale: false,
      handleScroll: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: UP_HEX,
      topColor: `rgba(${UP_RGB},0.35)`,
      bottomColor: `rgba(${UP_RGB},0)`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      openLineRef.current = null;
      initializedRef.current = false;
      lastTimeRef.current = 0;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (history.length === 0) return;
    if (initializedRef.current) return;

    const seen = new Set<number>();
    const dedup: PricePoint[] = [];
    for (const p of history) {
      if (seen.has(p.time)) continue;
      seen.add(p.time);
      dedup.push(p);
    }

    series.setData(
      dedup.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    );
    lastTimeRef.current = dedup[dedup.length - 1]?.time ?? 0;
    initializedRef.current = true;
    chartRef.current?.timeScale().fitContent();
  }, [history]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (openingPrice == null) return;
    if (openLineRef.current) {
      series.removePriceLine(openLineRef.current);
      openLineRef.current = null;
    }
    openLineRef.current = series.createPriceLine({
      price: openingPrice,
      color: OPEN_LINE_HEX,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Open",
    });
  }, [openingPrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (livePrice == null) return;
    if (!initializedRef.current) return;

    const t = Math.floor(Date.now() / 1000);
    if (t <= lastTimeRef.current) {
      return;
    }
    lastTimeRef.current = t;
    series.update({ time: t as UTCTimestamp, value: livePrice });
  }, [livePrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const rgb = isUp ? UP_RGB : DOWN_RGB;
    const hex = isUp ? UP_HEX : DOWN_HEX;
    series.applyOptions({
      lineColor: hex,
      topColor: `rgba(${rgb},0.35)`,
      bottomColor: `rgba(${rgb},0)`,
    });
  }, [isUp]);

  return <div ref={containerRef} className="w-full" style={{ minHeight: height }} />;
}
