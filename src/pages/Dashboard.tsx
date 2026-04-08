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
import {
  Atom,
  Triangle,
  Users,
  Signal,
  Wallet,
  TrendingUp,
  Hash,
  ImageIcon,
  Tag,
  User,
  FileText,
  Link as LinkIcon,
  Box,
} from "lucide-react";
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
import type { AtomVaultRow } from "@/hooks/useAtoms";
import type { TripleVaultRow } from "@/hooks/useTriples";

type SortMode = "sharePrice" | "positionCount";

const atomTypeIcons: Record<string, React.ReactNode> = {
  Account: <User className="w-3.5 h-3.5" />,
  Thing: <Box className="w-3.5 h-3.5" />,
  TextObject: <FileText className="w-3.5 h-3.5" />,
  ImageObject: <ImageIcon className="w-3.5 h-3.5" />,
  Organization: <Users className="w-3.5 h-3.5" />,
  Person: <User className="w-3.5 h-3.5" />,
  URL: <LinkIcon className="w-3.5 h-3.5" />,
};

function AtomTypeIcon({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-teal bg-teal/10 px-1.5 py-0.5 rounded-md font-medium">
      {atomTypeIcons[type] || <Hash className="w-3.5 h-3.5" />}
      {type}
    </span>
  );
}

function AtomLabel({ row }: { row: AtomVaultRow }) {
  const atom = row.term.atom;
  return (
    <Link
      to={`/atoms/${atom.term_id}`}
      className="flex items-center gap-2 hover:underline"
    >
      {atom.image ? (
        <img
          src={atom.image}
          alt=""
          className="w-6 h-6 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-olive/20 flex items-center justify-center">
          <Atom className="w-3.5 h-3.5 text-olive" />
        </div>
      )}
      <span className="truncate max-w-[200px] text-foreground font-medium">
        {atom.label || "Atom"}
      </span>
      <AtomTypeIcon type={atom.type} />
    </Link>
  );
}

function TripleLabel({ row }: { row: TripleVaultRow }) {
  const t = row.term.triple;
  return (
    <Link
      to={`/triples/${t.term_id}`}
      className="flex items-center gap-1.5 hover:underline flex-wrap"
    >
      <span className="truncate max-w-[120px] text-olive font-medium">
        {t.subject.label || `#${t.subject.term_id.slice(0, 8)}`}
      </span>
      <Tag className="w-3.5 h-3.5 text-sandy shrink-0" />
      <span className="truncate max-w-[120px] text-sandy">
        {t.predicate.label || `#${t.predicate.term_id.slice(0, 8)}`}
      </span>
      <TrendingUp className="w-3.5 h-3.5 text-teal shrink-0" />
      <span className="truncate max-w-[120px] text-teal font-medium">
        {t.object.label || `#${t.object.term_id.slice(0, 8)}`}
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
              <Card key={s.label}>
                <CardHeader className="pb-2 flex flex-row items-center gap-2">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <CardDescription>{s.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCompact(stats.data[s.key])}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Wallet className="w-4 h-4 text-olive" />
              <CardDescription>TVL</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatEth(stats.data.contract_balance)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Atoms + Triples side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atoms Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Atom className="w-5 h-5 text-olive" />
                Top 10 Atoms
              </CardTitle>
              <Tabs
                value={atomSort}
                onValueChange={(v) => setAtomSort(v as SortMode)}
              >
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
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <AtomLabel row={row} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-olive text-sm">
                          {formatSharePrice(row.current_share_price)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(row.position_count)}
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
              <CardTitle className="flex items-center gap-2 text-base">
                <Triangle className="w-5 h-5 text-teal" />
                Top 10 Triples
              </CardTitle>
              <Tabs
                value={tripleSort}
                onValueChange={(v) => setTripleSort(v as SortMode)}
              >
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
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <TripleLabel row={row} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-olive text-sm">
                          {formatSharePrice(row.current_share_price)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(row.position_count)}
                        </TableCell>
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
