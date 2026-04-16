import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { testnetClient } from "@/lib/client";
import { SEARCH_TARGETS, SEARCH_TARGET_BY_ID } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import {
  Plus,
  X,
  ArrowRightLeft,
  RefreshCw,
  AlertTriangle,
  Search,
} from "lucide-react";
import {
  MARKET_FACTORY_ADDRESS,
  MARKET_FACTORY_ABI,
  CONDITION_LABELS,
  TESTNET_CHAIN_ID,
} from "@/lib/contracts";

const FACTORY_ADDR = MARKET_FACTORY_ADDRESS[TESTNET_CHAIN_ID]!;

const DEADLINE_PRESETS = [
  { label: "1 hour",   seconds: 3600 },
  { label: "6 hours",  seconds: 6 * 3600 },
  { label: "24 hours", seconds: 24 * 3600 },
  { label: "7 days",   seconds: 7 * 24 * 3600 },
  { label: "30 days",  seconds: 30 * 24 * 3600 },
];

const LOCK_PRESETS = [
  { label: "5 min",  seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "1 hour", seconds: 3600 },
];

interface AtomResult {
  term_id: string;
  label: string | null;
  image: string | null;
  type: string;
}

interface TripleResult {
  term_id: string;
  subject: { label: string | null; image: string | null; term_id: string };
  predicate: { label: string | null; term_id: string };
  object: { label: string | null; image: string | null; term_id: string };
}

interface VaultRow {
  term_id: string;
  term: {
    atom: AtomResult | null;
    triple: TripleResult | null;
  };
}

interface SelectedTarget {
  termId: string;
  label: string;
  image: string | null;
  kind: "atom" | "triple";
}

function tripleLabel(t: TripleResult): string {
  return `${t.subject.label ?? "?"} ${t.predicate.label ?? "→"} ${t.object.label ?? "?"}`;
}

function shortId(id: string): string {
  if (id.startsWith("0x") && id.length > 12) {
    return `${id.slice(0, 8)}…${id.slice(-4)}`;
  }
  return id;
}

// On testnet, term_id is already a 32-byte hex string — pass it directly as bytes32
function termIdToBytes32(termId: string): `0x${string}` {
  if (termId.startsWith("0x")) return termId.toLowerCase() as `0x${string}`;
  return `0x${BigInt(termId).toString(16).padStart(64, "0")}` as `0x${string}`;
}

interface Props {
  onCreated: () => void;
}

