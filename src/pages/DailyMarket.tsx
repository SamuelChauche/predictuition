import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Swords,
  Landmark,
  Users,
  Activity,
  Trophy,
  Radio,
  Info,
  ChevronDown,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DAILY_MARKETS,
  formatPrice,
  relativeTime,
  shortAddr,
  useLiveAttestations,
  type DailyMarketConfig,
  type DailyMarketSlug,
} from "@/mocks/dailyMarkets";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useBinancePrice } from "@/hooks/useBinancePrice";
import { LiveBinanceChart } from "@/components/LiveBinanceChart";

interface DailyMarketPageProps {
  slug: DailyMarketSlug;
}

const ACCENT_CLASSES: Record<DailyMarketConfig["accent"], { text: string; ring: string; bg: string }> = {
  sandy: { text: "text-sandy", ring: "ring-sandy/40", bg: "bg-sandy/10" },
  teal: { text: "text-teal", ring: "ring-teal/40", bg: "bg-teal/10" },
};

export default function DailyMarket({ slug }: DailyMarketPageProps) {
  const config = DAILY_MARKETS[slug];
  const binance = useBinancePrice(config?.streamSymbol ?? "btcusdt");
  const { up, down, unique, activity, topAttestors } = useLiveAttestations(
    config ?? DAILY_MARKETS["melee-daily"]
  );

  if (!config) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Unknown market.{" "}
          <Link to="/market" className="underline">Back to markets</Link>
        </AlertDescription>
      </Alert>
    );
  }

  const openingPrice = binance.openingPrice ?? 0;
  const livePrice = binance.livePrice ?? 0;

  const totalAttestations = up + down;
  const upPct = totalAttestations === 0 ? 50 : (up / totalAttestations) * 100;
  const downPct = 100 - upPct;

  const isUp = openingPrice === 0 ? true : livePrice >= openingPrice;
  const diffPct = openingPrice === 0 ? 0 : ((livePrice - openingPrice) / openingPrice) * 100;

  const accent = ACCENT_CLASSES[config.accent];
  const AssetIcon: LucideIcon = slug === "melee-daily" ? Swords : Landmark;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link to="/market">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" />
            Markets
          </Button>
        </Link>
        <DayNav slug={slug} />
      </div>

      <Header config={config} AssetIcon={AssetIcon} accent={accent} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <PriceHero
            openingPrice={openingPrice}
            livePrice={livePrice}
            isUp={isUp}
            diffPct={diffPct}
            priceUnit={config.priceUnit}
            dayEnd={endOfDay()}
            loading={binance.loading}
          />
          <Card className="p-4 border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">{config.atomLabel} · Intraday</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                {binance.loading ? (
                  "Loading…"
                ) : binance.error ? (
                  `Error: ${binance.error}`
                ) : (
                  <>
                    <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-brick">
                      <span className="absolute inset-0 rounded-full bg-brick animate-ping opacity-75" />
                    </span>
                    Live · Intuition portal
                  </>
                )}
              </span>
            </div>
            <LiveBinanceChart
              history={binance.history}
              livePrice={binance.livePrice}
              openingPrice={binance.openingPrice}
              isUp={isUp}
              height={260}
            />
          </Card>
          <StatsBar
            totalAttestations={totalAttestations}
            unique={unique}
            dayEnd={endOfDay()}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActivityFeed activity={activity} />
            <TopAttestorsList items={topAttestors} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <AttestPanel
            up={up}
            down={down}
            upPct={upPct}
            downPct={downPct}
            atomLabel={config.atomLabel}
          />
          <InfoCard config={config} />
        </div>
      </div>
    </div>
  );
}

