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
import { Users } from "lucide-react";
import { formatSharePrice, formatNumber, shortenAddress } from "@/lib/format";
import type { PositionData } from "@/hooks/useAtoms";

interface PositionsTableProps {
  positions: PositionData[] | undefined;
  positionCount: number | undefined;
}

export function PositionsTable({ positions, positionCount }: PositionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-sandy" />
          Top Positions
        </CardTitle>
        {positionCount != null && (
          <CardDescription>
            {formatNumber(positionCount)} total positions (showing top 10)
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
  );
}