export function CreateMarketForm({ onCreated }: Props) {
  const [open, setOpen] = useState(false);

  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isOnTestnet = chain?.id === TESTNET_CHAIN_ID;

  const { data: bondData } = useReadContract({
    address: FACTORY_ADDR,
    abi: MARKET_FACTORY_ABI,
    functionName: "creationBond",
    chainId: TESTNET_CHAIN_ID,
  });
  const bond = (bondData ?? 0n) as bigint;

  // ── Target search ────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const isNumericId = /^\d+$/.test(debouncedSearch);

  // Search by label
  const { data: labelData, isFetching: labelFetching } = useQuery({
    queryKey: ["targetSearch", debouncedSearch],
    queryFn: () =>
      testnetClient.request<{ atomVaults: VaultRow[]; tripleVaults: VaultRow[] }>(
        SEARCH_TARGETS,
        { q: `%${debouncedSearch}%`, limit: 5 }
      ),
    enabled: debouncedSearch.length >= 2 && !isNumericId,
    staleTime: 30_000,
  });

  // Search by numeric ID
  const { data: idData, isFetching: idFetching } = useQuery({
    queryKey: ["targetById", debouncedSearch],
    queryFn: () =>
      testnetClient.request<{ vaults: VaultRow[] }>(
        SEARCH_TARGET_BY_ID,
        { termId: debouncedSearch }
      ),
    enabled: isNumericId,
    staleTime: 30_000,
  });

  const searchFetching = isNumericId ? idFetching : labelFetching;

  // Normalize results to flat atom/triple arrays
  const atoms: AtomResult[] = isNumericId
    ? (idData?.vaults ?? []).flatMap((v) => v.term.atom ? [v.term.atom] : [])
    : (labelData?.atomVaults ?? []).flatMap((v) => v.term.atom ? [v.term.atom] : []);

  const triples: TripleResult[] = isNumericId
    ? (idData?.vaults ?? []).flatMap((v) => v.term.triple ? [v.term.triple] : [])
    : (labelData?.tripleVaults ?? []).flatMap((v) => v.term.triple ? [v.term.triple] : []);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const hasResults = atoms.length > 0 || triples.length > 0;

  function pickAtom(a: AtomResult) {
    setSelected({ termId: a.term_id, label: a.label ?? `Atom #${a.term_id}`, image: a.image, kind: "atom" });
    setSearchInput(a.label ?? "");
    setShowDropdown(false);
  }

  function pickTriple(t: TripleResult) {
    const lbl = tripleLabel(t);
    setSelected({ termId: t.term_id, label: lbl, image: t.subject.image, kind: "triple" });
    setSearchInput(lbl);
    setShowDropdown(false);
  }

  // ── Form state ───────────────────────────────────────────────────────────────
  const [conditionType, setConditionType] = useState<number>(1);
  const [curveId, setCurveId]             = useState<1 | 2>(1);
  const [targetValue, setTargetValue]     = useState("");
  const [deadlinePreset, setDeadlinePreset] = useState(DEADLINE_PRESETS[2]);
  const [lockPreset, setLockPreset]         = useState(LOCK_PRESETS[0]);

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const txBusy = isPending || isConfirming;

  function encodeTargetValue(): bigint {
    const v = targetValue.trim();
    if (!v) return 0n;
    if (conditionType === 5) return BigInt(Math.round(parseFloat(v) * 100));
    return parseEther(v);
  }

  function handleCreate() {
    if (!selected) return;
    const now = Math.floor(Date.now() / 1000);
    writeContract({
      address: FACTORY_ADDR,
      abi: MARKET_FACTORY_ABI,
      functionName: "createMarket",
      args: [
        conditionType,
        termIdToBytes32(selected.termId),
        BigInt(curveId),
        encodeTargetValue(),
        BigInt(now + deadlinePreset.seconds),
        BigInt(lockPreset.seconds),
      ],
      value: bond,
      chainId: TESTNET_CHAIN_ID,
    });
  }

  if (isSuccess) {
    onCreated();
    reset();
    setOpen(false);
    setSelected(null);
    setSearchInput("");
    setTargetValue("");
  }

  const canSubmit = !!selected && targetValue.trim().length > 0 && !txBusy;

  function closeModal() {
    setOpen(false);
    reset();
  }

  const modal = open ? createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto rounded-xl border border-teal/30 bg-background shadow-2xl">
        <div className="p-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">New On-Chain Market</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Deploy a prediction market on Intuition Testnet</p>
            </div>
            <button
              onClick={closeModal}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Target search */}
          <div className="space-y-1.5" ref={searchRef}>
            <label className="text-xs text-muted-foreground font-medium">
              Atom or Triple
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search Intuition atoms & triples…"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setSelected(null);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full h-9 rounded-md bg-background border border-border pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/50"
              />
              {searchFetching && (
                <RefreshCw className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground animate-spin" />
              )}
            </div>

            {/* Selected badge */}
            {selected && (
              <div className="flex items-center gap-2 rounded-md bg-teal/10 border border-teal/30 px-2.5 py-1.5">
                {selected.image && (
                  <img src={selected.image} alt="" className="w-5 h-5 rounded-full object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <span className="text-xs text-teal font-medium truncate">{selected.label}</span>
                <span className="text-xs text-muted-foreground font-mono ml-auto shrink-0">#{shortId(selected.termId)}</span>
                <button onClick={() => { setSelected(null); setSearchInput(""); }}
                  className="ml-1 text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Dropdown */}
            {showDropdown && !selected && debouncedSearch.length >= 2 && (
              <div className="rounded-lg border border-border bg-background shadow-lg max-h-52 overflow-y-auto">
                {!hasResults && !searchFetching && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No results for "{debouncedSearch}"</p>
                )}
                {atoms.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atoms</p>
                    {atoms.map((a) => (
                      <button key={a.term_id} onMouseDown={() => pickAtom(a)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left">
                        {a.image
                          ? <img src={a.image} alt="" className="w-6 h-6 rounded-full object-cover shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : <div className="w-6 h-6 rounded-full bg-muted-foreground/20 shrink-0" />
                        }
                        <span className="text-sm text-foreground truncate flex-1 min-w-0">{a.label ?? `Atom #${shortId(a.term_id)}`}</span>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">#{shortId(a.term_id)}</span>
                      </button>
                    ))}
                  </>
                )}
                {triples.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Triples</p>
                    {triples.map((t) => (
                      <button key={t.term_id} onMouseDown={() => pickTriple(t)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left">
                        {t.subject.image
                          ? <img src={t.subject.image} alt="" className="w-6 h-6 rounded-full object-cover shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : <div className="w-6 h-6 rounded-full bg-muted-foreground/20 shrink-0" />
                        }
                        <span className="text-sm text-foreground truncate flex-1 min-w-0">{tripleLabel(t)}</span>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">#{shortId(t.term_id)}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Condition type */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Condition</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                <button key={k} onClick={() => setConditionType(Number(k))}
                  className={`h-8 rounded-md text-xs font-medium transition-colors border ${
                    conditionType === Number(k)
                      ? "bg-teal/20 border-teal text-teal"
                      : "bg-muted border-border text-muted-foreground hover:border-teal/40"
                  }`}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          {/* Bonding curve */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Bonding curve</label>
            <div className="flex gap-1.5">
              {([1, 2] as const).map((id) => (
                <button key={id} onClick={() => setCurveId(id)}
                  className={`flex-1 h-8 rounded-md text-xs font-medium transition-colors border ${
                    curveId === id
                      ? "bg-teal/20 border-teal text-teal"
                      : "bg-muted border-border text-muted-foreground hover:border-teal/40"
                  }`}>
                  {id === 1 ? "Linear" : "Exponential"}
                </button>
              ))}
            </div>
          </div>

          {/* Threshold */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              Threshold
              <span className="ml-1 font-normal text-muted-foreground/60">
                {conditionType === 5 ? "(% e.g. 60 for 60%)" : "(TRUST amount)"}
              </span>
            </label>
            <div className="relative">
              <input type="number" min="0" step={conditionType === 5 ? "1" : "0.001"}
                placeholder={conditionType === 5 ? "60" : "0.000"}
                value={targetValue} onChange={(e) => setTargetValue(e.target.value)}
                className="w-full h-9 rounded-md bg-background border border-border px-3 pr-16 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/50" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {conditionType === 5 ? "%" : "TRUST"}
              </span>
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Resolves in</label>
            <div className="flex gap-1.5 flex-wrap">
              {DEADLINE_PRESETS.map((p) => (
                <button key={p.seconds} onClick={() => setDeadlinePreset(p)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors border ${
                    deadlinePreset.seconds === p.seconds
                      ? "bg-teal/20 border-teal text-teal"
                      : "bg-muted border-border text-muted-foreground hover:border-teal/40"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lock buffer */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              Lock buffer
              <span className="ml-1 font-normal text-muted-foreground/60">(betting closes before deadline)</span>
            </label>
            <div className="flex gap-1.5">
              {LOCK_PRESETS.map((p) => (
                <button key={p.seconds} onClick={() => setLockPreset(p)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors border ${
                    lockPreset.seconds === p.seconds
                      ? "bg-teal/20 border-teal text-teal"
                      : "bg-muted border-border text-muted-foreground hover:border-teal/40"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bond */}
          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground flex justify-between">
            <span>Creation bond (refundable)</span>
            <span className="font-mono text-foreground font-medium">
              {bond > 0n ? `${Number(formatEther(bond)).toFixed(4)} TRUST` : "…"}
            </span>
          </div>

          {writeError && (
            <p className="text-xs text-[#bc4b51] flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{writeError.message.slice(0, 120)}</span>
            </p>
          )}

          {!address ? (
            <p className="text-xs text-muted-foreground text-center">Connect wallet to create</p>
          ) : !isOnTestnet ? (
            <Button className="w-full" size="sm" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
              <ArrowRightLeft className="w-3 h-3 mr-1" />
              Switch to Intuition Testnet
            </Button>
          ) : (
            <Button
              className="w-full bg-teal hover:bg-teal/80 text-white font-medium"
              size="sm" disabled={!canSubmit} onClick={handleCreate}
            >
              {txBusy
                ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Deploying…</>
                : <><Plus className="w-3 h-3 mr-1" />Deploy Market</>
              }
            </Button>
          )}

        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-teal/40 text-teal hover:bg-teal/10 hover:border-teal"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-3.5 h-3.5 mr-1" />
        New Market
      </Button>
      {modal}
    </>
  );
}
