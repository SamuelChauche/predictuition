import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Triangle, Wallet, LayoutDashboard, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Dashboard from "@/pages/Dashboard";
import AtomDetail from "@/pages/AtomDetail";
import TripleDetail from "@/pages/TripleDetail";
import Market from "@/pages/Market";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/market", label: "Market", icon: TrendingUp },
];

function Sidebar() {
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
      <div className="p-3 border-t border-border">
        <Button variant="default" size="sm" className="w-full bg-olive hover:bg-olive/80 text-black font-medium">
          <Wallet className="w-4 h-4 mr-1" />
          Connect Wallet
        </Button>
      </div>
    </aside>
  );
}

function MobileNav() {
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

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <MobileNav />
        <main className="flex-1 px-6 py-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/market" element={<Market />} />
            <Route path="/atoms/:id" element={<AtomDetail />} />
            <Route path="/triples/:id" element={<TripleDetail />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
