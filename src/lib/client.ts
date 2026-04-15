import { GraphQLClient } from "graphql-request";

const testnetEndpoint = import.meta.env.VITE_SUBGRAPH_URL_TESTNET;
const mainnetEndpoint = import.meta.env.VITE_SUBGRAPH_URL;

if (!testnetEndpoint) console.warn("VITE_SUBGRAPH_URL_TESTNET is not set.");

// Testnet — default client for the whole app (chain 13579)
export const client = new GraphQLClient(testnetEndpoint);
export const testnetClient = client;

// Mainnet — kept as reference, not used
export const mainnetClient = new GraphQLClient(mainnetEndpoint);
