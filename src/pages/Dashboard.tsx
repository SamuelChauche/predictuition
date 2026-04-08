import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useTopAtomsBySharePrice,
  useTopAtomsByPositionCount,
} from "@/hooks/useAtoms";
import {
  useTopTriplesBySharePrice,
  useTopTriplesByPositionCount,
} from "@/hooks/useTriples";
import { useProtocolStats, useActivityChart } from "@/hooks/useStats";
import { formatSharePrice, formatNumber, formatEth } from "@/lib/format";
import type { AtomVaultRow } from "@/hooks/useAtoms";
import type { TripleVaultRow } from "@/hooks/useTriples";

type SortMode = "sharePrice" | "positionCount";

function AtomLabel({ row }: { row: AtomVaultRow }) {
  const atom = row.term.atom;
  return (
    <Link
      to={`/atoms/${atom.term_id}`}
      className="flex items-center gap-2 hover:underline"
    >
      {atom.emoji && <span>{atom.emoji}</span>}
      {atom.image && (
        <img
          src={atom.image}
          alt=""
          className="w-6 h-6 rounded-full object-cover"
        />
      )}
      <span className="truncate max-w-[200px]">
        {atom.label || `Atom`}
      </span>
      <Badge variant="outline" className="text-xs shrink-0">
        {atom.type}
      </Badge>
    </Link>
  );
}

function TripleLabel({ row }: { row: TripleVaultRow }) {
  const t = row.term.triple;
  return (
    <Link
      to={`/triples/${t.term_id}`}
      className="flex items-center gap-1 hover:underline flex-wrap"
    >
      <span className="truncate max-w-[120px] text-primary">
        {t.subject.emoji} {t.subject.label || `#${t.subject.term_id.slice(0, 8)}`}
      </span>
      <span className="text-muted-foreground mx-1">→</span>
      <span className="truncate max-w-[120px] text-muted-foreground">
        {t.predicate.emoji} {t.predicate.label || `#${t.predicate.term_id.slice(0, 8)}`}
      </span>
      <span className="text-muted-foreground mx-1">→</span>
      <span className="truncate max-w-[120px] text-primary">
        {t.object.emoji} {t.object.label || `#${t.object.term_id.slice(0, 8)}`}
      </span>
    </Link>
  );
}

function LoadingTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [atomSort, setAtomSort] = useState<SortMode>("sharePrice");
  const [tripleSort, setTripleSort] = useState<SortMode>("sharePrice");

  const atomsByPrice = useTopAtomsBySharePrice(10);
  const atomsByCount = useTopAtomsByPositionCount(10);
  const triplesByPrice = useTopTriplesBySharePrice(10);
  const triplesByCount = useTopTriplesByPositionCount(10);
  const stats = useProtocolStats();
  const activity = useActivityChart();

  const atoms = atomSort === "sharePrice" ? atomsByPrice : atomsByCount;
  const triples = tripleSort === "sharePrice" ? triplesByPrice : triplesByCount;

  return (
    <div className="space-y-6">
      {/* Protocol Stats */}
      {stats.data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Atoms", value: formatNumber(stats.data.total_atoms) },
            { label: "Triples", value: formatNumber(stats.data.total_triples) },
            { label: "Positions", value: formatNumber(stats.data.total_positions) },
            { label: "Signals", value: formatNumber(stats.data.total_signals) },
            { label: "Accounts", value: formatNumber(stats.data.total_accounts) },
            { label: "TVL", value: formatEth(stats.data.contract_balance) },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardDescription>{s.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Atoms Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Top 10 Atoms</CardTitle>
            <Tabs
              value={atomSort}
              onValueChange={(v) => setAtomSort(v as SortMode)}
            >
              <TabsList>
                <TabsTrigger value="sharePrice">Share Price</TabsTrigger>
                <TabsTrigger value="positionCount">Trust Count</TabsTrigger>
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
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Atom</TableHead>
                    <TableHead className="text-right">Share Price (ETH)</TableHead>
                    <TableHead className="text-right">Positions</TableHead>
                    <TableHead className="text-right">Total Assets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atoms.data.map((row, i) => (
                    <TableRow key={row.term_id}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <AtomLabel row={row} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSharePrice(row.current_share_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(row.position_count)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatEth(row.total_assets)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Triples Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Top 10 Triples</CardTitle>
            <Tabs
              value={tripleSort}
              onValueChange={(v) => setTripleSort(v as SortMode)}
            >
              <TabsList>
                <TabsTrigger value="sharePrice">Share Price</TabsTrigger>
                <TabsTrigger value="positionCount">Trust Count</TabsTrigger>
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
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Triple</TableHead>
                    <TableHead className="text-right">Share Price (ETH)</TableHead>
                    <TableHead className="text-right">Positions</TableHead>
                    <TableHead className="text-right">Total Assets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {triples.data.map((row, i) => (
                    <TableRow key={row.term_id}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <TripleLabel row={row} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSharePrice(row.current_share_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(row.position_count)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatEth(row.total_assets)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Signals per day</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.isLoading && <Skeleton className="h-[300px] w-full" />}
          {activity.error && (
            <Alert variant="destructive">
              <AlertDescription>Failed to load activity.</AlertDescription>
            </Alert>
          )}
          {activity.data && activity.data.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={activity.data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--foreground)",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