function endOfDay(): number {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

function PriceHero({
  openingPrice,
  livePrice,
  isUp,
  diffPct,
  priceUnit,
  dayEnd,
  loading,
}: {
  openingPrice: number;
  livePrice: number;
  isUp: boolean;
  diffPct: number;
  priceUnit: "USD" | "TRUST";
  dayEnd: number;
  loading?: boolean;
}) {
  const animated = useAnimatedNumber(livePrice, 700);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    setPulseKey((k) => k + 1);
  }, [livePrice]);

  const [remaining, setRemaining] = useState<number>(() => dayEnd - Date.now());
  const [secondKey, setSecondKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(dayEnd - Date.now());
      setSecondKey((k) => k + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [dayEnd]);

  const clamped = Math.max(0, remaining);
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const isResolved = remaining <= 0;
  const isFinalHour = remaining > 0 && remaining < 3_600_000;

  const sentimentText = isUp ? "text-up" : "text-brick";
  const sentimentBg = isUp ? "bg-up/15" : "bg-brick/15";
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  const countdownColor = isResolved
    ? "text-muted-foreground"
    : isFinalHour
    ? "text-pink-mist-400"
    : "text-foreground";

  return (
    <Card className="p-5 md:p-6 border-border bg-card">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="relative inline-flex w-2 h-2 rounded-full bg-brick">
            <span className="absolute inset-0 rounded-full bg-brick animate-ping opacity-75" />
          </span>
          Live
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {isResolved ? "Session closed" : isFinalHour ? "Closing soon" : "Resolves in"}
        </span>
      </div>

      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="flex items-end gap-8 md:gap-10">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Share price to beat</p>
            <p className="text-2xl md:text-3xl font-bold font-mono tabular-nums text-foreground/80">
              {loading ? "—" : formatPrice(openingPrice, priceUnit)}
            </p>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Current</p>
              {!loading && (
                <span
                  key={`diff-${pulseKey}`}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-mono",
                    sentimentText,
                    sentimentBg,
                    "animate-in zoom-in-95 duration-300"
                  )}
                >
                  <Arrow className="w-2.5 h-2.5" strokeWidth={2.5} />
                  {diffPct >= 0 ? "+" : ""}
                  {diffPct.toFixed(2)}%
                </span>
              )}
            </div>
            <p
              key={pulseKey}
              className={cn(
                "text-3xl md:text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors duration-300",
                loading ? "text-muted-foreground" : sentimentText,
                "animate-in fade-in-50 duration-300"
              )}
            >
              {loading ? "Loading…" : formatPrice(animated, priceUnit)}
            </p>
          </div>
        </div>

        <div
          key={secondKey}
          className={cn(
            "flex items-start gap-3 font-mono font-bold tabular-nums",
            "animate-in fade-in-50 duration-500"
          )}
        >
          <CountdownCell label="HRS" value={hours} color={countdownColor} />
          <CountdownCell label="MIN" value={minutes} color={countdownColor} />
          <CountdownCell label="SEC" value={seconds} color={countdownColor} />
        </div>
      </div>

    </Card>
  );
}

function CountdownCell({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={cn("text-3xl md:text-4xl tracking-tight", color)}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
        {label}
      </span>
    </div>
  );
}

function DayNav({ slug }: { slug: DailyMarketSlug }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <button
        disabled
        className="px-3 py-1 text-xs font-medium text-muted-foreground/50 rounded-md cursor-not-allowed"
      >
        Yesterday
      </button>
      <button className="px-3 py-1 text-xs font-semibold text-foreground bg-muted rounded-md">
        Today
      </button>
      <button
        disabled
        className="px-3 py-1 text-xs font-medium text-muted-foreground/50 rounded-md cursor-not-allowed"
      >
        Tomorrow
      </button>
      <span className="sr-only">Viewing {slug}</span>
    </div>
  );
}

function Header({
  config,
  AssetIcon,
  accent,
}: {
  config: DailyMarketConfig;
  AssetIcon: LucideIcon;
  accent: (typeof ACCENT_CLASSES)[DailyMarketConfig["accent"]];
}) {
  const windowLabel = formatDayWindow();
  return (
    <div className="flex items-start gap-4">
      <div
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center ring-2",
          accent.bg,
          accent.ring
        )}
      >
        <AssetIcon className={cn("w-6 h-6", accent.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">{config.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="text-foreground font-medium">{config.atomLabel}</span> atom · {config.asset} ·{" "}
          {windowLabel}
        </p>
      </div>
    </div>
  );
}

function formatDayWindow(): string {
  const d = new Date();
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  return `${month} ${day}, 00:00 → 23:59 UTC`;
}

