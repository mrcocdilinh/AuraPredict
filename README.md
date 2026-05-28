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
- Oracle proposal v1 chay trong indexer de tu kiem tra cac market khach quan nhu gia crypto, macro chart va health/status API ma khong ton quota AI; ket qua chi la goi y cho resolver/owner, khong tu chot tien.
- Contract V4 tach `closeTime` cua giao dich voi `resolutionTime` cua su kien; contract khong cho cong bo ket qua truoc `resolutionTime`.
- V4 luu primary source, fallback source va resolution rule onchain de dieu khoan market khong bi phu thuoc vao frontend/indexer.
- V4 snapshot dieu khoan phi, creator bond, dispute bond, dispute window, min stake va proposal grace period theo tung market de thay doi cau hinh sau nay khong lam doi market cu.
- V4 cho phep settlement asset 6 decimals cau hinh theo market, vi du USDC hoac EURC, va quan ly phi theo tung token; khong quy doi FX giua cac token.
- Trong trang market dang giao dich hoac trang Profile, nguoi dung co the lay quote LI.FI va tu ky swap `USDC <-> EURC` tren Arc Testnet neu can dung token settlement cua market truoc khi stake. UI hien so nhan toi thieu, cho chon price tolerance va yeu cau quote moi neu quote cu het han de giam swap revert tren thanh khoan testnet. Swap khong thay doi token tra thuong cua market.
- V4 co bon huong resolution: creator + dispute review, creator + required authority review, authority/oracle only, va adapter-only cho oracle/committee sau nay.
- Proposal V4 co the dung Aura signed attestation neu cau hinh signer. Neu chua bat signer hoac creator di nguoc Aura, contract day proposal vao authority review.
- V4 co policy gate co ban: tam dung tao/cuoc moi, gioi han vi duoc tao market va chan account mo position moi; resolve, refund va claim cua market dang ton tai van hoat dong.
- Market da qua resolution time nhung khong ai propose co the cancel sau grace period de tra bond/refund, tranh ket tien vo han.
- Market khong co thanh khoan co the cancel sau resolution time ma khong can ton luot goi AI; bond/refund duoc rut theo pull-withdrawal.
- Tung market co lich su bet va o tim kiem vi rieng; tab Ended cung co tim kiem rieng cho market da ket thuc.

Production hien dung contract V4 tren Arc Testnet tai `0x3c853AE2eC705B453c9657569b6335e762631536`, bat dau tu block `44083985`. Frontend va indexer duoc pin vao deployment V4 nay.
Market V3 cu va tien cua chung van ton tai tren contract cu tai `0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd`. Giao dien chinh tao market moi tren V4; neu can xem/settle/claim market V3 cu, mo app voi query `?deployment=v3`.

Oracle proposal v1 ho tro:

- Crypto price: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK qua Binance 1-minute kline, fallback CoinGecko gan thoi diem khi can.
- Macro chart: gold va US Dollar Index qua Yahoo chart data gan moc resolution.
- Health/status API: endpoint co `ok: true`, HTTP 200, hoac status page public nhu GitHub/OpenAI.
- Liquidity rule: neu YES pool hoac NO pool bang 0, Oracle goi y Cancel/Refund thay vi chon YES/NO.
- Cac market ngoai adapter, vi du tin tuc phuc tap hoac sports, van di qua Aura Agent/evidence/authority review.

## Arc Testnet

- Chain ID: `5042002` (`0x4CEF52`)
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Active V4 contract: `0x3c853AE2eC705B453c9657569b6335e762631536`
- Archived V3 contract: `0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd`
- Gas token: native `USDC`; V4 dung cung tai san USDC qua ERC-20 interface `0x3600000000000000000000000000000000000000` (6 decimals) cho allowance/transfer.
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

