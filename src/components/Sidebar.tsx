import { Link, useLocation } from "react-router-dom";
import { Triangle, LayoutDashboard, TrendingUp, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/market", label: "Market", icon: TrendingUp },
  { to: "/portfolio", label: "My Portfolio", icon: Briefcase },
];

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card hidden md:flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <Link to="/" className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Triangle className="w-5 h-5 text-olive" />
          <span className="text-foreground">Predict</span>
          <span className="text-olive">uition</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
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
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-olive/15 text-olive"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
