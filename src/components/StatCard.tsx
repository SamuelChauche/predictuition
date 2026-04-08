import { useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  compact: string;
  full: string;
}

export function StatCard({ icon, label, compact, full }: StatCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <Card
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        {icon}
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold cursor-default">
          {hovered ? full : compact}
        </p>
      </CardContent>
    </Card>
  );
}
