import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ThumbsUp,
  ThumbsDown,
  Wallet,
  Check,
  AlertTriangle,
  RefreshCw,
  ArrowRightLeft,
  ExternalLink,
} from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";
import { MARKET_ABI, TESTNET_CHAIN_ID } from "@/lib/contracts";
import { buildQuestion } from "@/hooks/useOnChainMarkets";
import { useVaultTarget, bytes32ToTermId } from "@/hooks/useVaultTarget";
import type { OnChainMarket } from "@/hooks/useOnChainMarkets";

interface Props {
  market: OnChainMarket;
  onRefetch: () => void;
}

export function OnChainMarketCard({ market, onRefetch }: Props) {
  const navigate = useNavigate();
  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // ─── Fetch atom / triple data ─────────────────────────────────────────────
  const termId = bytes32ToTermId(market.targetId);
  const { target } = useVaultTarget(termId);

  function handleTargetClick() {
    if (!target) return;
    if (target.category === "atoms") navigate(`/atoms/${target.termId}`);
    else if (target.category === "triples") navigate(`/triples/${target.termId}`);
  }
  const { question, yesLabel, noLabel } = buildQuestion(
    market.conditionType,
    market.targetId,
    market.targetValue,
    target?.label,
  );

  const isOnTestnet = chain?.id === TESTNET_CHAIN_ID;
  const now = Math.floor(Date.now() / 1000);
  const isLocked   = now >= market.lockTimeTs;
  const isExpired  = now >= market.deadlineTs;

  // ─── User positions ──────────────────────────────────────────────────────────
  const { data: posData, refetch: refetchPos } = useReadContracts({
    contracts: address
      ? [
          { address: market.address, abi: MARKET_ABI, functionName: "sharesYes" as const, args: [address], chainId: TESTNET_CHAIN_ID },
          { address: market.address, abi: MARKET_ABI, functionName: "sharesNo"  as const, args: [address], chainId: TESTNET_CHAIN_ID },
          { address: market.address, abi: MARKET_ABI, functionName: "claimed"   as const, args: [address], chainId: TESTNET_CHAIN_ID },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharesYes     = (posData?.[0]?.result as any ?? 0n) as bigint;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharesNo      = (posData?.[1]?.result as any ?? 0n) as bigint;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alreadyClaimed = (posData?.[2]?.result as any ?? false) as boolean;

  // ─── Write contract ───────────────────────────────────────────────────────────
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Refresh on success
  useEffect(() => {
    if (isSuccess) {
      onRefetch();
      refetchPos();
      setBetSide(null);
      setAmount("");
      setTimeout(reset, 3000);
    }
  }, [isSuccess, onRefetch, refetchPos, reset]);

  // ─── Bet form state ──────────────────────────────────────────────────────────
  const [betSide, setBetSide] = useState<"yes" | "no" | null>(null);
  const [amount, setAmount]   = useState("");

  const parsedAmount = parseFloat(amount) || 0;
  const poolYesEth   = Number(formatEther(market.poolYes));
  const poolNoEth    = Number(formatEther(market.poolNo));
  const totalPool    = poolYesEth + poolNoEth;
  const yesPercent   = totalPool > 0 ? Math.round((poolYesEth / totalPool) * 100) : 50;
  const noPercent    = 100 - yesPercent;

  // Estimated payout if bet wins
  const sidePool      = betSide === "yes" ? poolYesEth : poolNoEth;
  const otherPool     = betSide === "yes" ? poolNoEth  : poolYesEth;
  const newSidePool   = sidePool + parsedAmount;
  const estimatedPayout = parsedAmount > 0
    ? (parsedAmount / newSidePool) * (newSidePool + otherPool) * 0.98
    : 0;

  // User's claimable payout
  const userShares    = market.outcome ? sharesYes : sharesNo;
  const winningPool   = market.outcome ? market.poolYes : market.poolNo;
  const claimable     = winningPool > 0n
    ? (userShares * market.remainingPoolAfterFees) / winningPool
    : 0n;

  function handleBet() {
    if (!parsedAmount || !betSide) return;
    writeContract({
      address: market.address,
      abi: MARKET_ABI,
      functionName: "bet",
      args: [betSide === "yes"],
      value: parseEther(amount),
      chainId: TESTNET_CHAIN_ID,
    });
  }

  function handleClaim() {
    writeContract({
      address: market.address,
      abi: MARKET_ABI,
      functionName: "claim",
      chainId: TESTNET_CHAIN_ID,
    });
  }

  function handleResolve() {
    writeContract({
      address: market.address,
      abi: MARKET_ABI,
      functionName: "resolve",
      chainId: TESTNET_CHAIN_ID,
    });
  }

  function handleRefund() {
    writeContract({
      address: market.address,
      abi: MARKET_ABI,
      functionName: "emergencyRefund",
      chainId: TESTNET_CHAIN_ID,
    });
  }

  const explorerUrl = `https://testnet.explorer.intuition.systems/address/${market.address}`;
  const txBusy = isPending || isConfirming;

  // ─── Status badge ─────────────────────────────────────────────────────────────
  function StatusBadge() {
    if (market.refundMode) return <Badge variant="secondary">Cancelled</Badge>;
    if (market.resolved)   return (
      <Badge style={{ backgroundColor: market.outcome ? "#90D18D" : "#bc4b51", color: "#000" }}>
        Resolved — {market.outcome ? yesLabel : noLabel}
      </Badge>
    );
    if (isLocked)          return <Badge variant="secondary">Locked</Badge>;
    return <Badge style={{ backgroundColor: "#5b8e7d20", color: "#5b8e7d" }}>Live</Badge>;
  }

  return (
    <Card className="py-0 gap-0 hover:border-teal/30 transition-all">
      <CardContent className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {target?.image && (
              <img
                src={target.image}
                alt=""
                className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              {target && (
                <button
                  onClick={handleTargetClick}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline truncate block max-w-full transition-colors text-left"
                >
                  {target.label}
                </button>
              )}
              <p className="text-sm font-semibold text-foreground leading-snug">{question}</p>
            </div>
          </div>
          <StatusBadge />
        </div>

        {/* Target stats */}
        {target && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Price <span className="font-mono text-foreground">{target.sharePrice.toFixed(4)} TRUST</span></span>
            <span>TVL <span className="font-mono text-foreground">{target.tvl.toFixed(2)} TRUST</span></span>
            <span>{target.positionCount} positions</span>
          </div>
        )}

        {/* Pool bar */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
              <div className="h-full bg-[#90D18D] transition-all" style={{ width: `${yesPercent}%` }} />
              <div className="h-full bg-[#bc4b51] transition-all" style={{ width: `${noPercent}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span style={{ color: "#90D18D" }}>{yesLabel} {yesPercent}%</span>
            <span className="font-mono">{Number(formatEther(market.poolYes + market.poolNo)).toFixed(4)} TRUST</span>
            <span style={{ color: "#bc4b51" }}>{noPercent}% {noLabel}</span>
          </div>
        </div>

        {/* ── RESOLVED STATE ─────────────────────────────────────────────────── */}
        {market.resolved && address && (
          <div className="rounded-lg bg-muted p-3 space-y-2">
            {claimable > 0n && !alreadyClaimed ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Your winnings: <span className="font-mono font-semibold text-foreground">{Number(formatEther(claimable)).toFixed(6)} TRUST</span>
                </p>
                {!isOnTestnet ? (
                  <Button size="sm" className="w-full" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
                    <ArrowRightLeft className="w-3 h-3 mr-1" />
                    Switch to Testnet to Claim
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full bg-[#90D18D] hover:bg-[#90D18D]/80 text-black font-medium"
                    disabled={txBusy}
                    onClick={handleClaim}
                  >
                    {txBusy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                    {txBusy ? "Confirming…" : "Claim Winnings"}
                  </Button>
                )}
              </>
            ) : alreadyClaimed ? (
              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                <Check className="w-3 h-3 text-[#90D18D]" />
                Claimed
              </p>
            ) : (
              <p className="text-xs text-center text-muted-foreground">No winning position</p>
            )}
          </div>
        )}

        {/* ── RESOLVE BUTTON (expired, not yet resolved) ─────────────────────── */}
        {isExpired && !market.resolved && !market.refundMode && address && (
          <div className="rounded-lg bg-muted p-3">
            {!isOnTestnet ? (
              <Button size="sm" className="w-full" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
                <ArrowRightLeft className="w-3 h-3 mr-1" />
                Switch to Testnet
              </Button>
            ) : (
              <Button size="sm" className="w-full" disabled={txBusy} onClick={handleResolve}>
                {txBusy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                {txBusy ? "Resolving…" : "Resolve Market"}
              </Button>
            )}
          </div>
        )}

        {/* ── REFUND MODE ─────────────────────────────────────────────────────── */}
        {market.refundMode && address && (sharesYes > 0n || sharesNo > 0n) && (
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Market cancelled. Refund: <span className="font-mono font-semibold text-foreground">
                {Number(formatEther(sharesYes + sharesNo)).toFixed(6)} TRUST
              </span>
            </p>
            {!isOnTestnet ? (
              <Button size="sm" className="w-full" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
                <ArrowRightLeft className="w-3 h-3 mr-1" />
                Switch to Testnet
              </Button>
            ) : (
              <Button size="sm" className="w-full" disabled={txBusy} onClick={handleRefund}>
                {txBusy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                {txBusy ? "Refunding…" : "Get Refund"}
              </Button>
            )}
          </div>
        )}

        {/* ── ACTIVE BET BUTTONS ───────────────────────────────────────────────── */}
        {!market.resolved && !market.refundMode && !isLocked && (
          <>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className={`flex-1 h-8 text-xs border-0 ${
                  betSide === "yes"
                    ? "bg-[#90D18D] text-black"
                    : "bg-[#90D18D]/15 text-[#90D18D] hover:bg-[#90D18D]/25"
                }`}
                onClick={() => setBetSide(betSide === "yes" ? null : "yes")}
              >
                <ThumbsUp className="w-3 h-3 mr-1" />
                {yesLabel} {yesPercent}%
              </Button>
              <Button
                size="sm"
                className={`flex-1 h-8 text-xs border-0 ${
                  betSide === "no"
                    ? "bg-[#bc4b51] text-black"
                    : "bg-[#bc4b51]/15 text-[#bc4b51] hover:bg-[#bc4b51]/25"
                }`}
                onClick={() => setBetSide(betSide === "no" ? null : "no")}
              >
                <ThumbsDown className="w-3 h-3 mr-1" />
                {noLabel} {noPercent}%
              </Button>
            </div>

            {/* Inline bet form */}
            {betSide && (
              <div className="space-y-2 rounded-lg bg-muted p-3">
                {/* Amount input */}
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-9 rounded-md bg-background border border-border px-3 pr-16 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">TRUST</span>
                </div>

                {/* Quick amounts */}
                <div className="flex gap-1">
                  {["0.001", "0.01", "0.1", "1"].map((v) => (
                    <Button key={v} variant="outline" size="sm" className="flex-1 text-xs h-6 px-0" onClick={() => setAmount(v)}>
                      {v}
                    </Button>
                  ))}
                </div>

                {/* Payout preview */}
                {parsedAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Est. payout if win</span>
                    <span className="font-mono text-foreground">{estimatedPayout.toFixed(5)} TRUST</span>
                  </div>
                )}

                {/* Error */}
                {writeError && (
                  <p className="text-xs text-[#bc4b51] flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {writeError.message.slice(0, 80)}
                  </p>
                )}

                {/* Success */}
                {isSuccess && (
                  <p className="text-xs text-[#90D18D] flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Bet placed!
                  </p>
                )}

                {/* Confirm button */}
                {!address ? (
                  <p className="text-xs text-muted-foreground text-center">Connect wallet to bet</p>
                ) : !isOnTestnet ? (
                  <Button size="sm" className="w-full" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
                    <ArrowRightLeft className="w-3 h-3 mr-1" />
                    Switch to Intuition Testnet
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className={`w-full font-medium ${
                      betSide === "yes"
                        ? "bg-[#90D18D] hover:bg-[#90D18D]/80 text-black"
                        : "bg-[#bc4b51] hover:bg-[#bc4b51]/80 text-black"
                    }`}
                    disabled={parsedAmount <= 0 || txBusy}
                    onClick={handleBet}
                  >
                    {txBusy
                      ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Confirming…</>
                      : <><Wallet className="w-3 h-3 mr-1" />Bet {parsedAmount > 0 ? `${parsedAmount} TRUST` : ""} on {betSide === "yes" ? yesLabel : noLabel}</>
                    }
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {/* Locked state */}
        {!market.resolved && !market.refundMode && isLocked && !isExpired && (
          <p className="text-xs text-muted-foreground text-center">Betting closed — awaiting resolution</p>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-foreground transition-colors flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {market.address.slice(0, 8)}…{market.address.slice(-4)}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
          {!market.resolved && !market.refundMode && (
            <CountdownTimer deadline={market.deadlineTs * 1000} />
          )}
        </div>

      </CardContent>
    </Card>
  );
}