Deployment V4 dang hoat dong tren Arc Testnet:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x3c853AE2eC705B453c9657569b6335e762631536
VITE_PREDICTION_MARKET_START_BLOCK=44083985
ARC_USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
ARC_EURC_TOKEN_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
```

Deployment production duoc pin truc tiep trong frontend va indexer. Cac gia tri tham chieu V4 hien tai la:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x3c853AE2eC705B453c9657569b6335e762631536
VITE_ARC_EURC_TOKEN_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
VITE_AURA_INDEXER_URL=https://api.aurapredict.xyz
VITE_WALLETCONNECT_PROJECT_ID=...
```

V3 archive reference:

```bash
V3_PREDICTION_MARKET_ADDRESS=0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd
V3_PREDICTION_MARKET_START_BLOCK=44074836
```

Doc file `DEPLOY_AURAPREDICT.md` neu ban muon dua code len GitHub va deploy len Vercel theo tung buoc.
Doc them `indexer/README.md` neu ban muon chay backend/indexer rieng cho leaderboard, stats va history nhanh hon.

## Tao market test tren V4

File `scripts/seed_markets_v4_test_20.json` chua 20 market test nhieu chu de, moi market co source/rule rieng va close time tuong doi. Chay lenh sau khi vi deploy co du Arc Testnet USDC:

```powershell
$env:PREDICTION_MARKET_ADDRESS="0x3c853AE2eC705B453c9657569b6335e762631536"
$env:SEED_FILE="scripts/seed_markets_v4_test_20.json"
npm.cmd run seed:markets
```

Script se kiem tra balance truoc, approve dung bond/fee can thiet, va tao market tren V4. Dung `npm.cmd run seed:markets:dry` de kiem tra file ma khong gui transaction.

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

Production hien tai dung indexer tu host tren VPS va public qua Nginx + HTTPS:

```text
https://api.aurapredict.xyz/health
https://api.aurapredict.xyz/api/stats
```

Frontend production tren Vercel su dung:

```bash
VITE_AURA_INDEXER_URL=https://api.aurapredict.xyz
VITE_PREDICTION_MARKET_START_BLOCK=44083985
AURA_ORACLE_AUTO_RUN=1
AURA_ORACLE_HTTP_TIMEOUT_MS=8000
AURA_ORACLE_AUTO_PROPOSE=0
AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE=78
```

Indexer chay bang `pm2` trong `/opt/aurapredict`, doc bien moi truong tu `/opt/aurapredict/.env`, va duoc Nginx proxy tu `api.aurapredict.xyz` ve `127.0.0.1:8787`. Sau khi sua `.env` hoac cap nhat code indexer tren VPS, restart:

```bash
cd /opt/aurapredict
pm2 restart aurapredict-indexer
curl https://api.aurapredict.xyz/health
```

## Luu y an toan

- Khong commit file `.env`.
- Khong dua `PRIVATE_KEY` len GitHub hoac Vercel.
- Contract hien la ban MVP testnet, chua audit.
- V4 da mo duong cho authority/oracle/committee va adapter-only market sau nay, nhung chua thay the quy trinh compliance, audit, multisig va giam sat production.
- Oracle phase 2 co the tu gui proposal onchain cho market khach quan nhu BTC/ETH price, gold/DXY, health/status API khi `AURA_ORACLE_AUTO_PROPOSE=1` va confidence du nguong. No khong tu finalize market co nguoi choi; dispute window va owner/authority review van giu nguyen.
- Neu mo ca USDC va EURC, moi market chi settle trong token da chon; dashboard va `/api/stats` hien volume/liquidity rieng theo tung token, khong gop thanh mot tong FX.
- Nut swap trong trading panel va Profile chi la tien ich cho vi nguoi dung doi USDC/EURC truoc giao dich; route, so nhan uoc tinh va muc nhan toi thieu den tu LI.FI, giao dich swap duoc ky trong vi. Quote cu het han sau thoi gian ngan va price tolerance do nguoi dung chon vi pool testnet co the bien dong nhanh.
- Production dang dung deployment V4 da pin trong source; market V3 cu khong tu di chuyen sang contract moi nhung co the truy cap qua `?deployment=v3` de settle/claim.
