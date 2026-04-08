import type { Market } from "@/hooks/useMarkets";

export function PoolBar({ market }: { market: Market }) {
  const total = market.yesPool + market.noPool;
  const yesPercent = Math.round((market.yesPool / total) * 100);
  const noPercent = 100 - yesPercent;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium">
        <span className="text-olive">{market.yesLabel} {yesPercent}%</span>
        <span className="text-brick">{market.noLabel} {noPercent}%</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div
          className="bg-olive transition-all flex items-center justify-center"
          style={{ width: `${yesPercent}%` }}
        >
          {yesPercent > 15 && (
            <span className="text-[10px] font-mono text-black/70">{market.yesPool.toFixed(0)}</span>
          )}
        </div>
        <div
          className="bg-brick transition-all flex items-center justify-center"
          style={{ width: `${noPercent}%` }}
        >
          {noPercent > 15 && (
            <span className="text-[10px] font-mono text-white/70">{market.noPool.toFixed(0)}</span>
          )}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{market.yesPool.toFixed(0)} TRUST</span>
        <span>{total.toFixed(0)} TRUST total</span>
        <span>{market.noPool.toFixed(0)} TRUST</span>
      </div>
    </div>
  );
}
