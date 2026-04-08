import { gql } from "graphql-request";

// ── Dashboard: Top Atoms ──

export const TOP_ATOM_VAULTS_BY_SHARE_PRICE = gql`
  query TopAtomVaultsBySharePrice($limit: Int!) {
    vaults(
      limit: $limit
      order_by: { current_share_price: desc }
      where: { term: { atom_id: { _is_null: false } } }
    ) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
      term {
        atom {
          label
          emoji
          image
          type
          term_id
          creator_id
          created_at
        }
      }
    }
  }
`;

export const TOP_ATOM_VAULTS_BY_POSITION_COUNT = gql`
  query TopAtomVaultsByPositionCount($limit: Int!) {
    vaults(
      limit: $limit
      order_by: { position_count: desc }
      where: { term: { atom_id: { _is_null: false } } }
    ) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
      term {
        atom {
          label
          emoji
          image
          type
          term_id
          creator_id
          created_at
        }
      }
    }
  }
`;

// ── Dashboard: Top Triples ──

export const TOP_TRIPLE_VAULTS_BY_SHARE_PRICE = gql`
  query TopTripleVaultsBySharePrice($limit: Int!) {
    vaults(
      limit: $limit
      order_by: { current_share_price: desc }
      where: { term: { triple_id: { _is_null: false } } }
    ) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
      term {
        triple {
          term_id
          creator_id
          created_at
          subject {
            label
            emoji
            image
            term_id
          }
          predicate {
            label
            emoji
            image
            term_id
          }
          object {
            label
            emoji
            image
            term_id
          }
        }
      }
    }
  }
`;

export const TOP_TRIPLE_VAULTS_BY_POSITION_COUNT = gql`
  query TopTripleVaultsByPositionCount($limit: Int!) {
    vaults(
      limit: $limit
      order_by: { position_count: desc }
      where: { term: { triple_id: { _is_null: false } } }
    ) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
      term {
        triple {
          term_id
          creator_id
          created_at
          subject {
            label
            emoji
            image
            term_id
          }
          predicate {
            label
            emoji
            image
            term_id
          }
          object {
            label
            emoji
            image
            term_id
          }
        }
      }
    }
  }
`;

// ── Atom Detail ──

export const ATOM_DETAIL = gql`
  query AtomDetail($termId: String!) {
    atom(term_id: $termId) {
      term_id
      label
      image
      emoji
      type
      creator_id
      created_at
    }
    vaults(where: { term_id: { _eq: $termId } }) {
      term_id
      current_share_price
      total_shares
      total_assets
      position_count
    }
    positions(
      where: { term_id: { _eq: $termId } }
      order_by: { shares: desc }
      limit: 100
    ) {
      id
      account_id
      shares
      account {
        id
        label
      }
    }
  }
`;

// ── Triple Detail ──

export const TRIPLE_DETAIL = gql`
  query TripleDetail($termId: String!) {
    triple(term_id: $termId) {
      term_id
      creator_id
      created_at
      subject {
        term_id
        label
        image
        emoji
      }
      predicate {
        term_id
        label
        image
        emoji
      }
      object {
        term_id
        label
        image
        emoji
      }
    }
    triple_vault(term_id: $termId) {
      term_id
      total_shares
      total_assets
      position_count
    }
    positions(
      where: { term_id: { _eq: $termId } }
      order_by: { shares: desc }
      limit: 100
    ) {
      id
      account_id
      shares
      account {
        id
        label
      }
    }
  }
`;

// ── Stats ──

export const PROTOCOL_STATS = gql`
  query ProtocolStats {
    stats(limit: 1) {
      total_atoms
      total_triples
      total_positions
      total_signals
      total_accounts
      contract_balance
    }
  }
`;

// ── Share Price History (for detail charts) ──

export const SHARE_PRICE_HISTORY = gql`
  query SharePriceHistory($termId: String!) {
    share_price_changes(
      where: { term_id: { _eq: $termId } }
      order_by: { block_timestamp: desc }
      limit: 10000
    ) {
      block_timestamp
      share_price
      total_assets
      total_shares
    }
  }
`;

