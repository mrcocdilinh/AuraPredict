# Huong dan AuraPredict tu dau: tao contract, chay dapp, GitHub, Vercel

Huong dan nay di tu con so 0. Neu ban dang dung workspace hien tai thi code da duoc tao san, ban chi can doc de hieu va chay theo cac lenh.

## 1. Ban dang xay gi?

AuraPredict gom 2 phan:

- Smart contract: chay tren Arc Testnet, giu USDC stake, tao market, resolve, claim.
- Frontend: web React/Vite, ket noi MetaMask/Rabby, goi smart contract.

Luong hoat dong:

```text
User -> AuraPredict web -> Wallet -> Arc Testnet -> ArcPredictionMarket contract
```

## 2. Cai phan mem

Can cai:

- Node.js LTS: https://nodejs.org
- Git: https://git-scm.com/download/win
- MetaMask hoac Rabby
- GitHub account
- Vercel account

Kiem tra trong PowerShell:

```powershell
node --version
npm.cmd --version
git --version
```

## 3. Mo dung thu muc du an

```powershell
cd "C:\Users\duong\Documents\Codex\2026-05-21\h-y-vi-t-cho-t"
```

## 4. Tao project tu dau neu chua co code

Neu ban da co workspace hien tai, co the bo qua buoc 4 nay. Neu tao moi tu dau:

```powershell
mkdir AuraPredict
cd AuraPredict
npm.cmd init -y
npm.cmd install react react-dom viem
npm.cmd install -D hardhat @nomicfoundation/hardhat-ethers ethers dotenv typescript vite @vitejs/plugin-react @types/node @types/react @types/react-dom
```

Tao cac thu muc:

```powershell
mkdir contracts
mkdir scripts
mkdir test
mkdir src
mkdir src\contracts
```

## 5. Tao smart contract

File contract nam o:

```text
contracts/ArcPredictionMarket.sol
```

Trong workspace hien tai file nay da co san. Contract nay lam cac viec:

- `createMarket`: tao market YES/NO, resolver tu dong la nguoi tao market, va khoa creator bond.
- `bet`: stake native USDC cua Arc vao YES hoac NO, dong thoi cap nhat so vi tham gia va phat event `BetPlaced`.
- `resolve`: nguoi tao market hoac owner de xuat ket qua sau deadline.
- `dispute`: nguoi choi co the dispute ket qua trong dispute window bang dispute bond.
- `finalize`: chot ket qua neu het dispute window va khong ai dispute.
- `finalizeDispute`: owner chot ket qua cuoi neu co dispute.
- `cancel`: de xuat huy market va cho user refund sau khi finalize.
- `claim`: nguoi thang claim tien theo ty le pool.
- `getMarket`: frontend doc thong tin market.
- `positionOf`: frontend doc vi the cua tung user.

Neu ban muon tao file bang tay, tao file:

```powershell
notepad contracts\ArcPredictionMarket.sol
```

Sau do copy noi dung tu file hien co:

```text
C:\Users\duong\Documents\Codex\2026-05-21\h-y-vi-t-cho-t\contracts\ArcPredictionMarket.sol
```

Khong can sua contract neu ban chi muon chay ban MVP.

## 6. Tao Hardhat config

File:

```text
hardhat.config.cjs
```

File nay khai bao:

- Solidity `0.8.24`
- Network local `hardhat`
- Network `arcTestnet`
- RPC Arc Testnet
- Private key lay tu `.env`

Thong so Arc Testnet:

```text
Chain ID: 5042002
Chain ID hex: 0x4CEF52
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
Gas token: USDC
```

## 7. Tao deploy script

File:

```text
scripts/deploy.js
```

Script nay:

- Doc `MIN_STAKE_USDC` tu `.env`
- Deploy `ArcPredictionMarket`
- In contract address
- In link explorer

Lenh deploy ve sau:

```powershell
npm.cmd run deploy:arc
```

## 8. Tao file moi truong `.env`

Tao tu file mau:

```powershell
copy .env.example .env
```

Mo `.env`:

```powershell
notepad .env
```

Noi dung:

```env
ARC_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=
MIN_STAKE_USDC=0.1
VITE_PREDICTION_MARKET_ADDRESS=
```

Giai thich:

- `PRIVATE_KEY`: chi dung de deploy contract tu may ban.
- `VITE_PREDICTION_MARKET_ADDRESS`: dia chi contract sau khi deploy.

Quan trong: khong day `.env` len GitHub.

## 9. Lay private key va USDC testnet

Trong MetaMask/Rabby:

1. Tao mot vi moi chi dung cho testnet.
2. Export private key.
3. Dinh dang nen bat dau bang `0x`.
4. Dan vao `.env`:

```env
PRIVATE_KEY=0x...
```

Sau do lay USDC testnet:

1. Vao https://faucet.circle.com
2. Chon Arc Testnet neu co.
3. Nhap dia chi vi.
4. Nhan faucet.

