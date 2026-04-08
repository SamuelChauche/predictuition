import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Atom, Triangle, Users, Signal, Wallet, TrendingUp } from "lucide-react";
import {
  useTopAtomsBySharePrice,
  useTopAtomsByPositionCount,
} from "@/hooks/useAtoms";
import {
  useTopTriplesBySharePrice,
  useTopTriplesByPositionCount,
} from "@/hooks/useTriples";
import { useProtocolStats } from "@/hooks/useStats";
import { formatSharePrice, formatNumber, formatEth, formatCompact } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { AtomLabel } from "@/components/AtomLabel";
import { TripleLabel } from "@/components/TripleLabel";
import { LoadingTable } from "@/components/LoadingTable";

type SortMode = "sharePrice" | "positionCount";

const statConfig = [
  { label: "Atoms", key: "total_atoms" as const, icon: Atom, color: "text-olive" },
  { label: "Triples", key: "total_triples" as const, icon: Triangle, color: "text-teal" },
  { label: "Positions", key: "total_positions" as const, icon: TrendingUp, color: "text-sandy" },
  { label: "Signals", key: "total_signals" as const, icon: Signal, color: "text-gold" },
  { label: "Accounts", key: "total_accounts" as const, icon: Users, color: "text-brick" },
] as const;

export default function Dashboard() {
  const [atomSort, setAtomSort] = useState<SortMode>("sharePrice");
  const [tripleSort, setTripleSort] = useState<SortMode>("sharePrice");

  const atomsByPrice = useTopAtomsBySharePrice(10);
  const atomsByCount = useTopAtomsByPositionCount(10);
  const triplesByPrice = useTopTriplesBySharePrice(10);
  const triplesByCount = useTopTriplesByPositionCount(10);
  const stats = useProtocolStats();

  const atoms = atomSort === "sharePrice" ? atomsByPrice : atomsByCount;
  const triples = tripleSort === "sharePrice" ? triplesByPrice : triplesByCount;

  return (
    <div className="space-y-6">
      {/* Protocol Stats */}
      {stats.data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statConfig.map((s) => {
            const Icon = s.icon;
            return (
              <StatCard
                key={s.label}
                icon={<Icon className={`w-4 h-4 ${s.color}`} />}
                label={s.label}
                compact={formatCompact(stats.data[s.key])}
                full={formatNumber(stats.data[s.key])}
              />
            );
          })}
          <StatCard
            icon={<Wallet className="w-4 h-4 text-olive" />}
            label="TVL"
            compact={formatEth(stats.data.contract_balance)}
            full={formatEth(stats.data.contract_balance)}
          />
        </div>
      )}

      {/* Atoms + Triples side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Atom className="w-5 h-5 text-olive" />
                Top 10 Atoms
              </CardTitle>
              <Tabs value={atomSort} onValueChange={(v) => setAtomSort(v as SortMode)}>
                <TabsList>
                  <TabsTrigger value="sharePrice">Share</TabsTrigger>
                  <TabsTrigger value="positionCount">Trust</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {atoms.isLoading && <LoadingTable />}
            {atoms.error && (
              <Alert variant="destructive">
                <AlertDescription>Failed to load atoms.</AlertDescription>
              </Alert>
            )}
            {atoms.data && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Atom</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Pos.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atoms.data.map((row, i) => (
                      <TableRow key={row.term_id}>
                        <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                        <TableCell><AtomLabel row={row} /></TableCell>
                        <TableCell className="text-right font-mono text-olive text-sm">{formatSharePrice(row.current_share_price)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(row.position_count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Triangle className="w-5 h-5 text-teal" />
                Top 10 Triples
              </CardTitle>
              <Tabs value={tripleSort} onValueChange={(v) => setTripleSort(v as SortMode)}>
                <TabsList>
                  <TabsTrigger value="sharePrice">Share</TabsTrigger>
                  <TabsTrigger value="positionCount">Trust</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {triples.isLoading && <LoadingTable />}
            {triples.error && (
              <Alert variant="destructive">
                <AlertDescription>Failed to load triples.</AlertDescription>
              </Alert>
            )}
            {triples.data && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Triple</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Pos.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triples.data.map((row, i) => (
                      <TableRow key={row.term_id}>
                        <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                        <TableCell><TripleLabel row={row} /></TableCell>
                        <TableCell className="text-right font-mono text-olive text-sm">{formatSharePrice(row.current_share_price)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(row.position_count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
