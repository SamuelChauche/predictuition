import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Triangle } from "lucide-react";
import Dashboard from "@/pages/Dashboard";
import AtomDetail from "@/pages/AtomDetail";
import TripleDetail from "@/pages/TripleDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Triangle className="w-6 h-6 text-olive" />
            <span className="text-foreground">Predict</span>
            <span className="text-olive">uition</span>
          </Link>
          <span className="text-sm text-muted-foreground">
            Intuition Protocol Explorer
          </span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">{children}</main>
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
            <Route path="/atoms/:id" element={<AtomDetail />} />
            <Route path="/triples/:id" element={<TripleDetail />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
