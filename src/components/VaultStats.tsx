import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Wallet, TrendingUp, Coins, Users } from "lucide-react";
import { formatEth, formatSharePrice, formatNumber } from "@/lib/format";

interface VaultStatsProps {
  totalAssets: string;
  currentSharePrice?: string;
  totalShares: string;
  positionCount: number;
  columns?: 3 | 4;
}

export function VaultStats({
  totalAssets,
  currentSharePrice,
  totalShares,
  positionCount,
  columns = 4,
}: VaultStatsProps) {
  const items = [
    {
      icon: <Wallet className="w-4 h-4 text-olive" />,
      label: "Total Assets",
      value: formatEth(totalAssets),
      color: "text-olive",
    },
    ...(currentSharePrice
      ? [
          {
            icon: <TrendingUp className="w-4 h-4 text-teal" />,
            label: "Share Price",
            value: `${formatSharePrice(currentSharePrice)} TRUST`,
            color: "text-teal",
          },
        ]
      : []),
    {
      icon: <Coins className="w-4 h-4 text-sandy" />,
      label: "Total Shares",
      value: formatSharePrice(totalShares),
      color: "text-sandy",
    },
    {
      icon: <Users className="w-4 h-4 text-gold" />,
      label: "Positions",
      value: formatNumber(positionCount),
      color: "text-gold",
    },
  ];

  return (
    <div
      className={`grid grid-cols-2 ${
        columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3"
      } gap-4`}
    >
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            {item.icon}
            <CardDescription>{item.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
