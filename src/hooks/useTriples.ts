import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import {
  TOP_TRIPLE_VAULTS_BY_SHARE_PRICE,
  TOP_TRIPLE_VAULTS_BY_POSITION_COUNT,
  TRIPLE_DETAIL,
} from "@/lib/queries";
import type { PositionData } from "./useAtoms";

export interface TripleAtomRef {
  term_id: string;
  label: string | null;
  emoji: string | null;
  image: string | null;
}

export interface TripleVaultRow {
  term_id: string;
  current_share_price: string;
  total_shares: string;
  total_assets: string;
  position_count: number;
  term: {
    triple: {
      term_id: string;
      creator_id: string;
      created_at: string;
      subject: TripleAtomRef;
      predicate: TripleAtomRef;
      object: TripleAtomRef;
    };
  };
}

export interface TripleData {
  term_id: string;
  creator_id: string;
  created_at: string;
  subject: TripleAtomRef;
  predicate: TripleAtomRef;
  object: TripleAtomRef;
}

export interface TripleVaultData {
  term_id: string;
  total_shares: string;
  total_assets: string;
  position_count: number;
}

function dedupeByTermId<T extends { term_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.term_id)) return false;
    seen.add(r.term_id);
    return true;
  });
}

export function useTopTriplesBySharePrice(limit = 10) {
  return useQuery({
    queryKey: ["triples", "sharePrice", limit],
    queryFn: () =>
      client.request<{ vaults: TripleVaultRow[] }>(
        TOP_TRIPLE_VAULTS_BY_SHARE_PRICE,
        { limit }
      ),
    select: (data) => dedupeByTermId(data.vaults),
  });
}

export function useTopTriplesByPositionCount(limit = 10) {
  return useQuery({
    queryKey: ["triples", "positionCount", limit],
    queryFn: () =>
      client.request<{ vaults: TripleVaultRow[] }>(
        TOP_TRIPLE_VAULTS_BY_POSITION_COUNT,
        { limit }
      ),
    select: (data) => dedupeByTermId(data.vaults),
  });
}

export function useTripleDetail(termId: string) {
  return useQuery({
    queryKey: ["triple", termId],
    queryFn: () =>
      client.request<{
        triple: TripleData;
        triple_vault: TripleVaultData;
        positions: PositionData[];
      }>(TRIPLE_DETAIL, { termId }),
    enabled: !!termId,
  });
}
