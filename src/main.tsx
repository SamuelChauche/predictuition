import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Privy loads wallet/NFT avatars with ipfs:// URLs which browsers can't fetch natively.
// Rewrite them to a public IPFS gateway transparently.
const IPFS_GATEWAY = "https://cloudflare-ipfs.com/ipfs/";

function rewriteIpfsEl(el: Element) {
  if (el instanceof HTMLImageElement && el.src.startsWith("ipfs://")) {
    el.src = el.src.replace("ipfs://", IPFS_GATEWAY);
  }
}

const ipfsObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) {
        rewriteIpfsEl(node);
        node.querySelectorAll("img").forEach(rewriteIpfsEl);
      }
    }
    if (mutation.type === "attributes" && mutation.target instanceof Element) {
      rewriteIpfsEl(mutation.target);
    }
  }
});

ipfsObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src"],
});

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
