import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { VAULT_TARGET } from "@/lib/queries";
import { buildQuestion } from "@/hooks/useOnChainMarkets";
import type { OnChainMarket } from "@/hooks/useOnChainMarkets";

export type MarketDuration = "1h" | "1d" | "1m";
export type MarketCategory = "atoms" | "triples" | "unknown";

export interface EnrichedOnChainMarket extends OnChainMarket {
  duration: MarketDuration;
  category: MarketCategory;
  targetLabel: string;
  targetImage: string | null;
  currentSharePrice: number;
  tvl: number;
  positionCount: number;
}

// bytes32 (0x-prefixed) → decimal string for Hasura query
// Returns null if the value is not yet loaded (e.g. "0x" or all-zeros)
function bytes32ToTermId(bytes32: `0x${string}`): string | null {
  if (!bytes32 || bytes32 === "0x") return null;
  try {
    if (BigInt(bytes32) === 0n) return null;
  } catch {
    return null;
  }
  return bytes32.toLowerCase();
}

function getDuration(deadlineTs: number): MarketDuration {
  const remaining = deadlineTs - Math.floor(Date.now() / 1000);
  if (remaining < 2 * 3600) return "1h";
  if (remaining < 2 * 86400) return "1d";
  return "1m";
}

interface AtomData {
  label: string | null;
  image: string | null;
  type: string;
  term_id: string;
}

interface TripleData {
  term_id: string;
  subject: { label: string | null; image: string | null; term_id: string };
  predicate: { label: string | null; term_id: string };
  object: { label: string | null; image: string | null; term_id: string };
}

interface VaultRow {
  term_id: string;
  current_share_price: string;
  total_assets: string;
  position_count: number;
  term: {
    atom: AtomData | null;
    triple: TripleData | null;
  };
}

function buildLabel(vault: VaultRow): string {
  if (vault.term.atom) return vault.term.atom.label ?? `Atom #${vault.term_id}`;
  if (vault.term.triple) {
    const t = vault.term.triple;
    const s = t.subject.label ?? "?";
    const p = t.predicate.label ?? "→";
    const o = t.object.label ?? "?";
    return `${s} ${p} ${o}`;
  }
  return `Term #${vault.term_id}`;
}

function buildImage(vault: VaultRow): string | null {
  if (vault.term.atom) return vault.term.atom.image;
  if (vault.term.triple) return vault.term.triple.subject.image;
  return null;
}

function getCategory(vault: VaultRow): MarketCategory {
  if (vault.term.atom) return "atoms";
  if (vault.term.triple) return "triples";
  return "unknown";
}

export function useOnChainMarketsEnriched(markets: OnChainMarket[]): {
  enriched: EnrichedOnChainMarket[];
  isLoading: boolean;
} {
  // Deduplicated list of term IDs to query (skip unloaded markets)
  const termIds = [...new Set(
    markets.map((m) => bytes32ToTermId(m.targetId)).filter((id): id is string => id !== null)
  )];

  const { data, isLoading } = useQuery({
    queryKey: ["marketTargets", termIds.join(",")],
    queryFn: () =>
      client.request<{ vaults: VaultRow[] }>(VAULT_TARGET, { ids: termIds }),
    enabled: termIds.length > 0,
    staleTime: 60_000,
  });

  const vaultMap = new Map<string, VaultRow>(
    (data?.vaults ?? []).map((v) => [v.term_id.toString(), v])
  );

  const enriched: EnrichedOnChainMarket[] = markets.map((m) => {
    const termId = bytes32ToTermId(m.targetId);
    const vault = termId ? vaultMap.get(termId) : undefined;

    const targetLabel = vault ? buildLabel(vault) : termId ? `ID ${termId}` : "…";
    const enrichedQuestion = buildQuestion(m.conditionType, m.targetId, m.targetValue, targetLabel);

    return {
      ...m,
      ...enrichedQuestion,
      duration: getDuration(m.deadlineTs),
      category: vault ? getCategory(vault) : "unknown",
      targetLabel,
      targetImage: vault ? buildImage(vault) : null,
      currentSharePrice: vault ? Number(vault.current_share_price) / 1e18 : 0,
      tvl: vault ? Number(vault.total_assets) / 1e18 : 0,
      positionCount: vault?.position_count ?? 0,
    };
  });

  return { enriched, isLoading: termIds.length > 0 && isLoading };
}
