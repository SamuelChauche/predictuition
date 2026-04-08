import { Link, useLocation } from "react-router-dom";
import { Triangle, Wallet, LayoutDashboard, TrendingUp, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/market", label: "Market", icon: TrendingUp },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
];

export function MobileNav() {
  const location = useLocation();
  return (
    <div className="md:hidden border-b border-border bg-card flex items-center justify-between px-4 py-3">
      <Link to="/" className="text-lg font-bold tracking-tight flex items-center gap-2">
        <Triangle className="w-5 h-5 text-olive" />
        <span className="text-foreground">Predict</span>
        <span className="text-olive">uition</span>
      </Link>
      <div className="flex items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.to === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "p-2 rounded-lg transition-colors",
                active ? "bg-olive/15 text-olive" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
            </Link>
          );
        })}
        <Button variant="default" size="sm" className="bg-olive hover:bg-olive/80 text-black font-medium ml-1">
          <Wallet className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