function StatsBar({
  totalAttestations,
  unique,
  dayEnd,
}: {
  totalAttestations: number;
  unique: number;
  dayEnd: number;
}) {
  const [remaining, setRemaining] = useState<number>(() => dayEnd - Date.now());
  useEffect(() => {
    const id = setInterval(() => setRemaining(dayEnd - Date.now()), 1000);
    return () => clearInterval(id);
  }, [dayEnd]);

  const animatedTotal = useAnimatedNumber(totalAttestations, 500);
  const animatedUnique = useAnimatedNumber(unique, 500);

  return (
    <Card className="p-4 border-border bg-card">
      <div className="grid grid-cols-3 divide-x divide-border">
        <Stat icon={Activity} label="Attestations" value={Math.round(animatedTotal).toLocaleString()} />
        <Stat icon={Users} label="Unique attestors" value={Math.round(animatedUnique).toLocaleString()} />
        <Stat icon={Radio} label="Resolves in" value={formatRemaining(remaining)} valueClass="text-sandy" />
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 first:pl-0 last:pr-0">
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      <span className={cn("text-lg md:text-xl font-bold font-mono tabular-nums", valueClass ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Resolved";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

function AttestPanel({
  up,
  down,
  upPct,
  downPct,
  atomLabel,
}: {
  up: number;
  down: number;
  upPct: number;
  downPct: number;
  atomLabel: string;
}) {
  const animatedUp = useAnimatedNumber(upPct, 600);
  const animatedDown = useAnimatedNumber(downPct, 600);
  const [selected, setSelected] = useState<"up" | "down" | null>(null);
  const [mode, setMode] = useState<"attest" | "history">("attest");

  const total = up + down;

  return (
    <Card className="p-5 border-border bg-card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMode("attest")}
            className={cn(
              "relative pb-2 text-sm font-semibold transition-colors",
              mode === "attest" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Attest
            {mode === "attest" && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode("history")}
            className={cn(
              "relative pb-2 text-sm font-medium transition-colors",
              mode === "history" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            History
            {mode === "history" && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-not-allowed"
        >
          Daily
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <AttestButton
          side="up"
          pct={animatedUp}
          selected={selected === "up"}
          onClick={() => setSelected((s) => (s === "up" ? null : "up"))}
        />
        <AttestButton
          side="down"
          pct={animatedDown}
          selected={selected === "down"}
          onClick={() => setSelected((s) => (s === "down" ? null : "down"))}
        />
      </div>

      <div className="h-px bg-border mb-4" />

      <div className="space-y-3 mb-5">
        <SummaryRow label="Your side">
          {selected ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                selected === "up"
                  ? "bg-frosted-mint-500/20 text-frosted-mint-500"
                  : "bg-pink-mist-500/20 text-pink-mist-500"
              )}
            >
              {selected === "up" ? (
                <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />
              ) : (
                <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />
              )}
              {selected}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground font-mono">—</span>
          )}
        </SummaryRow>
        <SummaryRow label="Support split">
          <span className="text-sm font-mono">
            <span className="text-up font-bold">{upPct.toFixed(0)}%</span>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span className="text-brick font-bold">{downPct.toFixed(0)}%</span>
          </span>
        </SummaryRow>
        <SummaryRow label="Attestations today">
          <span className="text-sm font-mono text-foreground">{total.toLocaleString()}</span>
        </SummaryRow>
        <SummaryRow label="Resolution">
          <span className="text-sm font-mono text-vanilla-custard-500">On-chain · 23:59 UTC</span>
        </SummaryRow>
      </div>

      <button
        type="button"
        disabled
        title="Connect wallet to attest"
        className={cn(
          "w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm",
          "transition-all hover:brightness-110",
          "disabled:cursor-not-allowed disabled:opacity-70",
          "inline-flex items-center justify-center gap-2"
        )}
      >
        <Wallet className="w-4 h-4" />
        {selected ? `Attest ${selected.toUpperCase()}` : "Select a side"}
      </button>

      <p className="mt-3 text-[10px] text-muted-foreground text-center leading-relaxed">
        By attesting you pledge a position on the{" "}
        <span className="text-foreground font-medium">{atomLabel}</span> atom. Connect a wallet to submit.
      </p>
    </Card>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function AttestButton({
  side,
  pct,
  selected,
  onClick,
}: {
  side: "up" | "down";
  pct: number;
  selected: boolean;
  onClick: () => void;
}) {
  const isUp = side === "up";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;

  const idleColors = isUp
    ? "border-frosted-mint-500/40 bg-frosted-mint-500/10 text-frosted-mint-500 hover:bg-frosted-mint-500/20"
    : "border-pink-mist-500/40 bg-pink-mist-500/10 text-pink-mist-500 hover:bg-pink-mist-500/20";
  const activeColors = isUp
    ? "border-frosted-mint-500 bg-frosted-mint-500 text-frosted-mint-100"
    : "border-pink-mist-500 bg-pink-mist-500 text-pink-mist-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-lg border h-12 px-4 transition-all",
        "inline-flex items-center justify-center gap-2 font-bold",
        selected ? activeColors : idleColors
      )}
    >
      <Icon className="w-4 h-4" strokeWidth={2.75} />
      <span className="uppercase text-sm tracking-wider">{side}</span>
      <span className="font-mono text-sm opacity-90">{pct.toFixed(0)}%</span>
    </button>
  );
}

function InfoCard({ config }: { config: DailyMarketConfig }) {
  return (
    <Card className="p-4 border-border bg-card">
      <div className="text-xs text-muted-foreground space-y-2">
        <p className="text-foreground font-medium">How it resolves</p>
        <p>
          This market resolves when the {config.asset} price at the end of the UTC day is compared to the
          opening price. "Up" wins if the close ≥ open.
        </p>
        <p className="pt-1 border-t border-border">
          Attestations are aggregated from the <span className="text-foreground">{config.atomLabel}</span>{" "}
          atom on Intuition — support = Up, oppose = Down.
        </p>
      </div>
    </Card>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">{label}</h3>
      </div>
      {typeof count === "number" && (
        <span className="text-[11px] font-mono text-muted-foreground">{count} entries</span>
      )}
    </div>
  );
}

function ActivityFeed({ activity }: { activity: ReturnType<typeof useLiveAttestations>["activity"] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(() => activity.slice(0, 15), [activity]);

  return (
    <Card className="border-border bg-card overflow-hidden p-0">
      <SectionHeader icon={Activity} label="Activity" count={items.length} />
      <div className="divide-y divide-border/70 max-h-[420px] overflow-y-auto">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet.</div>
        )}
        {items.map((a) => (
          <div
            key={a.id}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-2.5 text-sm",
              "animate-in fade-in-0 slide-in-from-top-1 duration-500"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                  a.side === "up" ? "bg-up/15 text-up" : "bg-brick/15 text-brick"
                )}
              >
                {a.side === "up" ? (
                  <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
              </span>
              <span className="font-mono text-xs text-foreground">{shortAddr(a.address)}</span>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider font-semibold",
                  a.side === "up" ? "text-up" : "text-brick"
                )}
              >
                {a.side}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono shrink-0">{relativeTime(a.timestamp, now)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TopAttestorsList({ items }: { items: ReturnType<typeof useLiveAttestations>["topAttestors"] }) {
  return (
    <Card className="border-border bg-card overflow-hidden p-0">
      <SectionHeader icon={Trophy} label="Top attestors" count={items.length} />
      <div className="divide-y divide-border/70">
        {items.map((a, i) => {
          const upSharePct = Math.round(a.upRatio * 100);
          return (
            <div key={a.address} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="text-xs font-mono text-muted-foreground w-5 text-center">#{i + 1}</span>
              <span className="font-mono text-xs text-foreground flex-1">{shortAddr(a.address)}</span>
              <span className="text-xs text-muted-foreground font-mono">{a.count} att.</span>
              <div className="hidden sm:flex items-center gap-1 w-28">
                <div className="flex-1 h-1.5 bg-brick/25 rounded-full overflow-hidden">
                  <div className="h-full bg-up" style={{ width: `${upSharePct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{upSharePct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
