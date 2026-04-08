export function formatEth(wei: string): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return "0 TRUST";
  if (eth < 0.0001) return "<0.0001 TRUST";
  if (eth >= 1e6) return `${(eth / 1e6).toFixed(1)}M TRUST`;
  if (eth >= 1e3) return `${(eth / 1e3).toFixed(1)}K TRUST`;
  return `${eth.toFixed(4)} TRUST`;
}

export function formatSharePrice(raw: string): string {
  const price = Number(raw) / 1e18;
  if (price === 0) return "0";
  if (price < 0.0001) return "<0.0001";
  return price.toFixed(4);
}

export function formatNumber(n: string | number): string {
  return Number(n).toLocaleString();
}

export function formatCompact(n: string | number): string {
  const num = Number(n);
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toLocaleString();
}

export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
