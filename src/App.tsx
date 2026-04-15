import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { wagmiConfig } from "@/config/wagmi";
import { intuitionTestnet } from "@/config/chains";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import Dashboard from "@/pages/Dashboard";
import AtomDetail from "@/pages/AtomDetail";
import TripleDetail from "@/pages/TripleDetail";
import Market from "@/pages/Market";
import MarketDetail from "@/pages/MarketDetail";
import Portfolio from "@/pages/Portfolio";

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
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#5b8e7d",
        },
        defaultChain: intuitionTestnet,
        supportedChains: [intuitionTestnet],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/market" element={<Market />} />
                <Route path="/market/:id" element={<MarketDetail />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/atoms/:id" element={<AtomDetail />} />
                <Route path="/triples/:id" element={<TripleDetail />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
