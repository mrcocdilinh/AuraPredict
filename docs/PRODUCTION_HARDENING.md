# Production hardening runbook

## Release gates

Every release must pass `npm ci`, lint, TypeScript, Solidity compile/tests,
indexer tests, production build, and Playwright E2E. Do not deploy while the CI
workflow is red.

## Contract migration

The currently deployed Arc Testnet V5 contract predates two-step ownership and
the bond-refund hardening. Source changes do not patch that deployment.

1. Deploy the hardened contract and verify its source/ABI.
2. Recreate only intended live markets; do not silently mutate old terms.
3. Let old-market users claim/refund from the old address.
4. Set `AURA_MIGRATION_TARGET` to a controlled Circle Developer Wallet or
   multisig.
5. Dry run `npm run migrate:authority`.
6. Set `AURA_MIGRATE_AUTHORITY=1` and optionally `AURA_MIGRATE_OWNER=1`.
7. Execute only after checking address, chain, and balances:
   `npm run migrate:authority -- --execute`.
8. For ownership, the target separately calls `acceptOwnership()`.

Never migrate the old one-step deployment's ownership with the helper: it
refuses that operation by design.

## Indexer operations

- Persist and back up `indexer/data/aurapredict-index.json`.
- Test restoration regularly, not only backup creation.
- Protect `AURA_RESOLUTION_ADMIN_TOKEN`, Circle credentials, entity secret, and
  signer credentials in a secrets manager.
- Put the API behind TLS and a reverse proxy. Set `AURA_TRUST_PROXY=1` only when
  that proxy overwrites `X-Forwarded-For`.
- Alert on stale `lastSyncedAt`, non-empty `lastSyncError`, RPC 429 spikes,
  keeper transaction failures, low signer USDC, and state-file write failures.

## Mainnet blockers

- Independent smart-contract audit and escrow accounting invariants.
- Multisig/timelock owner and a separate least-privilege resolution authority.
- Database-backed social/index state or tested replicated storage.
- Incident response, rollback/cutover plan, monitoring, and user communication.
- Legal review for prediction-market availability in target jurisdictions.
