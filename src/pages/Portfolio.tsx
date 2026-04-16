import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatEther } from "viem";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  TrendingUp,
  Clock,
  Trophy,
  User,
  Link as LinkIcon,
  ArrowRightLeft,
  RefreshCw,
  Check,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import { ConnectButton, useWalletInfo } from "@/components/ConnectButton";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useVaultTarget, bytes32ToTermId } from "@/hooks/useVaultTarget";
import { buildQuestion } from "@/hooks/useOnChainMarkets";
import { MARKET_ABI, TESTNET_CHAIN_ID } from "@/lib/contracts";
import type { PortfolioPosition } from "@/hooks/usePortfolio";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n < 0.0001) return `<0.0001`;
  return n.toFixed(4);
}

// ─── Position row ─────────────────────────────────────────────────────────────

function PositionRow({
  position,
  onRefetch,
}: {
  position: PortfolioPosition;
  onRefetch: () => void;
}) {
  const { market, side, staked, status, claimable, claimed } = position;
  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isOnTestnet = chain?.id === TESTNET_CHAIN_ID;

  const termId = bytes32ToTermId(market.targetId);
  const { target } = useVaultTarget(termId);

  const detailPath = termId
    ? market.isTriple
      ? `/triples/${termId}`
      : `/atoms/${termId}`
    : null;

  const { question, yesLabel, noLabel } = buildQuestion(
    market.conditionType,
    market.targetId,
    market.targetValue,
    target?.label,
  );

  const { writeContract, data: txHash, isPending, error: writeError, reset } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      onRefetch();
      setTimeout(reset, 2000);
    }
  }, [isSuccess, onRefetch, reset]);

  const txBusy = isPending || isConfirming;

  function handleClaim() {
    writeContract({ address: market.address, abi: MARKET_ABI, functionName: "claim", chainId: TESTNET_CHAIN_ID });
  }

  function handleRefund() {
    writeContract({ address: market.address, abi: MARKET_ABI, functionName: "emergencyRefund", chainId: TESTNET_CHAIN_ID });
  }

  function handleResolve() {
    writeContract({ address: market.address, abi: MARKET_ABI, functionName: "resolve", chainId: TESTNET_CHAIN_ID });
  }

  // Status badge + color
  const statusConfig = {
    active:          { label: "Active",          color: "text-teal",      icon: Clock       },
    locked:          { label: "Locked",           color: "text-sandy",     icon: Clock       },
    pending_resolve: { label: "Pending resolve",  color: "text-muted-foreground", icon: Clock },
    won:             { label: "Won",              color: "text-[#90D18D]", icon: Trophy      },
    lost:            { label: "Lost",             color: "text-[#bc4b51]", icon: TrendingUp  },
    refund:          { label: "Cancelled",        color: "text-muted-foreground", icon: AlertTriangle },
  } as const;

  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  const sideLabel = side === "yes" ? yesLabel : noLabel;
  const sideColor = side === "yes" ? "text-[#90D18D]" : "text-[#bc4b51]";

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />

      <div className="flex-1 min-w-0 space-y-1">
        {/* Target link */}
        {target && detailPath && (
          <Link
            to={detailPath}
            className="inline-flex items-center gap-1 text-xs text-teal hover:text-teal/80 hover:underline"
          >
            {target.label}
            <ArrowUpRight className="w-3 h-3 shrink-0" />
          </Link>
        )}

        {/* Question */}
        <p className="text-sm text-foreground leading-snug">{question}</p>

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className={`font-medium ${sideColor}`}>{sideLabel}</span>
          <span>·</span>
          <span className={cfg.color}>{cfg.label}</span>
          {(status === "active" || status === "locked") && market.deadlineTs && (
            <>
              <span>·</span>
              <span>Deadline {new Date(market.deadlineTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </>
          )}
        </div>

        {/* Error */}
        {writeError && (
          <p className="text-xs text-[#bc4b51]">{writeError.message.slice(0, 100)}</p>
        )}

        {/* Actions */}
        {address && (
          <div className="pt-0.5">
            {!isOnTestnet && (status === "won" || status === "refund" || status === "pending_resolve") ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
                <ArrowRightLeft className="w-3 h-3 mr-1" />
                Switch to Testnet
              </Button>
            ) : status === "won" && !claimed ? (
              <Button
                size="sm"
                className="h-7 text-xs bg-[#90D18D] hover:bg-[#90D18D]/80 text-black font-medium"
                disabled={txBusy}
                onClick={handleClaim}
              >
                {txBusy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                {txBusy ? "Claiming…" : `Claim ${fmt(claimable)} TRUST`}
              </Button>
            ) : status === "won" && claimed ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="w-3 h-3 text-[#90D18D]" /> Claimed
              </span>
            ) : status === "refund" ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={txBusy} onClick={handleRefund}>
                {txBusy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                {txBusy ? "Refunding…" : `Refund ${fmt(staked)} TRUST`}
              </Button>
            ) : status === "pending_resolve" ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={txBusy} onClick={handleResolve}>
                {txBusy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                {txBusy ? "Resolving…" : "Resolve Market"}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-medium">{fmt(staked)} TRUST</p>
        {status === "won" && (
          <p className="text-xs font-mono text-[#90D18D]">→ {fmt(claimable)}</p>
        )}
        {status === "lost" && (
          <p className="text-xs font-mono text-[#bc4b51]">−{fmt(staked)}</p>
        )}
        {status === "refund" && (
          <p className="text-xs font-mono text-muted-foreground">refund</p>
        )}
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Portfolio() {
  const wallet = useWalletInfo();
  const { address } = useAccount();

  const {
    activePositions,
    wonPositions,
    lostPositions,
    pendingPositions,
    refundPositions,
    totalStaked,
    totalProfit,
    pnl,
    isLoading,
    refetch,
  } = usePortfolio();

  const openPositions   = [...activePositions, ...pendingPositions];
  const closedPositions = [...wonPositions, ...lostPositions, ...refundPositions];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Portfolio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your positions and betting history on Intuition Testnet.
        </p>
      </div>

      {/* Wallet */}
      {wallet.isConnected && wallet.address ? (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center">
                <User className="w-5 h-5 text-teal" />
              </div>
              <div>
                <p className="font-mono text-sm font-bold text-foreground">{wallet.shortAddress}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" />
                    {wallet.chainName} · chain {wallet.chainId}
                  </span>
                  {wallet.balance && (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="w-3 h-3" />
                      {wallet.balance}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <Wallet className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connect your wallet to see your positions</p>
            <ConnectButton />
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {address && (
        isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Wallet}
              label="Active Stake"
              value={`${fmt(totalStaked)} TRUST`}
              color="text-olive"
            />
            <StatCard
              icon={Clock}
              label="Active Bets"
              value={String(openPositions.length)}
              color="text-sandy"
            />
            <StatCard
              icon={Trophy}
              label="Profit"
              value={`+${fmt(totalProfit)} TRUST`}
              color="text-gold"
            />
            <StatCard
              icon={TrendingUp}
              label="PnL"
              value={`${pnl >= 0n ? "+" : "−"}${fmt(pnl >= 0n ? pnl : -pnl)} TRUST`}
              color={pnl >= 0n ? "text-[#90D18D]" : "text-[#bc4b51]"}
            />
          </div>
        )
      )}

      {/* Active Bets */}
      {address && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-sandy" />
              Active Bets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}
              </div>
            ) : openPositions.length > 0 ? (
              openPositions.map((p) => (
                <PositionRow key={p.market.address} position={p} onRefetch={refetch} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-2">No open positions.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {address && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-gold" />
              History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}
              </div>
            ) : closedPositions.length > 0 ? (
              closedPositions.map((p) => (
                <PositionRow key={p.market.address} position={p} onRefetch={refetch} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-2">No resolved positions yet.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
