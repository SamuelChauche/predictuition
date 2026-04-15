import { useQuery } from "@tanstack/react-query";
import { testnetClient } from "@/lib/client";
import { VAULT_TARGET } from "@/lib/queries";

export type TargetCategory = "atoms" | "triples" | "unknown";

export interface VaultTarget {
  termId: string;
  label: string;
  image: string | null;
  category: TargetCategory;
  sharePrice: number;
  tvl: number;
  positionCount: number;
  // Atom extras
  atomType?: string;
  // Triple extras
  subjectLabel?: string;
  predicateLabel?: string;
  objectLabel?: string;
  subjectImage?: string | null;
}

interface VaultRow {
  term_id: string;
  current_share_price: string;
  total_assets: string;
  position_count: number;
  term: {
    atom: { label: string | null; image: string | null; type: string; term_id: string } | null;
    triple: {
      term_id: string;
      subject: { label: string | null; image: string | null; term_id: string };
      predicate: { label: string | null; term_id: string };
      object: { label: string | null; image: string | null; term_id: string };
    } | null;
  };
}

// On Intuition testnet, term_id is a full 32-byte hex string (e.g. "0x7ec36d…").
// The bytes32 stored in the contract IS the term_id — just lowercase it.
export function bytes32ToTermId(bytes32: `0x${string}`): string | null {
  if (!bytes32 || bytes32 === "0x") return null;
  try {
    if (BigInt(bytes32) === 0n) return null; // all-zeros = unset
  } catch {
    return null;
  }
  return bytes32.toLowerCase();
}

function parseVault(row: VaultRow): VaultTarget {
  const sharePrice   = Number(row.current_share_price) / 1e18;
  const tvl          = Number(row.total_assets) / 1e18;
  const positionCount = row.position_count;

  if (row.term.atom) {
    const a = row.term.atom;
    return {
      termId: row.term_id,
      label: a.label ?? `Atom #${row.term_id}`,
      image: a.image,
      category: "atoms",
      sharePrice,
      tvl,
      positionCount,
      atomType: a.type,
    };
  }

  if (row.term.triple) {
    const t = row.term.triple;
    const s = t.subject.label ?? "?";
    const p = t.predicate.label ?? "→";
    const o = t.object.label ?? "?";
    return {
      termId: row.term_id,
      label: `${s} ${p} ${o}`,
      image: t.subject.image,
      category: "triples",
      sharePrice,
      tvl,
      positionCount,
      subjectLabel: s,
      predicateLabel: p,
      objectLabel: o,
      subjectImage: t.subject.image,
    };
  }

  return {
    termId: row.term_id,
    label: `ID ${row.term_id}`,
    image: null,
    category: "unknown",
    sharePrice,
    tvl,
    positionCount,
  };
}

export function useVaultTarget(termId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["vaultTarget", termId],
    queryFn: () =>
      testnetClient.request<{ vaults: VaultRow[] }>(VAULT_TARGET, { termId }),
    enabled: !!termId,
    staleTime: 60_000,
  });

  const row = data?.vaults?.[0];
  const target: VaultTarget | null = row ? parseVault(row) : null;

  return { target, isLoading: !!termId && isLoading };
}
