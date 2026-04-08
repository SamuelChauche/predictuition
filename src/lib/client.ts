import { GraphQLClient } from "graphql-request";

const endpoint = import.meta.env.VITE_SUBGRAPH_URL;

if (!endpoint || endpoint === "your_endpoint_here") {
  console.warn(
    "VITE_SUBGRAPH_URL is not set. Please set it in your .env file."
  );
}

export const client = new GraphQLClient(endpoint);
