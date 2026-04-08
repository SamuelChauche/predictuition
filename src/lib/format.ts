export function formatEth(wei: string): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return "0 ETH";
  if (eth < 0.0001) return "<0.0001 ETH";
  return `${eth.toFixed(4)} ETH`;
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

export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(timestamp: string): string {
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
