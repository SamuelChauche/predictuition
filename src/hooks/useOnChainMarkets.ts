import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import {
  MARKET_FACTORY_ADDRESS,
  MARKET_FACTORY_ABI,
  MARKET_ABI,
  CONDITION_LABELS,
  TESTNET_CHAIN_ID,
} from "@/lib/contracts";

export interface OnChainMarket {
  address: `0x${string}`;
  conditionType: number;
  targetId: `0x${string}`;
  targetValue: bigint;
  deadlineTs: number;
  lockTimeTs: number;
  poolYes: bigint;
  poolNo: bigint;
  resolved: boolean;
  refundMode: boolean;
  outcome: boolean;
  remainingPoolAfterFees: bigint;
  minVolume: bigint;
  creator: `0x${string}`;
  question: string;
  yesLabel: string;
  noLabel: string;
}

// Fields read per market (must match order in marketContracts below)
const FIELDS_PER_MARKET = 13;

const FACTORY_ADDR = MARKET_FACTORY_ADDRESS[TESTNET_CHAIN_ID]!;

export function useOnChainMarkets() {
  // Step 1: fetch all market addresses from factory
  const { data: listData, isLoading: listLoading, error: listError } = useReadContracts({
    contracts: [
      {
        address: FACTORY_ADDR,
        abi: MARKET_FACTORY_ABI,
        functionName: "getMarkets",
        args: [0n, 50n],
        chainId: TESTNET_CHAIN_ID,
      },
    ],
    query: { refetchInterval: 15_000 },
  });

  const addresses = (listData?.[0]?.result ?? []) as `0x${string}`[];

  // Step 2: batch-read state for every market in a single multicall
  const marketContracts = addresses.flatMap((addr) => [
    { address: addr, abi: MARKET_ABI, functionName: "conditionType" as const,          chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "targetId" as const,               chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "targetValue" as const,            chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "deadline" as const,               chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "lockTime" as const,               chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "poolYes" as const,                chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "poolNo" as const,                 chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "resolved" as const,               chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "refundMode" as const,             chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "outcome" as const,                chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "remainingPoolAfterFees" as const, chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "minVolume" as const,              chainId: TESTNET_CHAIN_ID },
    { address: addr, abi: MARKET_ABI, functionName: "creator" as const,               chainId: TESTNET_CHAIN_ID },
  ]);

  const {
    data: marketData,
    isLoading: marketLoading,
    error: marketError,
    refetch,
  } = useReadContracts({
    contracts: marketContracts,
    query: {
      enabled: addresses.length > 0,
      refetchInterval: 15_000,
    },
  });

  const markets: OnChainMarket[] = addresses.map((addr, i) => {
    const base = i * FIELDS_PER_MARKET;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = (offset: number): any => marketData?.[base + offset]?.result;

    const conditionType = Number(get(0) ?? 0);
    const targetId     = (get(1) ?? "0x") as `0x${string}`;
    const targetValue  = (get(2) ?? 0n)   as bigint;
    const deadlineTs   = Number(get(3)    ?? 0);
    const lockTimeTs   = Number(get(4)    ?? 0);
    const poolYes      = (get(5) ?? 0n)   as bigint;
    const poolNo       = (get(6) ?? 0n)   as bigint;
    const resolved     = Boolean(get(7));
    const refundMode   = Boolean(get(8));
    const outcome      = Boolean(get(9));
    const remainingPoolAfterFees = (get(10) ?? 0n) as bigint;
    const minVolume    = (get(11) ?? 0n)  as bigint;
    const creator      = (get(12) ?? "0x") as `0x${string}`;

    const { question, yesLabel, noLabel } = buildQuestion(conditionType, targetId, targetValue);

    return {
      address: addr,
      conditionType,
      targetId,
      targetValue,
      deadlineTs,
      lockTimeTs,
      poolYes,
      poolNo,
      resolved,
      refundMode,
      outcome,
      remainingPoolAfterFees,
      minVolume,
      creator,
      question,
      yesLabel,
      noLabel,
    };
  });

  return {
    markets,
    isLoading: listLoading || (addresses.length > 0 && marketLoading),
    error: listError ?? marketError,
    refetch,
  };
}

function formatTrust(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (n === 0) return "0 TRUST";
  if (n < 1e-6)  return `${(n * 1e9).toFixed(2)} nTRUST`;
  if (n < 1e-3)  return `${(n * 1e6).toFixed(2)} µTRUST`;
  if (n < 1)     return `${(n * 1e3).toFixed(4)} mTRUST`;
  return `${n.toFixed(4)} TRUST`;
}

export function buildQuestion(
  conditionType: number,
  targetId: `0x${string}`,
  targetValue: bigint,
  label?: string,
): { question: string; yesLabel: string; noLabel: string } {
  const name  = label ?? `${targetId.slice(0, 8)}…${targetId.slice(-4)}`;
  const tv    = formatTrust(targetValue);
  const labels = CONDITION_LABELS[conditionType];

  switch (conditionType) {
    case 1: return { question: `Will TVL of ${name} stay above ${tv}?`,     yesLabel: "Above",  noLabel: "Below"  };
    case 2: return { question: `Will TVL of ${name} drop below ${tv}?`,     yesLabel: "Below",  noLabel: "Above"  };
    case 3: return { question: `Will share price of ${name} exceed ${tv}?`, yesLabel: "Higher", noLabel: "Lower"  };
    case 4: return { question: `Will share price of ${name} drop below ${tv}?`, yesLabel: "Lower", noLabel: "Higher" };
    case 5: return { question: `Will FOR ratio of ${name} exceed ${Number(targetValue) / 100}%?`, yesLabel: "Yes", noLabel: "No" };
    case 6: return { question: `Will majority of ${name} flip sides?`,      yesLabel: "Flip",   noLabel: "Hold"   };
    default: return { question: `Unknown condition on ${name}`,             yesLabel: labels?.yes ?? "Yes", noLabel: labels?.no ?? "No" };
  }
}
