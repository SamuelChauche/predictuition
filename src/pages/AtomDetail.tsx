import { useParams, Link } from "react-router-dom";
import { useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Atom,
  Wallet,
  TrendingUp,
  Coins,
  Users,
  User,
  FileText,
  ImageIcon,
  Hash,
  Box,
  Link as LinkIcon,
  Calendar,
} from "lucide-react";
import {
  useAtomDetail,
  useSharePriceHistory,
} from "@/hooks/useAtoms";
import {
  formatEth,
  formatSharePrice,
  formatNumber,
  shortenAddress,
  formatDate,
} from "@/lib/format";

const atomTypeIcons: Record<string, React.ReactNode> = {
  Account: <User className="w-4 h-4" />,
  Thing: <Box className="w-4 h-4" />,
  TextObject: <FileText className="w-4 h-4" />,
  ImageObject: <ImageIcon className="w-4 h-4" />,
  Organization: <Users className="w-4 h-4" />,
  Person: <User className="w-4 h-4" />,
  URL: <LinkIcon className="w-4 h-4" />,
};

type TimeRange = "1h" | "4h" | "1d" | "1w" | "1m";

const timeRangeMs: Record<TimeRange, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1m": 2_592_000_000,
};

export default function AtomDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAtomDetail(id!);
  const priceHistory = useSharePriceHistory(id);
  const [timeRange, setTimeRange] = useState<TimeRange>("1m");

  const atom = data?.atom;
  const vault = data?.vaults?.[0];
  const positions = data?.positions?.slice(0, 10);

  const chartData = useMemo(() => {
    if (!priceHistory.data) return [];
    const now = Date.now();
    const cutoff = now - timeRangeMs[timeRange];
    const filtered = priceHistory.data.filter(
      (p) => Number(p.block_timestamp) * 1000 >= cutoff
    );
    return filtered.map((p) => ({
      date: new Date(Number(p.block_timestamp) * 1000).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      price: Number(p.share_price) / 1e18,
    }));
  }, [priceHistory.data, timeRange]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (error || !atom) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load atom.{" "}
          <Link to="/" className="underline">
            Back to dashboard
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const tooltipStyle = {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--foreground)",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          {atom.image ? (
            <img
              src={atom.image}
              alt=""
              className="w-10 h-10 rounded-full object-cover ring-2 ring-olive/30"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-olive/20 flex items-center justify-center">
              <Atom className="w-5 h-5 text-olive" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {atom.label || "Atom"}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 text-teal">
                {atomTypeIcons[atom.type] || <Hash className="w-3.5 h-3.5" />}
                {atom.type}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {shortenAddress(atom.creator_id)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(atom.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Vault Stats Cards */}
      {vault && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Wallet className="w-4 h-4 text-olive" />
              <CardDescription>Total Assets</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-olive">
                {formatEth(vault.total_assets)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal" />
              <CardDescription>Share Price</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-teal">
                {formatSharePrice(vault.current_share_price)} TRUST
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Coins className="w-4 h-4 text-sandy" />
              <CardDescription>Total Shares</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-sandy">
                {formatSharePrice(vault.total_shares)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <CardDescription>Positions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gold">
                {formatNumber(vault.position_count)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {priceHistory.data && priceHistory.data.length > 1 && (
        <div className="space-y-4">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <TabsList>
              <TabsTrigger value="1h">1H</TabsTrigger>
              <TabsTrigger value="4h">4H</TabsTrigger>
              <TabsTrigger value="1d">1D</TabsTrigger>
              <TabsTrigger value="1w">1W</TabsTrigger>
              <TabsTrigger value="1m">1M</TabsTrigger>
            </TabsList>
          </Tabs>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-olive" />
              Share Price Over Time
            </CardTitle>
            <CardDescription>TRUST per share</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    `${Number(value).toFixed(4)} TRUST`,
                    "Price",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--olive)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-sandy" />
            Top Positions
          </CardTitle>
          {vault && (
            <CardDescription>
              {formatNumber(vault.position_count)} total positions (showing top 10)
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {positions && positions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((pos, i) => (
                    <TableRow key={pos.id}>
                      <TableCell className="text-muted-foreground font-mono">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono">
                        {pos.account.label || shortenAddress(pos.account.id)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-olive">
                        {formatSharePrice(pos.shares)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No positions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