## 10. Compile contract

```powershell
npm.cmd run compile
```

Neu thanh cong, ban se thay:

```text
Compiled 1 Solidity file successfully
```

## 11. Test contract

```powershell
npm.cmd test
```

Test hien co kiem tra:

- Tao market, stake YES/NO, resolve, claim.
- Huy market va refund.

Neu thay `2 passing` la dat.

## 12. Deploy contract len Arc Testnet

```powershell
npm.cmd run deploy:arc
```

Ket qua se co dang:

```text
ArcPredictionMarket deployed: 0xABC...
Explorer: https://testnet.arcscan.app/address/0xABC...
```

Copy dia chi `0xABC...`.

## 13. Noi frontend voi contract

Mo `.env`:

```powershell
notepad .env
```

Dien:

```env
VITE_PREDICTION_MARKET_ADDRESS=0xABC...
```

Luu file.

## 14. Chay frontend AuraPredict local

```powershell
npm.cmd run dev
```

Mo trinh duyet:

```text
http://127.0.0.1:5173/
```

Trong web:

1. Bam `Connect Wallet`.
2. Chap nhan add/switch sang Arc Testnet.
3. Tao market va nhap close time theo UTC.
4. Stake YES hoac NO.
5. Sau deadline, nguoi tao market de xuat ket qua.
6. Trong dispute window, nguoi choi co the dispute neu ket qua sai.
7. Het dispute window thi finalize, hoac owner finalize dispute.
8. User thang bam claim.

## 15. Dua code len GitHub

### 15.1. Tao repo GitHub

1. Vao https://github.com
2. Bam `+`
3. Chon `New repository`
4. Repository name: `AuraPredict`
5. Chon Public hoac Private
6. Khong tick README, gitignore, license
7. Bam `Create repository`

### 15.2. Push code

Thay `TEN_GITHUB_CUA_BAN` bang username cua ban:

```powershell
git init
git add .
git commit -m "Initial AuraPredict dapp"
git branch -M main
git remote add origin https://github.com/TEN_GITHUB_CUA_BAN/AuraPredict.git
git push -u origin main
```

Neu `git remote add origin` bao da ton tai:

```powershell
git remote set-url origin https://github.com/TEN_GITHUB_CUA_BAN/AuraPredict.git
git push -u origin main
```

## 16. Deploy len Vercel

### 16.1. Import repo

1. Vao https://vercel.com
2. Dang nhap bang GitHub
3. Bam `Add New...`
4. Chon `Project`
5. Chon repo `AuraPredict`
6. Bam `Import`

### 16.2. Cau hinh project

Dat:

```text
Project Name: aurapredict
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

Vercel domain mac dinh la `.vercel.app`, nen URL mong muon la:

```text
https://aurapredict.vercel.app
```

Neu ten da co nguoi dung, dung ten khac nhu:

```text
aura-predict
aurapredict-app
aurapredict-testnet
```

### 16.3. Them bien moi truong tren Vercel

Trong man hinh import hoac Project Settings -> Environment Variables, them:

```text
Name: VITE_PREDICTION_MARKET_ADDRESS
Value: 0xABC...
```

Chon:

- Production
- Preview
- Development

Khong them `PRIVATE_KEY` len Vercel.

### 16.4. Deploy

1. Bam `Deploy`.
2. Doi build xong.
3. Mo URL Vercel.
4. Ket noi vi va test lai.

## 17. Cap nhat sau nay

Moi lan sua code:

```powershell
git status
git add .
git commit -m "Update AuraPredict"
git push
```

Vercel se tu dong build lai sau khi ban push len GitHub.

## 18. Loi hay gap

### Web bao thieu contract address

Kiem tra `.env` local hoac Environment Variables tren Vercel co:

```text
VITE_PREDICTION_MARKET_ADDRESS
```

### Deploy contract bi loi

Kiem tra:

- `PRIVATE_KEY` da dien dung.
- Vi co USDC testnet tren Arc.
- RPC dung: `https://rpc.testnet.arc.network`

### Wallet khong o Arc Testnet

Bam `Connect Wallet`, app se yeu cau add/switch network. Neu can them tay:

```text
Network: Arc Testnet
Chain ID: 5042002
Chain ID hex: 0x4CEF52
RPC: https://rpc.testnet.arc.network
Currency: USDC
Explorer: https://testnet.arcscan.app
```

### Push GitHub loi authentication

Dang nhap GitHub trong browser, hoac cai GitHub Desktop / GitHub CLI. Cach de nhat cho nguoi moi la dung GitHub Desktop de sign in, sau do push lai bang PowerShell.

## 19. Nguon tham khao chinh thuc

- Arc docs: https://docs.arc.io
- GitHub push existing code: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
- Vercel import project: https://vercel.com/docs/getting-started-with-vercel/import
- Vercel environment variables: https://vercel.com/docs/projects/environment-variables
- Vercel domains: https://vercel.com/docs/domains/working-with-domains
