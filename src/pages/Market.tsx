import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  Code,
  UserCircle,
  Wallet,
  Users,
} from "lucide-react";

type Resolver = "1h" | "1d" | "1m";
type Category = "contracts" | "identities";

interface MockMarket {
  id: string;
  question: string;
  yes: number;
  volume: string;
  positions: number;
  resolver: Resolver;
  category: Category;
}

const markets: MockMarket[] = [
  // Smart Contract - 1h
  { id: "c1", question: "Will Intuition contract reach 10K ETH TVL this hour?", yes: 34, volume: "12.4K TRUST", positions: 89, resolver: "1h", category: "contracts" },
  { id: "c2", question: "More than 50 signals in the next hour?", yes: 71, volume: "8.7K TRUST", positions: 112, resolver: "1h", category: "contracts" },
  // Smart Contract - 1d
  { id: "c4", question: "Total atoms will exceed 175,000 by end of day?", yes: 55, volume: "45.2K TRUST", positions: 312, resolver: "1d", category: "contracts" },
  { id: "c5", question: "Contract balance increases by more than 100 ETH today?", yes: 28, volume: "67.8K TRUST", positions: 478, resolver: "1d", category: "contracts" },
  // Smart Contract - 1m
  { id: "c8", question: "Protocol reaches 500K total accounts this month?", yes: 38, volume: "234K TRUST", positions: 1203, resolver: "1m", category: "contracts" },
  { id: "c9", question: "Total triples double from current count?", yes: 12, volume: "178K TRUST", positions: 890, resolver: "1m", category: "contracts" },
  // Identities - 1h
  { id: "i1", question: "intuitionbilly.eth receives a new deposit this hour?", yes: 78, volume: "3.2K TRUST", positions: 56, resolver: "1h", category: "identities" },
  { id: "i2", question: "A new Account atom gets created in the next hour?", yes: 92, volume: "1.8K TRUST", positions: 34, resolver: "1h", category: "identities" },
  // Identities - 1d
  { id: "i4", question: "istarengwa.eth accumulates more than 300 shares today?", yes: 41, volume: "34.5K TRUST", positions: 245, resolver: "1d", category: "identities" },
  { id: "i5", question: "Top identity by share price changes today?", yes: 23, volume: "56.7K TRUST", positions: 389, resolver: "1d", category: "identities" },
  // Identities - 1m
  { id: "i7", question: "New identity enters top 10 by total assets this month?", yes: 58, volume: "145K TRUST", positions: 712, resolver: "1m", category: "identities" },
  { id: "i8", question: "Total Account atoms exceed 50K this month?", yes: 44, volume: "198K TRUST", positions: 934, resolver: "1m", category: "identities" },
];

const resolverLabels: Record<Resolver, string> = {
  "1h": "1 hour",
  "1d": "1 day",
  "1m": "1 month",
};

const resolverColors: Record<Resolver, string> = {
  "1h": "text-brick",
  "1d": "text-sandy",
  "1m": "text-teal",
};

function MarketCard({ market }: { market: MockMarket }) {
  const no = 100 - market.yes;
  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium text-foreground leading-snug">
          {market.question}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
            <div className="h-full bg-olive" style={{ width: `${market.yes}%` }} />
            <div className="h-full bg-brick" style={{ width: `${no}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-olive/15 text-olive hover:bg-olive/25 border-0 flex-1 h-8 text-xs">
            <ThumbsUp className="w-3 h-3 mr-1" />
            Yes {market.yes}%
          </Button>
          <Button size="sm" className="bg-brick/15 text-brick hover:bg-brick/25 border-0 flex-1 h-8 text-xs">
            <ThumbsDown className="w-3 h-3 mr-1" />
            No {no}%
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" />{market.volume}</span>
            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{market.positions} pos.</span>
          </span>
          <span className={`inline-flex items-center gap-1 ${resolverColors[market.resolver]}`}>
            <Clock className="w-3 h-3" />
            {resolverLabels[market.resolver]}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ResolverSection({ resolver, items }: { resolver: Resolver; items: MockMarket[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className={`w-3.5 h-3.5 ${resolverColors[resolver]}`} />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${resolverColors[resolver]}`}>
          {resolverLabels[resolver]}
        </h3>
      </div>
      <div className="space-y-3">
        {items.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>
    </div>
  );
}

function CategoryColumn({ category, icon: Icon, label, color }: { category: Category; icon: typeof Code; label: string; color: string }) {
  const items = markets.filter((m) => m.category === category);
  const resolvers: Resolver[] = ["1h", "1d", "1m"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="text-base font-bold text-foreground">{label}</h2>
      </div>
      {resolvers.map((r) => {
        const group = items.filter((m) => m.resolver === r);
        if (group.length === 0) return null;
        return <ResolverSection key={r} resolver={r} items={group} />;
      })}
    </div>
  );
}

export default function Market() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Take a position on Intuition Protocol predictions. Backed by TRUST.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CategoryColumn category="contracts" icon={Code} label="Smart Contract" color="text-sandy" />
        <CategoryColumn category="identities" icon={UserCircle} label="Identities" color="text-teal" />
      </div>
    </div>
  );
}
