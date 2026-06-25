# Huong dan chay AuraOn, dua len GitHub va deploy Vercel

File nay viet theo tung buoc cho nguoi moi. Ban cu lam tu tren xuong duoi.

## 0. Ket qua ban se co

Sau khi lam xong, ban se co:

- Code AuraOn nam tren GitHub cua ban.
- Smart contract AuraOn deploy tren Arc Testnet.
- Website chay tren Vercel voi domain dang `https://aurapredict.vercel.app` neu ten nay con trong.

Luu y quan trong: Vercel dung domain mac dinh ket thuc bang `.vercel.app`, khong phai `.vercel.com`. Theo tai lieu Vercel, moi deployment duoc gan domain dua tren ten project va ket thuc bang `.vercel.app`; domain nay duoc cap theo nguyen tac ai tao truoc dung truoc.

Nguon: [Vercel Working with domains](https://vercel.com/docs/domains/working-with-domains).

## 1. Cai cac phan mem can thiet

### 1.1. Cai Node.js

1. Mo trang https://nodejs.org
2. Tai ban LTS.
3. Cai dat binh thuong.
4. Mo PowerShell va kiem tra:

```powershell
node --version
npm.cmd --version
```

Neu thay hien version la duoc.

### 1.2. Cai Git

1. Mo trang https://git-scm.com/download/win
2. Tai va cai Git for Windows.
3. Mo PowerShell va kiem tra:

```powershell
git --version
```

### 1.3. Tao tai khoan can dung

Ban can:

- GitHub: https://github.com
- Vercel: https://vercel.com
- Vi EVM nhu MetaMask hoac Rabby
- Mot it USDC testnet tren Arc tu faucet: https://faucet.circle.com

## 2. Chay AuraOn tren may cua ban

### 2.1. Mo PowerShell trong thu muc du an

Thu muc du an hien tai:

```powershell
cd "C:\Users\duong\Documents\Codex\2026-05-21\h-y-vi-t-cho-t"
```

### 2.2. Cai package

```powershell
npm.cmd install
```

### 2.3. Tao file moi truong local

```powershell
copy .env.example .env
```

Mo file `.env` bang VS Code hoac Notepad. Ban se thay:

```env
ARC_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=
MIN_STAKE_USDC=0.1
ARC_USDC_TOKEN_ADDRESS=
ARC_EURC_TOKEN_ADDRESS=
VITE_PREDICTION_MARKET_ADDRESS=
VITE_ARC_EURC_TOKEN_ADDRESS=
```

Giai thich:

- `ARC_RPC_URL`: RPC Arc Testnet.
- `PRIVATE_KEY`: private key cua vi deploy contract. Chi dung local, khong dua len GitHub.
- `MIN_STAKE_USDC`: so USDC toi thieu khi stake.
- `ARC_USDC_TOKEN_ADDRESS`: dia chi ERC-20 USDC Arc Testnet dung lam settlement asset mac dinh cua contract V4.
- `ARC_EURC_TOKEN_ADDRESS`: dia chi ERC-20 EURC tuy chon neu muon mo them market EURC.
- `VITE_PREDICTION_MARKET_ADDRESS`: dia chi contract sau khi deploy.
- `VITE_ARC_EURC_TOKEN_ADDRESS`: dia chi EURC tuy chon de frontend hien lua chon asset khi tao market V4.
- Frontend co the dung LI.FI de lay quote va ky swap USDC/EURC tren Arc Testnet trong trang market. Luong nay khong can env secret va khong doi token settlement da duoc market luu onchain.

### 2.4. Kiem tra code

```powershell
npm.cmd run compile
npm.cmd test
npm.cmd run build
```

Neu ca 3 lenh khong bao loi, code da san sang.

### 2.5. Chay frontend local

```powershell
npm.cmd run dev
```

Mo trinh duyet vao URL Vite hien tren terminal, thuong la:

```text
http://127.0.0.1:5173/
```

Luc nay neu chua deploy contract, web se bao thieu `VITE_PREDICTION_MARKET_ADDRESS`. Day la binh thuong.

## 3. Deploy smart contract len Arc Testnet

### 3.1. Lay private key testnet

Trong MetaMask/Rabby:

1. Tao mot vi moi chi dung cho testnet.
2. Export private key.
3. Copy private key vao `.env`:

```env
PRIVATE_KEY=0x_private_key_cua_ban
ARC_USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
ARC_EURC_TOKEN_ADDRESS=0x_dia_chi_eurc_arc_testnet_neu_dung
```

Can than:

- Khong dung vi chua tien that.
- Khong gui private key cho ai.
- Khong commit `.env`.

Tren Arc, USDC native dung lam gas va USDC ERC-20 interface la cung mot tai san. V4 dung ERC-20
interface `0x3600000000000000000000000000000000000000` (6 decimals) de ho tro `approve` va
`transferFrom`; khong tron so du native 18 decimals voi gia tri settlement 6 decimals.
V4 chi nhan settlement asset co 6 decimals nhu USDC/EURC. Moi market thanh toan bang dung
token da chon; dashboard co the cong cac don vi stablecoin nhung contract khong tu quy doi FX.

### 3.2. Lay USDC testnet

1. Vao https://faucet.circle.com
2. Chon Arc Testnet neu faucet hien tuy chon Arc.
3. Nhap dia chi vi deploy.
4. Nhan USDC testnet.

### 3.3. Deploy contract

Chay:

```powershell
npm.cmd run deploy:arc
```

Sau khi deploy thanh cong, terminal se hien dang:

```text
ArcPredictionMarket deployed: 0x...
Explorer: https://testnet.arcscan.app/address/0x...
```

Copy dia chi `0x...`.

Deployment V4 hien tai tren Arc Testnet:

```text
Contract: 0x3c853AE2eC705B453c9657569b6335e762631536
Block:    44083985
USDC:     0x3600000000000000000000000000000000000000
EURC:     0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
```

Contract V4 them source/rule onchain, `resolutionTime` duoc cuong che onchain, settlement asset theo market, fee/bond/min-stake snapshot, authority review modes, optional Aura signed attestation, adapter-only mode cho oracle/committee sau nay va pull-withdrawal. Production hien duoc pin vao V4. Market cua contract V3 cu khong tu chuyen sang V4, nhung van co the xem/settle/claim bang link app them `?deployment=v3`.

### 3.4. Dia chi production V4

Frontend/indexer production hien pin truc tiep deployment nay trong source. Gia tri tham chieu de chay local hoac kiem tra cau hinh la:

```env
VITE_PREDICTION_MARKET_ADDRESS=0x3c853AE2eC705B453c9657569b6335e762631536
VITE_PREDICTION_MARKET_START_BLOCK=44083985
VITE_ARC_EURC_TOKEN_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
```

V3 archive:

```env
V3_PREDICTION_MARKET_ADDRESS=0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd
V3_PREDICTION_MARKET_START_BLOCK=44074836
```

Dung dev server neu dang chay bang `Ctrl + C`, roi chay lai:

```powershell
npm.cmd run dev
```

Bay gio AuraOn co the doc market, tao market, stake YES/NO, resolve va claim tren Arc Testnet.

## 4. Dua code len GitHub

Co 2 cach. Neu ban moi hoc, dung Cach A bang GitHub website va PowerShell.

### Cach A: Tao repo tren GitHub roi push bang PowerShell

#### 4.1. Tao repository tren GitHub

1. Dang nhap https://github.com
2. Bam dau `+` goc tren phai.
3. Chon `New repository`.
4. Repository name: `AuraOn`
5. Chon `Public` hoac `Private`.
6. Khong tick `Add a README file`.
7. Khong tick `.gitignore`.
8. Khong chon license luc nay.
9. Bam `Create repository`.

GitHub khuyen nghi khi push project co san thi repo moi khong nen khoi tao README/license/gitignore de tranh xung dot.

Nguon: [GitHub - Adding locally hosted code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows).

#### 4.2. Copy URL repo

Sau khi tao repo, GitHub se hien URL dang:

```text
https://github.com/TEN_GITHUB_CUA_BAN/AuraOn.git
```

Copy URL nay.

#### 4.3. Khoi tao Git trong thu muc du an

Trong PowerShell:

```powershell
cd "C:\Users\duong\Documents\Codex\2026-05-21\h-y-vi-t-cho-t"
git init
git add .
git commit -m "Initial AuraOn dapp"
git branch -M main
```

#### 4.4. Gan repo GitHub lam remote

Thay `TEN_GITHUB_CUA_BAN` bang username GitHub cua ban:

```powershell
git remote add origin https://github.com/TEN_GITHUB_CUA_BAN/AuraOn.git
git remote -v
```

GitHub docs giai thich `origin` la ten remote mac dinh va `git remote add origin <URL>` dung de gan project local voi repo tren GitHub.

Nguon: [GitHub - Managing remote repositories](https://docs.github.com/en/get-started/git-basics/managing-remote-repositories).

#### 4.5. Push code len GitHub

```powershell
git push -u origin main
```

Neu Git yeu cau dang nhap, lam theo huong dan trong terminal. Sau khi xong, refresh trang GitHub repo, ban se thay code.

## 5. Deploy AuraOn len Vercel

### 5.1. Import project tu GitHub

1. Vao https://vercel.com
2. Dang nhap bang GitHub.
3. Bam `Add New...`.
4. Chon `Project`.
5. Tim repo `AuraOn`.
6. Bam `Import`.

Vercel docs noi khi import Git repository, Vercel se tu dong build/deploy; moi commit hoac pull request tren Git provider duoc ho tro co the kich hoat deployment moi.

Nguon: [Vercel - Import an existing project](https://vercel.com/docs/getting-started-with-vercel/import), [Vercel - Deployment methods](https://vercel.com/docs/deployments/deployment-methods).

### 5.2. Dat ten project

Trong man hinh import:

- Project Name: `aurapredict`
- Framework Preset: Vercel thuong tu nhan la `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

Neu `aurapredict.vercel.app` da co nguoi dung, Vercel co the tao domain khac hoac yeu cau ten khac. Ban co the dung:

- `aurapredict-app`
- `aura-predict`
- `aurapredict-testnet`

### 5.3. Them Environment Variable tren Vercel

Trong phan `Environment Variables`, them bien:

```text
Name:  VITE_PREDICTION_MARKET_ADDRESS
Value: 0x3c853AE2eC705B453c9657569b6335e762631536

Name:  VITE_ARC_EURC_TOKEN_ADDRESS
Value: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
```

Chon tat ca moi truong neu Vercel hoi:

- Production
- Preview
- Development

Khong them `PRIVATE_KEY`, `ARC_USDC_TOKEN_ADDRESS` hoac `ARC_EURC_TOKEN_ADDRESS` dung cho deploy len Vercel neu khong can. Ban build production hien pin dia chi V4 trong source de cuong che cutover; cac bien frontend tren giu cau hinh dashboard nhat quan voi deployment dang dung. Private key chi dung de deploy contract tu may cua ban.

Vercel docs ghi environment variables la key-value duoc cau hinh ngoai source code va thay doi moi chi ap dung cho deployment moi.

Nguon: [Vercel - Environment variables](https://vercel.com/docs/projects/environment-variables).

### 5.4. Bam Deploy

1. Bam `Deploy`.
2. Cho Vercel build.
3. Neu build thanh cong, Vercel se cho URL.

URL mong muon:

```text
https://aurapredict.vercel.app
```

Neu Vercel tao URL co hau to khac, vao:

```text
Project -> Settings -> Domains
```

Kiem tra domain mac dinh cua project.

## 6. Sau nay muon cap nhat giao dien hoac code

Moi lan sua code tren may:

```powershell
git status
git add .
git commit -m "Update AuraOn"
git push
```

Sau khi `git push`, Vercel se tu build va deploy ban moi.

## 7. Cac loi hay gap

### Loi: web bao thieu contract address

Kiem tra:

- Local: file `.env` co `VITE_PREDICTION_MARKET_ADDRESS=0x...`
- Vercel: Project Settings -> Environment Variables co `VITE_PREDICTION_MARKET_ADDRESS`

Sau khi sua env tren Vercel, vao tab `Deployments` va bam redeploy deployment moi.

### Loi: MetaMask khong co Arc Testnet

Trong app bam `Connect Wallet`, app se goi wallet de add/switch sang Arc Testnet. Neu vi hoi xac nhan, bam chap nhan.

Thong so Arc Testnet:

```text
Chain ID: 5042002
Chain ID hex: 0x4CEF52
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
Currency: USDC
```

### Loi: deploy contract that bai vi thieu gas

Vi deploy can USDC testnet tren Arc. Lay tu faucet: https://faucet.circle.com

### Loi: PowerShell khong chay duoc npm

Dung `npm.cmd` thay vi `npm`:

```powershell
npm.cmd install
npm.cmd run dev
```

### Loi: da co remote origin

Kiem tra remote:

```powershell
git remote -v
```

Neu remote sai:

```powershell
git remote set-url origin https://github.com/TEN_GITHUB_CUA_BAN/AuraOn.git
```

## 8. Khong dua len GitHub nhung file nao

File `.gitignore` da chan cac file khong nen push:

- `.env`
- `node_modules/`
- `dist/`
- `artifacts/`
- `cache/`
- log files

Quan trong nhat: khong bao gio push `.env` vi trong do co the co `PRIVATE_KEY`.
