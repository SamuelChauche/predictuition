import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { PROTOCOL_STATS } from "@/lib/queries";

export interface ProtocolStats {
  total_atoms: number;
  total_triples: number;
  total_positions: number;
  total_signals: number;
  total_accounts: number;
  contract_balance: string;
}

export function useProtocolStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () =>
      client.request<{ stats: ProtocolStats[] }>(PROTOCOL_STATS),
    select: (data) => data.stats[0],
  });
}
