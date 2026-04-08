import { useParams, Link } from "react-router-dom";
import { useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  useAtomDetail,
  useSharePriceHistory,
  usePositionChangeDaily,
} from "@/hooks/useAtoms";
import {
  formatEth,
  formatSharePrice,
  formatNumber,
  shortenAddress,
} from "@/lib/format";

export default function AtomDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAtomDetail(id!);
  const priceHistory = useSharePriceHistory(id);
  const positionHistory = usePositionChangeDaily(id);

  const atom = data?.atom;
  const vault = data?.vaults?.[0];
  const positions = data?.positions;

  const priceChartData = useMemo(() => {
    if (!priceHistory.data) return [];
    return priceHistory.data.map((p) => ({
      date: new Date(Number(p.block_timestamp) * 1000).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      price: Number(p.share_price) / 1e18,
    }));
  }, [priceHistory.data]);

  const positionChartData = useMemo(() => {
    if (!positionHistory.data) return [];
    let cumulative = 0;
    return positionHistory.data.map((p) => {
      cumulative += p.transaction_count;
      return {
        date: new Date(p.bucket).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        positions: cumulative,
      };
    });
  }, [positionHistory.data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] w-full" />
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="outline" size="sm">Back</Button>
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {atom.emoji && <span className="text-3xl">{atom.emoji}</span>}
          {atom.image && (
            <img
              src={atom.image}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          )}
          {atom.label || "Atom"}
          <Badge variant="outline">{atom.type}</Badge>
        </h1>
      </div>

      {/* Metadata + Vault Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-xs truncate max-w-[200px]">
                {atom.term_id}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Creator</span>
              <span className="font-mono">
                {shortenAddress(atom.creator_id)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>
                {new Date(atom.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{atom.type}</span>
            </div>
          </CardContent>
        </Card>

        {vault && (
          <Card>
            <CardHeader>
              <CardTitle>Vault Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Assets</span>
                <span className="font-mono">
                  {formatEth(vault.total_assets)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Share Price</span>
                <span className="font-mono">
                  {formatSharePrice(vault.current_share_price)} ETH
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Shares</span>
                <span className="font-mono">
                  {formatNumber(vault.total_shares)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Positions</span>
                <span>{formatNumber(vault.position_count)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Share Price Chart */}
      {priceChartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Share Price Over Time</CardTitle>
            <CardDescription>ETH per share</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceChartData}>
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
                  formatter={(value) => [
                    `${Number(value).toFixed(4)} ETH`,
                    "Price",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Positions Over Time */}
      {positionChartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Positions Over Time</CardTitle>
            <CardDescription>Cumulative position activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={positionChartData}>
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
                <Line
                  type="monotone"
                  dataKey="positions"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          {vault && (
            <CardDescription>
              {formatNumber(vault.position_count)} total positions
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
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono">
                        {pos.account.label || shortenAddress(pos.account.id)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
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
