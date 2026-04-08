import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { client } from "@/lib/client";
import {
  TOP_ATOM_VAULTS_BY_SHARE_PRICE,
  TOP_ATOM_VAULTS_BY_POSITION_COUNT,
  ATOM_DETAIL,
  SHARE_PRICE_CHART,
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

export interface ChartDataPoint {
  timestamp: string;
  value: string;
}

interface ChartResponse {
  getChartJson: {
    count: number;
    interval: string;
    data: ChartDataPoint[];
  };
}

export function useSharePriceChart(
  termId: string | undefined,
  startTime: number,
  interval: string
) {
  const endTime = Math.floor(Date.now() / 1000);
  const start = Math.floor(startTime / 1000);

  return useQuery({
    queryKey: ["sharePriceChart", termId, start, interval],
    queryFn: () =>
      client.request<ChartResponse>(SHARE_PRICE_CHART, {
        input: {
          term_id: termId,
          curve_id: "1",
          start_time: String(start),
          end_time: String(endTime),
          interval,
        },
    placeholderData: keepPreviousData,
      }),
    select: (data) => data.getChartJson.data,
    enabled: !!termId,
  });
}

