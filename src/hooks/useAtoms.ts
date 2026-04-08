import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import {
  TOP_ATOM_VAULTS_BY_SHARE_PRICE,
  TOP_ATOM_VAULTS_BY_POSITION_COUNT,
  ATOM_DETAIL,
  SHARE_PRICE_HISTORY,
} from "@/lib/queries";

export interface AtomVaultRow {
  term_id: string;
  current_share_price: string;
  total_shares: string;
  total_assets: string;
  position_count: number;
  term: {
    atom: {
      label: string | null;
      emoji: string | null;
      image: string | null;
      type: string;
      term_id: string;
      creator_id: string;
      created_at: string;
    };
  };
}

export interface AtomData {
  term_id: string;
  label: string | null;
  image: string | null;
  emoji: string | null;
  type: string;
  creator_id: string;
  created_at: string;
}

export interface VaultData {
  term_id: string;
  current_share_price: string;
  total_shares: string;
  total_assets: string;
  position_count: number;
}

export interface PositionData {
  id: string;
  account_id: string;
  shares: string;
  account: { id: string; label: string | null };
}

export function useTopAtomsBySharePrice(limit = 10) {
  return useQuery({
    queryKey: ["atoms", "sharePrice", limit],
    queryFn: () =>
      client.request<{ vaults: AtomVaultRow[] }>(
        TOP_ATOM_VAULTS_BY_SHARE_PRICE,
        { limit }
      ),
    select: (data) => data.vaults,
  });
}

export function useTopAtomsByPositionCount(limit = 10) {
  return useQuery({
    queryKey: ["atoms", "positionCount", limit],
    queryFn: () =>
      client.request<{ vaults: AtomVaultRow[] }>(
        TOP_ATOM_VAULTS_BY_POSITION_COUNT,
        { limit }
      ),
    select: (data) => data.vaults,
  });
}

export function useAtomDetail(termId: string) {
  return useQuery({
    queryKey: ["atom", termId],
    queryFn: () =>
      client.request<{
        atom: AtomData;
        vaults: VaultData[];
        positions: PositionData[];
      }>(ATOM_DETAIL, { termId }),
    enabled: !!termId,
  });
}

export interface SharePricePoint {
  block_timestamp: string;
  share_price: string;
  total_assets: string;
  total_shares: string;
}

export function useSharePriceHistory(termId: string | undefined) {
  return useQuery({
    queryKey: ["sharePriceHistory", termId],
    queryFn: () =>
      client.request<{ share_price_changes: SharePricePoint[] }>(
        SHARE_PRICE_HISTORY,
        { termId }
      ),
    select: (data) => [...data.share_price_changes].reverse(),
    enabled: !!termId,
  });
}

