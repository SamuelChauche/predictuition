import { useAccount, useReadContracts } from "wagmi";
import { useOnChainMarkets } from "./useOnChainMarkets";
import { MARKET_ABI, TESTNET_CHAIN_ID } from "@/lib/contracts";
import type { OnChainMarket } from "./useOnChainMarkets";

export interface PortfolioPosition {
  market: OnChainMarket;
  sharesYes: bigint;
  sharesNo: bigint;
  claimed: boolean;
  /** Side with largest stake. If user bet both sides, whichever is bigger. */
  side: "yes" | "no";
  staked: bigint;
  status: "active" | "locked" | "pending_resolve" | "won" | "lost" | "refund";
  /** Amount claimable (won) or refundable. 0 if active/lost. */
  claimable: bigint;
}

const FIELDS_PER_POS = 3; // sharesYes, sharesNo, claimed

export function usePortfolio() {
  const { address } = useAccount();
  const { markets, isLoading: marketsLoading, error, refetch } = useOnChainMarkets();

  // Batch-read user positions for every market
  const posContracts = address
    ? markets.flatMap((m) => [
        { address: m.address, abi: MARKET_ABI, functionName: "sharesYes" as const, args: [address] as const, chainId: TESTNET_CHAIN_ID },
        { address: m.address, abi: MARKET_ABI, functionName: "sharesNo"  as const, args: [address] as const, chainId: TESTNET_CHAIN_ID },
        { address: m.address, abi: MARKET_ABI, functionName: "claimed"   as const, args: [address] as const, chainId: TESTNET_CHAIN_ID },
      ])
    : [];

  const { data: posData, isLoading: posLoading, refetch: refetchPos } = useReadContracts({
    contracts: posContracts,
    query: {
      enabled: !!address && markets.length > 0,
      refetchInterval: 15_000,
    },
  });

  const now = Math.floor(Date.now() / 1000);

  const positions: PortfolioPosition[] = markets
    .map((market, i): PortfolioPosition | null => {
      const base        = i * FIELDS_PER_POS;
      const sharesYes   = (posData?.[base    ]?.result as bigint | undefined) ?? 0n;
      const sharesNo    = (posData?.[base + 1]?.result as bigint | undefined) ?? 0n;
      const claimed     = Boolean(posData?.[base + 2]?.result);

      if (sharesYes === 0n && sharesNo === 0n) return null;

      const staked = sharesYes + sharesNo;
      const side: "yes" | "no" = sharesYes >= sharesNo ? "yes" : "no";

      let status: PortfolioPosition["status"];
      let claimable = 0n;

      if (market.refundMode) {
        status    = "refund";
        claimable = staked;
      } else if (market.resolved) {
        const userWon = market.outcome ? sharesYes > 0n : sharesNo > 0n;
        if (userWon) {
          status = "won";
          const winningShares = market.outcome ? sharesYes : sharesNo;
          const winningPool   = market.outcome ? market.poolYes : market.poolNo;
          claimable = winningPool > 0n
            ? (winningShares * market.remainingPoolAfterFees) / winningPool
            : 0n;
        } else {
          status = "lost";
        }
      } else if (now >= market.deadlineTs) {
        status = "pending_resolve";
      } else if (now >= market.lockTimeTs) {
        status = "locked";
      } else {
        status = "active";
      }

      return { market, sharesYes, sharesNo, claimed, side, staked, status, claimable };
    })
    .filter((p): p is PortfolioPosition => p !== null);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const activePositions  = positions.filter((p) => p.status === "active" || p.status === "locked");
  const wonPositions     = positions.filter((p) => p.status === "won");
  const lostPositions    = positions.filter((p) => p.status === "lost");
  const pendingPositions = positions.filter((p) => p.status === "pending_resolve");
  const refundPositions  = positions.filter((p) => p.status === "refund");

  const totalStaked = activePositions.reduce((s, p) => s + p.staked, 0n);

  // Net profit on positions won but not yet claimed (claimable payout minus original stake)
  const totalProfit = wonPositions
    .filter((p) => !p.claimed)
    .reduce((s, p) => s + (p.claimable > p.staked ? p.claimable - p.staked : 0n), 0n);

  // Already claimed, net benefit (payout - original stake)
  const totalWonNet = wonPositions
    .filter((p) => p.claimed)
    .reduce((s, p) => s + (p.claimable > p.staked ? p.claimable - p.staked : 0n), 0n);

  const totalLost = lostPositions.reduce((s, p) => s + p.staked, 0n);

  // PnL = net gains (claimed wins profit) minus losses
  const pnl = BigInt(totalWonNet) - BigInt(totalLost);

  // Keep totalClaimable for internal use (full payout not yet claimed)
  const totalClaimable = wonPositions.filter((p) => !p.claimed).reduce((s, p) => s + p.claimable, 0n);

  function refetchAll() {
    refetch();
    refetchPos();
  }

  return {
    positions,
    activePositions,
    wonPositions,
    lostPositions,
    pendingPositions,
    refundPositions,
    totalStaked,
    totalProfit,
    totalClaimable,
    totalLost,
    pnl,
    isLoading: marketsLoading || (!!address && markets.length > 0 && posLoading),
    error,
    refetch: refetchAll,
  };
}
