import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { PROTOCOL_STATS, RECENT_SIGNALS } from "@/lib/queries";

export interface ProtocolStats {
  total_atoms: number;
  total_triples: number;
  total_positions: number;
  total_signals: number;
  total_accounts: number;
  contract_balance: string;
}

interface Signal {
  id: string;
  created_at: string;
  delta: string;
}

export function useProtocolStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () =>
      client.request<{ stats: ProtocolStats[] }>(PROTOCOL_STATS),
    select: (data) => data.stats[0],
  });
}

export function useActivityChart(limit = 1000) {
  return useQuery({
    queryKey: ["activity", limit],
    queryFn: () =>
      client.request<{ signals: Signal[] }>(RECENT_SIGNALS, { limit }),
    select: (data) => {
      const byDay = new Map<string, number>();
      for (const signal of data.signals) {
        const date = signal.created_at.split("T")[0];
        byDay.set(date, (byDay.get(date) ?? 0) + 1);
      }
      return Array.from(byDay.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}
