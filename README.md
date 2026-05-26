# AuraPredict

AuraPredict la dapp Prediction Market chay tren Arc Testnet. Du an gom:

- Smart contract Solidity: `contracts/ArcPredictionMarket.sol`
- Hardhat compile, test, deploy: `hardhat.config.cjs`, `scripts/deploy.js`
- Frontend Vite React: `src/`
- Local backend/indexer doc event Arc nhanh hon: `indexer/`
- Static docs site cho `docs.aurapredict.xyz`: `docs/`
- Huong dan deploy ngan gon: `DEPLOY_AURAPREDICT.md`

Tinh nang hien tai:

- Tat ca deadline va dong ho hien thi theo UTC.
- Market chia thanh Fresh, Hottest va Closing Soon.
- Hottest sap xep theo so vi da tham gia, doc tu `traderCount` trong contract.
- Thanh activity ticker doc event `BetPlaced` de hien nguoi choi vua stake YES/NO.
- Frontend uu tien doc market, stats, leaderboard va history tu AuraPredict Indexer neu `VITE_AURA_INDEXER_URL` kha dung; neu khong co thi fallback ve Arc RPC nhu cu.
- Aura Agent giup draft market va goi y ket qua; thao tac de xuat/finalize van la giao dich onchain duoc ky boi vi co tham quyen.
- Contract V3 tach `closeTime` cua giao dich voi `resolutionTime` cua su kien; contract khong cho cong bo ket qua truoc `resolutionTime`.
- V3 snapshot dieu khoan phi, creator bond, dispute bond va dispute window theo tung market de thay doi cau hinh sau nay khong lam doi market cu.
- V3 cho phep settlement asset 6 decimals cau hinh theo market, vi du USDC hoac EURC, va quan ly phi theo tung token; khong quy doi FX giua cac token.
- V3 co ba che do resolution: creator + dispute review, creator + required authority review, va authority/oracle only.
- Proposal V3 luu hash cua bang chung va AI receipt; authority co the giu proposal de review, nguoi choi co position van co the dispute.
- V3 co policy gate co ban: tam dung tao/cuot moi, gioi han vi duoc tao market va chan account mo position moi; resolve, refund va claim cua market dang ton tai van hoat dong.
- Market khong co thanh khoan co the cancel sau resolution time ma khong can ton luot goi AI; bond/refund duoc rut theo pull-withdrawal.
- Tung market co lich su bet va o tim kiem vi rieng; tab Ended cung co tim kiem rieng cho market da ket thuc.

Contract V3 da deploy tren Arc Testnet tai `0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd`, bat dau tu block `44074836`. Frontend va indexer doc duoc ca V2/V3; production chi chuyen sang V3 sau khi cac environment variable cua Vercel/Render tro vao dia chi nay.
Khong cat production khoi V2 khi van con market V2 dang live hoac chua claim; tien va trang thai onchain cua market V2 khong the di chuyen sang V3.

## Arc Testnet

- Chain ID: `5042002` (`0x4CEF52`)
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Active V3 contract: `0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd`
- Gas token: native `USDC`; V3 dung cung tai san USDC qua ERC-20 interface `0x3600000000000000000000000000000000000000` (6 decimals) cho allowance/transfer.
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

Deployment V3 dang hoat dong tren Arc Testnet:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd
VITE_PREDICTION_MARKET_START_BLOCK=44074836
ARC_USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
ARC_EURC_TOKEN_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
```

De chay local hoac chuyen production sang V3, dien:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd
VITE_ARC_EURC_TOKEN_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
VITE_AURA_INDEXER_URL=http://127.0.0.1:8787
VITE_WALLETCONNECT_PROJECT_ID=...
```

Doc file `DEPLOY_AURAPREDICT.md` neu ban muon dua code len GitHub va deploy len Vercel theo tung buoc.
Doc them `indexer/README.md` neu ban muon chay backend/indexer rieng cho leaderboard, stats va history nhanh hon.

## Mobile wallet connect

App ho tro 2 cach ket noi tren mobile:

- Injected provider khi mo AuraPredict trong browser cua MetaMask, Rabby, Zerion, OKX.
- WalletConnect khi mo bang Chrome/Safari mobile va muon nhay sang wallet app de approve.

De bat WalletConnect tren production, tao project id tai WalletConnect Cloud va them env vao Vercel app project:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

Sau khi them env, redeploy frontend. Neu khong co bien nay, nut WalletConnect se hien huong dan cau hinh va cac nut deep link van mo dapp trong browser cua tung vi.

## Docs subdomain

Thu muc `docs/` la static site rieng cho `docs.aurapredict.xyz`. Tren Vercel, tao mot project rieng tu cung repo nay, dat `Root Directory` la `docs`, framework `Other`, khong can build command, va them custom domain `docs.aurapredict.xyz`.

Khong tro project app chinh sang `docs/`; app chinh van dung repo root cho `aurapredict.xyz`.

## Production indexer

De `https://app.aurapredict.xyz` chay muot nhu local, deploy `indexer/` thanh mot web service public rieng.

- No-card/free path: GitHub Actions publish static JSON to GitHub Pages via `.github/workflows/static-indexer.yml`.
- Dockerfile: `Dockerfile.indexer`
- Render blueprint: `render.yaml`
- Health check: `/health`
- API stats: `/api/stats`

### GitHub Pages static indexer, khong can card

1. Vao GitHub repo `mrcocdilinh/AuraPredict`.
2. Vao `Settings` -> `Pages`.
3. O `Build and deployment`, chon `Source: GitHub Actions`.
4. Vao tab `Actions`.
5. Chon workflow `Publish static indexer`.
6. Bam `Run workflow`.
7. Cho workflow chay xong.
8. Mo URL:

```text
https://mrcocdilinh.github.io/AuraPredict/api/stats.json
https://mrcocdilinh.github.io/AuraPredict/api/markets.json
```

Sau khi co data, them env cho frontend production tren Vercel:

```bash
VITE_AURA_INDEXER_URL=https://mrcocdilinh.github.io/AuraPredict
VITE_PREDICTION_MARKET_START_BLOCK=43295581
```

Sau do redeploy frontend.

Luu y: cach nay free va khong can card, nhung data cap nhat theo lich GitHub Actions, mac dinh moi 15 phut. Neu can realtime hon, dung web service indexer public.

Sau khi co URL public cua indexer, them env cho frontend production:

```bash
VITE_AURA_INDEXER_URL=https://your-indexer-domain
VITE_PREDICTION_MARKET_START_BLOCK=43295581
```

Sau do redeploy frontend.

## Luu y an toan

- Khong commit file `.env`.
- Khong dua `PRIVATE_KEY` len GitHub hoac Vercel.
- Contract hien la ban MVP testnet, chua audit.
- V3 da mo duong cho authority/oracle/committee va policy gate co ban, nhung chua thay the quy trinh compliance, audit, multisig va giam sat production.
- Neu mo ca USDC va EURC, moi market chi settle trong token da chon; dashboard co the hien tong `stablecoin units` nhung day khong phai la gia tri FX quy doi.
- De dung V3, deploy contract moi voi dia chi token settlement dung, cap nhat frontend/indexer sang dia chi do, va chap nhan rang market cua deployment cu khong tu di chuyen sang contract moi.
