import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { gql } from "graphql-request";

const TOP_ATOMS_FOR_MARKETS = gql`
  query TopAtomsForMarkets {
    vaults(
      limit: 10
      order_by: { position_count: desc }
      where: { term: { atom_id: { _is_null: false } }, position_count: { _gte: 5 } }
    ) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
      term {
        atom {
          label
          emoji
          image
          type
          term_id
        }
      }
    }
  }
`;

const TOP_TRIPLES_FOR_MARKETS = gql`
  query TopTriplesForMarkets {
    vaults(
      limit: 10
      order_by: { position_count: desc }
      where: { term: { triple_id: { _is_null: false } }, position_count: { _gte: 5 } }
    ) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
      term {
        triple {
          term_id
          subject { label image term_id }
          predicate { label term_id }
          object { label image term_id }
        }
      }
    }
  }
`;

export type MarketType = "over_under" | "sentiment" | "bracket";
export type MarketDuration = "1h" | "1d" | "1m";

export interface Market {
  id: string;
  type: MarketType;
  duration: MarketDuration;
  question: string;
  description: string;
  termId: string;
  image: string | null;
  currentPrice: number;
  tvl: number;
  positions: number;
  yesLabel: string;
  noLabel: string;
  yesPool: number;
  noPool: number;
  deadline: number;
  category: "atoms" | "triples";
}

function nextDeadline(duration: MarketDuration): number {
  const now = Date.now();
  switch (duration) {
    case "1h":
      return now + 3_600_000 - (now % 3_600_000);
    case "1d": {
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      return tomorrow.getTime();
    }
    case "1m": {
      const nextMonth = new Date();
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
      nextMonth.setUTCHours(0, 0, 0, 0);
      return nextMonth.getTime();
    }
  }
}

function pseudoRandom(seed: string, index: number): number {
  let hash = 0;
  const s = seed + index;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface AtomVault {
  term_id: string;
  current_share_price: string;
  total_shares: string;
  total_assets: string;
  position_count: number;
  term: {
    atom: {
      label: string | null;
      image: string | null;
      type: string;
      term_id: string;
    };
  };
}

interface TripleVault {
  term_id: string;
  current_share_price: string;
  total_shares: string;
  total_assets: string;
  position_count: number;
  term: {
    triple: {
      term_id: string;
      subject: { label: string | null; image: string | null; term_id: string };
      predicate: { label: string | null; term_id: string };
      object: { label: string | null; image: string | null; term_id: string };
    };
  };
}

const durations: MarketDuration[] = ["1h", "1d", "1m"];

function generateAtomMarkets(vaults: AtomVault[]): Market[] {
  const markets: Market[] = [];

  vaults.forEach((v, i) => {
    const atom = v.term.atom;
    const label = atom.label || "Unknown Atom";
    const price = Number(v.current_share_price) / 1e18;
    const tvl = Number(v.total_assets) / 1e18;
    const duration = durations[i % 3];
    const seed = pseudoRandom(v.term_id, i);
    const yesPool = 50 + (seed % 200);
    const noPool = 50 + ((seed >> 4) % 200);

    markets.push({
      id: `atom-ou-${v.term_id.slice(0, 16)}`,
      type: "over_under",
      duration,
      question: `Will ${label} share price go UP in the next ${duration === "1h" ? "hour" : duration === "1d" ? "24 hours" : "month"}?`,
      description: `Current share price: ${price.toFixed(4)} TRUST. Resolves by reading currentSharePrice() on MultiVault.`,
      termId: atom.term_id,
      image: atom.image,
      currentPrice: price,
      tvl,
      positions: v.position_count,
      yesLabel: "Higher",
      noLabel: "Lower",
      yesPool,
      noPool,
      deadline: nextDeadline(duration),
      category: "atoms",
    });

    if (i < 4) {
      const bracketDuration = durations[(i + 1) % 3];
      markets.push({
        id: `atom-br-${v.term_id.slice(0, 16)}`,
        type: "bracket",
        duration: bracketDuration,
        question: `${label} share price change in the next ${bracketDuration === "1h" ? "hour" : bracketDuration === "1d" ? "24h" : "month"}: above or below +5%?`,
        description: `Will the share price move more than 5% from current ${price.toFixed(4)} TRUST?`,
        termId: atom.term_id,
        image: atom.image,
        currentPrice: price,
        tvl,
        positions: v.position_count,
        yesLabel: "> +5%",
        noLabel: "< +5%",
        yesPool: 30 + (seed % 100),
        noPool: 60 + ((seed >> 3) % 150),
        deadline: nextDeadline(bracketDuration),
        category: "atoms",
      });
    }
  });

  return markets;
}

function generateTripleMarkets(vaults: TripleVault[]): Market[] {
  const markets: Market[] = [];

  vaults.forEach((v, i) => {
    const t = v.term.triple;
    const subLabel = t.subject.label || "Unknown";
    const predLabel = t.predicate.label || "→";
    const objLabel = t.object.label || "Unknown";
    const price = Number(v.current_share_price) / 1e18;
    const tvl = Number(v.total_assets) / 1e18;
    const duration = durations[i % 3];
    const seed = pseudoRandom(v.term_id, i);
    const yesPool = 40 + (seed % 180);
    const noPool = 40 + ((seed >> 4) % 180);

    markets.push({
      id: `triple-sent-${v.term_id.slice(0, 16)}`,
      type: "sentiment",
      duration,
      question: `Will "${subLabel} ${predLabel} ${objLabel}" gain more trust in the next ${duration === "1h" ? "hour" : duration === "1d" ? "24h" : "month"}?`,
      description: `Current TVL: ${tvl.toFixed(2)} TRUST, ${v.position_count} positions. Resolves by comparing vault totalAssets.`,
      termId: t.term_id,
      image: t.subject.image,
      currentPrice: price,
      tvl,
      positions: v.position_count,
      yesLabel: "Bullish",
      noLabel: "Bearish",
      yesPool,
      noPool,
      deadline: nextDeadline(duration),
      category: "triples",
    });
  });

  return markets;
}

export function useMarkets() {
  const atomsQuery = useQuery({
    queryKey: ["marketsAtoms"],
    queryFn: () =>
      client.request<{ vaults: AtomVault[] }>(TOP_ATOMS_FOR_MARKETS),
    select: (data) => generateAtomMarkets(data.vaults),
  });

  const triplesQuery = useQuery({
    queryKey: ["marketsTriples"],
    queryFn: () =>
      client.request<{ vaults: TripleVault[] }>(TOP_TRIPLES_FOR_MARKETS),
    select: (data) => generateTripleMarkets(data.vaults),
  });

  const allMarkets = [
    ...(atomsQuery.data ?? []),
    ...(triplesQuery.data ?? []),
  ];

  return {
    markets: allMarkets,
    isLoading: atomsQuery.isLoading || triplesQuery.isLoading,
    error: atomsQuery.error || triplesQuery.error,
  };
}

export function useMarket(id: string) {
  const { markets, isLoading, error } = useMarkets();
  return {
    market: markets.find((m) => m.id === id),
    isLoading,
    error,
  };
}
