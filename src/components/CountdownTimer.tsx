import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "Resolved";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function CountdownTimer({
  deadline,
  className = "",
}: {
  deadline: number;
  className?: string;
}) {
  const [timeLeft, setTimeLeft] = useState(deadline - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(deadline - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const isUrgent = timeLeft > 0 && timeLeft < 3_600_000;
  const isExpired = timeLeft <= 0;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono ${
        isExpired
          ? "text-muted-foreground"
          : isUrgent
          ? "text-brick"
          : "text-sandy"
      } ${className}`}
    >
      <Clock className="w-3 h-3" />
      {formatTimeLeft(timeLeft)}
    </span>
  );
}
