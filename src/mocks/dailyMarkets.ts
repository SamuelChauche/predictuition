import { useEffect, useState } from "react";

export type DailyMarketSlug = "melee-daily" | "arena-daily";

export type AccentColor = "sandy" | "teal";

export interface DailyMarketConfig {
  slug: DailyMarketSlug;
  path: string;
  asset: string;
  shortTitle: string;
  title: string;
  atomId: string;
  atomLabel: string;
  atomPath?: string;
  openingPrice: number;
  priceUnit: "USD" | "TRUST";
  accent: AccentColor;
  volatility: number;
  initialUpCount: number;
  initialDownCount: number;
  initialUniqueAttestors: number;
  streamSymbol: string;
  displaySymbol: string;
}

export interface Attestation {
  id: string;
  address: string;
  side: "up" | "down";
  timestamp: number;
}

export interface TopAttestor {
  address: string;
  count: number;
  upRatio: number;
}

function randomAddress(): string {
  const hex = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < 40; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

function utcDayStart(offsetDays = 0): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.getTime();
}

function utcDayEnd(offsetDays = 0): number {
  return utcDayStart(offsetDays + 1) - 1000;
}

export function dayStart(offset = 0): number {
  return utcDayStart(offset);
}

export function dayEnd(offset = 0): number {
  return utcDayEnd(offset);
}

function seedActivity(size = 20): Attestation[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `seed-${i}`,
    address: randomAddress(),
    side: Math.random() > 0.38 ? "up" : "down",
    timestamp: Date.now() - i * 1000 * (15 + Math.floor(Math.random() * 90)),
  }));
}

function seedTopAttestors(size = 8): TopAttestor[] {
  return Array.from({ length: size }, () => ({
    address: randomAddress(),
    count: 4 + Math.floor(Math.random() * 40),
    upRatio: 0.3 + Math.random() * 0.6,
  })).sort((a, b) => b.count - a.count);
}

export const DAILY_MARKETS: Record<DailyMarketSlug, DailyMarketConfig> = {
  "melee-daily": {
    slug: "melee-daily",
    path: "/market/melee-daily",
    asset: "BTC / USD",
    shortTitle: "Melee · Up or Down",
    title: "Melee · Up or Down Today",
    atomId: "melee",
    atomLabel: "Melee",
    openingPrice: 0,
    priceUnit: "USD",
    accent: "sandy",
    volatility: 0,
    initialUpCount: 312,
    initialDownCount: 188,
    initialUniqueAttestors: 287,
    streamSymbol: "btcusdt",
    displaySymbol: "BTC/USD",
  },
  "arena-daily": {
    slug: "arena-daily",
    path: "/market/arena-daily",
    asset: "ETH / USD",
    shortTitle: "Arena · Up or Down",
    title: "Arena · Up or Down Today",
    atomId: "arena",
    atomLabel: "Arena",
    openingPrice: 0,
    priceUnit: "USD",
    accent: "teal",
    volatility: 0,
    initialUpCount: 156,
    initialDownCount: 94,
    initialUniqueAttestors: 142,
    streamSymbol: "ethusdt",
    displaySymbol: "ETH/USD",
  },
};

export function getDailyMarket(slug: DailyMarketSlug): DailyMarketConfig {
  return DAILY_MARKETS[slug];
}

export function formatPrice(n: number, unit: "USD" | "TRUST"): string {
  if (unit === "USD") {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }
  const digits = n >= 10 ? 2 : n >= 1 ? 3 : 4;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} TRUST`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export interface PricePoint {
  t: number;
  price: number;
}

function seedHistory(opening: number, volatility: number, points = 80): PricePoint[] {
  const start = utcDayStart(0);
  const now = Date.now();
  const span = Math.max(60_000, now - start);
  const step = span / points;
  let price = opening;
  const out: PricePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const t = start + i * step;
    const drift = (Math.random() - 0.5) * volatility * 2;
    const pull = ((opening - price) / opening) * 0.05;
    price = price * (1 + drift + pull);
    price = Math.max(opening * 0.92, Math.min(opening * 1.08, price));
    out.push({ t, price });
  }
  return out;
}

export function usePriceHistory(
  opening: number,
  volatility: number,
  livePrice: number,
  maxPoints = 240
): PricePoint[] {
  const [history, setHistory] = useState<PricePoint[]>(() => seedHistory(opening, volatility));

  useEffect(() => {
    setHistory(seedHistory(opening, volatility));
  }, [opening, volatility]);

  useEffect(() => {
    setHistory((prev) => {
      const next = [...prev, { t: Date.now(), price: livePrice }];
      if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
      return next;
    });
  }, [livePrice, maxPoints]);

  return history;
}

export function useLiveMarketPrice(opening: number, volatility = 0.002, intervalMs = 3000): number {
  const [price, setPrice] = useState<number>(() => opening * (1 + (Math.random() - 0.4) * volatility * 2));

  useEffect(() => {
    const id = setInterval(() => {
      setPrice((prev) => {
        const drift = (Math.random() - 0.5) * volatility * 2;
        const pull = ((opening - prev) / opening) * 0.08;
        const next = prev * (1 + drift + pull);
        return Math.max(opening * 0.92, Math.min(opening * 1.08, next));
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [opening, volatility, intervalMs]);

  return price;
}

interface LiveAttestationState {
  up: number;
  down: number;
  unique: number;
  activity: Attestation[];
  topAttestors: TopAttestor[];
}

export function useLiveAttestations(config: DailyMarketConfig): LiveAttestationState {
  const [state, setState] = useState<LiveAttestationState>(() => ({
    up: config.initialUpCount,
    down: config.initialDownCount,
    unique: config.initialUniqueAttestors,
    activity: seedActivity(20),
    topAttestors: seedTopAttestors(8),
  }));

  useEffect(() => {
    setState({
      up: config.initialUpCount,
      down: config.initialDownCount,
      unique: config.initialUniqueAttestors,
      activity: seedActivity(20),
      topAttestors: seedTopAttestors(8),
    });
  }, [config.slug, config.initialUpCount, config.initialDownCount, config.initialUniqueAttestors]);

  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const side: "up" | "down" = Math.random() > 0.42 ? "up" : "down";
        const next: Attestation = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          address: randomAddress(),
          side,
          timestamp: Date.now(),
        };
        return {
          up: prev.up + (side === "up" ? 1 : 0),
          down: prev.down + (side === "down" ? 1 : 0),
          unique: prev.unique + (Math.random() > 0.6 ? 1 : 0),
          activity: [next, ...prev.activity].slice(0, 30),
          topAttestors: prev.topAttestors,
        };
      });
    }, 4200);
    return () => clearInterval(id);
  }, [config.slug]);

  return state;
}
