import { useEffect, useRef, useState } from "react";

export interface PricePoint {
  time: number;
  value: number;
}

export interface BinancePriceState {
  livePrice: number | null;
  openingPrice: number | null;
  history: PricePoint[];
  loading: boolean;
  error: string | null;
}

export function useBinancePrice(symbol: string): BinancePriceState {
  const [state, setState] = useState<BinancePriceState>({
    livePrice: null,
    openingPrice: null,
    history: [],
    loading: true,
    error: null,
  });
  const lastTime = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    setState({
      livePrice: null,
      openingPrice: null,
      history: [],
      loading: true,
      error: null,
    });
    lastTime.current = 0;

    async function init() {
      try {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1m&startTime=${startOfDay.getTime()}&limit=1500`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Binance REST ${res.status}`);
        const raw: unknown[][] = await res.json();
        if (cancelled) return;

        if (raw.length === 0) throw new Error("No kline data");

        const seen = new Set<number>();
        const history: PricePoint[] = [];
        for (const k of raw) {
          const t = Math.floor((k[0] as number) / 1000);
          if (seen.has(t)) continue;
          seen.add(t);
          history.push({ time: t, value: parseFloat(k[4] as string) });
        }

        const openingPrice = parseFloat(raw[0][1] as string);
        const lastClose = history[history.length - 1].value;
        lastTime.current = history[history.length - 1].time;

        setState({
          livePrice: lastClose,
          openingPrice,
          history,
          loading: false,
          error: null,
        });

        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`);
        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const data = JSON.parse(event.data);
            const price = parseFloat(data.p);
            const tsMs = data.T;
            if (!Number.isFinite(price) || !Number.isFinite(tsMs)) return;
            const t = Math.floor(tsMs / 1000);
            if (t <= lastTime.current) {
              setState((prev) => (prev.livePrice === price ? prev : { ...prev, livePrice: price }));
              return;
            }
            lastTime.current = t;
            setState((prev) => {
              const next = [...prev.history, { time: t, value: price }];
              if (next.length > 2000) next.splice(0, next.length - 2000);
              return { ...prev, livePrice: price, history: next };
            });
          } catch {
            /* ignore bad frames */
          }
        };
        ws.onerror = () => {
          if (!cancelled) setState((prev) => ({ ...prev, error: "WebSocket error" }));
        };
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          }));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (ws) ws.close();
    };
  }, [symbol]);

  return state;
}
