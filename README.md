# AuraPredict

AuraPredict la dapp Prediction Market chay tren Arc Testnet. Du an gom:

- Smart contract Solidity: `contracts/ArcPredictionMarket.sol`
- Hardhat compile, test, deploy: `hardhat.config.cjs`, `scripts/deploy.js`
- Frontend Vite React: `src/`
- Local backend/indexer doc event Arc nhanh hon: `indexer/`
- Huong dan tu dau, gom ca tao contract: `HUONG_DAN_TU_DAU_AURAPREDICT.md`
- Huong dan deploy ngan gon: `DEPLOY_AURAPREDICT.md`

Tinh nang hien tai:

- Tat ca deadline va dong ho hien thi theo UTC.
- Market chia thanh Fresh, Hottest va Closing Soon.
- Hottest sap xep theo so vi da tham gia, doc tu `traderCount` trong contract.
- Thanh activity ticker doc event `BetPlaced` de hien nguoi choi vua stake YES/NO.
- Frontend uu tien doc market, stats, leaderboard va history tu AuraPredict Indexer neu `VITE_AURA_INDEXER_URL` kha dung; neu khong co thi fallback ve Arc RPC nhu cu.
- Contract thu phi protocol mac dinh 2% tren phan loi nhuan cua vi thang. Owner co the rut phi da tich luy.
- Creator phai khoa creator bond khi tao market. Sau deadline, creator de xuat ket qua, nguoi choi co 12 gio dispute bang dispute bond. Neu co dispute, owner finalizes ket qua cuoi.

## Arc Testnet

- Chain ID: `5042002` (`0x4CEF52`)
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Gas token: native `USDC`
- Faucet: `https://faucet.circle.com`

Nguon tham khao: [Arc RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints), [Add Arc to a Wallet](https://docs.arc.io/integrate/wallets).

## Chay nhanh tren may cua ban

```bash
npm install
copy .env.example .env
npm run compile
npm test
npm run indexer
npm run dev
```

Muon frontend ket noi contract that tren Arc Testnet, ban can deploy contract truoc:

```bash
npm run deploy:arc
```

Sau do dien dia chi contract vao:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x...
VITE_AURA_INDEXER_URL=http://127.0.0.1:8787
```

Doc file `DEPLOY_AURAPREDICT.md` neu ban muon dua code len GitHub va deploy len Vercel theo tung buoc.
Doc them `indexer/README.md` neu ban muon chay backend/indexer rieng cho leaderboard, stats va history nhanh hon.

## Luu y an toan

- Khong commit file `.env`.
- Khong dua `PRIVATE_KEY` len GitHub hoac Vercel.
- Contract hien la ban MVP testnet, chua audit.
- Resolver luon la vi tao market. Neu ban dang dung contract cu, hay deploy lai contract moi va cap nhat `VITE_PREDICTION_MARKET_ADDRESS`, vi ABI hien co them `traderCount`, event `BetPlaced`, creator bond, dispute flow, va phi protocol.
