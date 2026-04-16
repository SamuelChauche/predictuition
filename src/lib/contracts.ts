export const TESTNET_CHAIN_ID = 13579 as const;

export const MARKET_FACTORY_ADDRESS: Partial<Record<number, `0x${string}`>> = {
  [TESTNET_CHAIN_ID]: "0x8BC0CB1887C3d1a113121f504ff6399Ed9Cf6173",
};

export const MARKET_FACTORY_ABI = [
  {
    name: "getMarkets",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "result", type: "address[]" }],
  },
  {
    name: "creationBond",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "createMarket",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_conditionType", type: "uint8" },
      { name: "_targetId", type: "bytes32" },
      { name: "_curveId", type: "uint256" },
      { name: "_targetValue", type: "uint256" },
      { name: "_deadline", type: "uint256" },
      { name: "_lockBuffer", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const MARKET_ABI = [
  { name: "conditionType", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { name: "targetId", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
  { name: "curveId", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "targetValue", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "deadline", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "lockTime", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "poolYes", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "poolNo", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "resolved", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "refundMode", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "outcome", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "remainingPoolAfterFees", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "minVolume", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "creator", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  // user-specific
  { name: "sharesYes", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "sharesNo", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "claimed", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  // write
  { name: "bet", type: "function", stateMutability: "payable", inputs: [{ name: "_yes", type: "bool" }], outputs: [] },
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "resolve", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "emergencyRefund", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const MULTIVAULT_ADDRESS: Partial<Record<number, `0x${string}`>> = {
  [TESTNET_CHAIN_ID]: "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91",
  1155: "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e",
};

export const MULTIVAULT_ABI = [
  {
    name: "isTriple",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "termId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Condition type labels matching Market.sol constants
export const CONDITION_LABELS: Record<number, { name: string; yes: string; no: string }> = {
  1: { name: "TVL Above",    yes: "Above", no: "Below"  },
  2: { name: "TVL Below",    yes: "Below", no: "Above"  },
  3: { name: "Price Above",  yes: "Higher", no: "Lower" },
  4: { name: "Price Below",  yes: "Lower",  no: "Higher"},
  5: { name: "Triple Ratio", yes: "Yes",   no: "No"     },
  6: { name: "Triple Flip",  yes: "Flip",  no: "Hold"   },
};
