import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, Clock, Trophy } from "lucide-react";

interface MockBet {
  id: string;
  question: string;
  side: "yes" | "no";
  sideLabel: string;
  amount: number;
  potentialPayout: number;
  status: "active" | "won" | "lost";
  deadline: string;
}

const mockBets: MockBet[] = [
  {
    id: "1",
    question: "Will Trust Card share price go UP in the next 24 hours?",
    side: "yes",
    sideLabel: "Higher",
    amount: 10,
    potentialPayout: 18.4,
    status: "active",
    deadline: "Apr 9, 00:00 UTC",
  },
  {
    id: "2",
    question: 'Will "calebnftgod.eth has tag Top Intuition Community Members" gain more trust?',
    side: "no",
    sideLabel: "Bearish",
    amount: 5,
    potentialPayout: 12.1,
    status: "active",
    deadline: "Apr 9, 00:00 UTC",
  },
  {
    id: "3",
    question: "Will intuitionbilly.eth share price go UP in the next hour?",
    side: "yes",
    sideLabel: "Higher",
    amount: 2,
    potentialPayout: 3.6,
    status: "won",
    deadline: "Apr 8, 12:00 UTC",
  },
  {
    id: "4",
    question: "jeblinsky.eth share price change: above or below +5%?",
    side: "no",
    sideLabel: "< +5%",
    amount: 8,
    potentialPayout: 0,
    status: "lost",
    deadline: "Apr 7, 00:00 UTC",
  },
];

function BetRow({ bet }: { bet: MockBet }) {
  const isActive = bet.status === "active";
  const isWon = bet.status === "won";
  const statusColor = isActive ? "text-sandy" : isWon ? "text-[#90D18D]" : "text-[#bc4b51]";
  const StatusIcon = isActive ? Clock : isWon ? Trophy : TrendingDown;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <StatusIcon className={`w-4 h-4 shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{bet.question}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span className={bet.side === "yes" ? "text-[#90D18D]" : "text-[#bc4b51]"}>
            {bet.sideLabel}
          </span>
          <span>&middot;</span>
          <span>{bet.deadline}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-medium">{bet.amount} TRUST</p>
        {isActive && (
          <p className="text-xs font-mono text-[#90D18D]">→ {bet.potentialPayout.toFixed(1)}</p>
        )}
        {isWon && (
          <p className="text-xs font-mono text-[#90D18D]">+{(bet.potentialPayout - bet.amount).toFixed(1)}</p>
        )}
        {bet.status === "lost" && (
          <p className="text-xs font-mono text-[#bc4b51]">-{bet.amount.toFixed(1)}</p>
        )}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const activeBets = mockBets.filter((b) => b.status === "active");
  const resolvedBets = mockBets.filter((b) => b.status !== "active");
  const totalStaked = activeBets.reduce((s, b) => s + b.amount, 0);
  const totalWon = resolvedBets
    .filter((b) => b.status === "won")
    .reduce((s, b) => s + b.potentialPayout - b.amount, 0);
  const totalLost = resolvedBets
    .filter((b) => b.status === "lost")
    .reduce((s, b) => s + b.amount, 0);
  const pnl = totalWon - totalLost;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your positions and betting history.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Wallet className="w-4 h-4 text-olive" />
            <CardDescription>Active Stake</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-olive">{totalStaked} TRUST</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Clock className="w-4 h-4 text-sandy" />
            <CardDescription>Active Bets</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-sandy">{activeBets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" />
            <CardDescription>Won</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-gold">+{totalWon.toFixed(1)} TRUST</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${pnl >= 0 ? "text-[#90D18D]" : "text-[#bc4b51]"}`} />
            <CardDescription>PnL</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${pnl >= 0 ? "text-[#90D18D]" : "text-[#bc4b51]"}`}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)} TRUST
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Bets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-sandy" />
            Active Bets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeBets.length > 0 ? (
            activeBets.map((b) => <BetRow key={b.id} bet={b} />)
          ) : (
            <p className="text-muted-foreground text-sm">No active bets.</p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gold" />
            History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {resolvedBets.length > 0 ? (
            resolvedBets.map((b) => <BetRow key={b.id} bet={b} />)
          ) : (
            <p className="text-muted-foreground text-sm">No resolved bets yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button variant="outline" disabled>
          <Wallet className="w-4 h-4 mr-1" />
          Connect wallet to see your real positions
        </Button>
      </div>
    </div>
  );
}
