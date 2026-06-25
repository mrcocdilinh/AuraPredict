# Kế hoạch chuyển AuraOn lên Arc Mainnet

> Trạng thái (cập nhật 2026-06): Arc vẫn ở public testnet. Circle dự kiến mainnet
> **summer 2026** nhưng **chưa công bố** chain ID / RPC / explorer / địa chỉ USDC/EURC
> mainnet. Doc này gồm 2 phần: việc chuẩn bị **làm ngay** (không cần đợi), và **runbook
> điền-chỗ-trống** để chạy khi Circle công bố mainnet.

---

## Phần A — Làm ngay (độc lập với mốc mainnet)

### A1. Audit smart contract (BẮT BUỘC trước khi giữ tiền thật)
- `RISK_ORACLE_AND_QA.md` đã ghi: contract V5 hiện **chưa audit**.
- Đặt lịch audit độc lập cho `contracts/ArcPredictionMarketV5.sol` trước khi deploy mainnet.

### A2. Quản trị owner: bỏ ví đơn → multisig/timelock
- Hiện owner = 1 ví EOA `0xAAAE…b9B2` (giữ toàn quyền: rút phí, pause, finalize, authority).
- Mainnet nên chuyển owner sang **multisig (vd Safe)** hoặc timelock để tránh single point of failure.

### A3. Signer cho auto-propose/finalize — KHÔNG dùng private key plaintext trên mainnet
- Hiện indexer ký bằng `AURA_RESOLVER_PRIVATE_KEY` để trong `.env` trên VPS. **Chấp nhận được với testnet**, nhưng **nguy hiểm với tiền thật**.
- Mainnet: chuyển sang **Circle Agent Wallet (circle-cli)** với custody chuẩn, hoặc KMS/HSM. Code đã hỗ trợ cả 2 mode qua `AURA_RESOLVER_SIGNER_MODE`.

### A4. Lưu trữ bền cho indexer
- Indexer hiện lưu state ở JSON file (`indexer/data/aurapredict-index.json`). Mainnet nên chuyển sang DB bền (Postgres/SQLite) + backup, vì mất state = mất receipt/oracle history.

### A5. Gỡ hardcode testnet → cấu hình theo env (làm & test trên testnet trước)
Để cùng một codebase chạy được cả testnet lẫn mainnet, biến các giá trị chain thành env-driven. Xem touchpoints ở Phần B.

---

## Phần B — Touchpoints cần đổi (inventory)

### Frontend
| File | Hiện tại (hardcode testnet) | Cần làm |
|------|------------------------------|---------|
| `src/arc.ts` | `ARC_CHAIN_ID_*` = 5042002, `ARC_RPC_URL`, `ARC_WS_URL`, `ARC_EXPLORER_URL`, `name: "Arc Testnet"`, `testnet: true`, native 18 decimals | Đọc từ `import.meta.env` (VITE_*) với fallback testnet; đổi `testnet` flag theo env |
| `src/constants/index.ts` | `ARC_EURC_TOKEN_ADDRESS` (L81), USDC `0x3600…`, `UNIFIED_BALANCE_*` chains | EURC theo env; xác nhận USDC mainnet; cập nhật chain nguồn Gateway sang mainnet thật |
| Vercel env (app) | `VITE_PREDICTION_MARKET_ADDRESS`, `VITE_AURAPREDICT_V5_ADDRESS`, `VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK`, `VITE_ARC_EURC_TOKEN_ADDRESS`, `VITE_AURA_INDEXER_URL` | Trỏ sang contract + indexer mainnet |

### Deploy
| File | Hiện tại | Cần làm |
|------|----------|---------|
| `hardhat.config.cjs` | chỉ có network `arcTestnet` (chainId 5042002, url từ `ARC_RPC_URL`) | Thêm network `arcMainnet` (chainId + RPC mainnet) |
| `scripts/deploy.js` | đọc `ARC_USDC_TOKEN_ADDRESS`, `ARC_EURC_TOKEN_ADDRESS`, `AURA_RESOLUTION_AUTHORITY_ADDRESS`, `AURA_TRUSTED_FORWARDER_ADDRESS`, `AURA_ATTESTATION_SIGNER_ADDRESS`, `MIN_STAKE_USDC`, bonds, fees | Không cần sửa code; chỉ set env mainnet |

### Indexer (VPS `.env`)
- `VITE_PREDICTION_MARKET_ADDRESS` / `AURA_INDEXER_CONTRACT_ADDRESS` → contract mainnet
- `ARC_RPC_URL` / WS → RPC mainnet (ưu tiên paid: QuickNode/Alchemy, tránh free tier timeout như hiện tại)
- deployment block mainnet
- `ARC_USDC_TOKEN_ADDRESS`, `ARC_EURC_TOKEN_ADDRESS` → mainnet
- Signer (xem A3) + giữ các flag auto: `AURA_ORACLE_AUTO_PROPOSE`, `AURA_RESOLUTION_AUTO_PROPOSE`, `AURA_AUTO_FINALIZE`, ngưỡng confidence

---

## Phần C — Runbook khi Circle công bố mainnet (điền chỗ trống)

Khi có giá trị chính thức (từ https://docs.arc.io/arc/references/ ), điền vào đây:

```
ARC MAINNET (điền khi công bố)
  Chain ID         : __________
  RPC URL          : __________
  WS URL           : __________
  Explorer         : __________
  USDC (ERC-20)    : __________   (xác nhận lại decimals: 6?)
  USDC native gas  : decimals __  (testnet là 18 — xác nhận lại)
  EURC             : __________   (decimals 6?)
```

Các bước:
1. **Xác minh giá trị** bằng cách đọc `CONTRACT_VERSION`/chainId từ RPC mainnet, không tin aggregator (ChainList từng ghi sai chain Arc).
2. **Audit xong** (A1) + **owner = multisig** (A2).
3. Set env deploy mainnet → `npm run compile && npm run deploy:arc:v5 && npm run abi:v5`.
4. Cấu hình asset (USDC/EURC) + resolution authority = multisig/agent wallet.
5. Cập nhật **frontend env (Vercel)** + **indexer `.env` (VPS)** sang giá trị mainnet, redeploy.
6. Smoke test: `npm run smoke:api`, tạo 1 market nhỏ, stake, resolve, claim end-to-end.
7. Bật auto-propose/finalize sau khi đã quan sát vài market thủ công trên mainnet.

---

## Phần D — Cảnh báo riêng cho mainnet

- **Gateway/Unified Balance chưa hỗ trợ Arc mainnet**: tính tới 6/2026, Circle Gateway mainnet hỗ trợ Arbitrum/Avalanche/Base/Ethereum/OP/Polygon/Unichain — **Arc nằm trong "sắp thêm"**. Nên tính năng nạp USDC xuyên chain vào Arc mainnet có thể **chưa chạy** lúc launch; cần kiểm tra lại và có thể tạm ẩn nút Unified Balance trên mainnet.
- **Decimals**: testnet dùng native USDC 18 / ERC-20 6. Phải **xác nhận lại** trên mainnet trước khi tin.
- **RPC**: free tier (dRPC) đang timeout trên testnet. Mainnet **bắt buộc** dùng RPC trả phí ổn định.
- **EURC mainnet** gần như chắc chắn là địa chỉ khác testnet — không tái dùng `0x89B5…`.

---

## Nguồn
- Arc docs: https://docs.arc.io/arc/references/contract-addresses , https://docs.arc.io/arc/references/rpc-endpoints
- Circle Gateway supported chains: https://developers.circle.com/gateway/references/supported-blockchains
- Arc mainnet timeline (summer 2026): https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance
