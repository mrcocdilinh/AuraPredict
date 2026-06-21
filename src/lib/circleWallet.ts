// Circle User-Controlled Wallets — frontend (email login, Phase 2).
// Flow: backend opens a session + (for new users) a PIN/wallet creation
// challenge; the W3S SDK runs that challenge in a Circle-hosted iframe so the
// user sets a PIN and their Arc SCA wallet is created. Keys stay with Circle.
import { getAbiItem, toFunctionSignature } from "viem";
import type { Abi, AbiFunction, Hash } from "viem";
import { INDEXER_URL } from "../constants";

const USER_ID_KEY = "aura_circle_user_id";
const WALLET_TYPE_KEY = "aura_wallet_type";

export type CircleWallet = { address: string; id: string };
type CircleW3SSdk = InstanceType<typeof import("@circle-fin/w3s-pw-web-sdk").W3SSdk>;

let cachedAppId = "";
async function ensureAppId(): Promise<string> {
  if (cachedAppId) return cachedAppId;
  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/config`);
  const data = (await res.json().catch(() => ({}))) as { appId?: string };
  cachedAppId = data.appId || "";
  return cachedAppId;
}

type SessionResponse = {
  appId: string;
  userToken: string;
  encryptionKey: string;
  challengeId: string;
  walletReady: boolean;
};

function emailToUserId(email: string): string {
  return email.trim().toLowerCase();
}

let sdk: CircleW3SSdk | null = null;
async function getSdk(appId?: string): Promise<CircleW3SSdk> {
  const id = appId || (await ensureAppId());
  if (appId) cachedAppId = appId;
  if (!sdk) {
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    sdk = new W3SSdk({ appSettings: { appId: id } });
  }
  return sdk;
}

async function startSession(userId: string): Promise<SessionResponse> {
  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId })
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not start Circle session.");
  }
  return res.json() as Promise<SessionResponse>;
}

async function runChallenge(session: SessionResponse): Promise<void> {
  const client = await getSdk(session.appId);
  client.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });
  await client.getDeviceId();
  await new Promise<void>((resolve, reject) => {
    client.execute(session.challengeId, (error) => {
      if (error) {
        const message = typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message)
          : "Circle PIN/wallet setup failed.";
        reject(new Error(message));
        return;
      }
      resolve();
    });
  });
}

async function fetchArcWallet(userId: string): Promise<CircleWallet | null> {
  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/wallets?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({ wallets: [] }))) as { wallets?: Array<{ id: string; address: string }> };
  const wallet = (data.wallets || []).find((entry) => entry.address);
  return wallet ? { address: wallet.address, id: wallet.id } : null;
}

// Circle provisions the SCA wallet asynchronously after the PIN challenge, so
// poll until it's queryable instead of failing on the first (too-early) read.
async function pollArcWallet(userId: string, attempts = 12, delayMs = 1500): Promise<CircleWallet | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const wallet = await fetchArcWallet(userId);
    if (wallet) return wallet;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

// Email login end to end: session -> PIN/wallet challenge (new users) -> address.
export async function circleEmailLogin(email: string): Promise<CircleWallet> {
  const userId = emailToUserId(email);
  if (userId.length < 5 || !userId.includes("@")) throw new Error("Please enter a valid email.");
  const session = await startSession(userId);
  if (session.challengeId) await runChallenge(session);
  const wallet = await pollArcWallet(userId);
  if (!wallet) throw new Error("Wallet was not created. Please try again.");
  window.localStorage.setItem(USER_ID_KEY, userId);
  window.localStorage.setItem(WALLET_TYPE_KEY, "circle");
  return wallet;
}

export function savedCircleUserId(): string {
  try {
    return window.localStorage.getItem(USER_ID_KEY) || "";
  } catch {
    return "";
  }
}

export function clearCircleSession(): void {
  try {
    window.localStorage.removeItem(USER_ID_KEY);
    window.localStorage.removeItem(WALLET_TYPE_KEY);
  } catch {
    // ignore storage errors
  }
}

// Restore a previously logged-in Circle wallet on reload (address only — no PIN
// challenge needed once the wallet exists).
export async function restoreCircleWallet(): Promise<CircleWallet | null> {
  const userId = savedCircleUserId();
  if (!userId) return null;
  return fetchArcWallet(userId);
}

// Circle wants ABI params as JSON-friendly values (strings/bools/arrays), so
// stringify bigints and recurse arrays; everything else passes through.
function toCircleParam(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toCircleParam);
  return value;
}

// Send a contract write through the Circle wallet: open a transaction challenge
// on the backend, run it in the W3S SDK (user approves with PIN), and return the
// on-chain tx hash so the caller can wait for the receipt like a normal write.
export async function circleSendTx(params: {
  walletId: string;
  contractAddress: string;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}): Promise<Hash> {
  const userId = savedCircleUserId();
  if (!userId) throw new Error("Not signed in with email.");
  if (!params.walletId) throw new Error("Circle wallet is not ready.");
  const abiItem = getAbiItem({ abi: params.abi, name: params.functionName }) as AbiFunction | undefined;
  if (!abiItem) throw new Error(`Unknown contract function: ${params.functionName}`);
  const abiFunctionSignature = toFunctionSignature(abiItem);
  const abiParameters = params.args.map(toCircleParam);

  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/contract-execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId,
      walletId: params.walletId,
      contractAddress: params.contractAddress,
      abiFunctionSignature,
      abiParameters
    })
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not start the Circle transaction.");
  }
  const data = (await res.json()) as { userToken: string; encryptionKey: string; challengeId: string };
  if (!data.challengeId) throw new Error("Circle did not return a transaction challenge.");

  const client = await getSdk();
  client.setAuthentication({ userToken: data.userToken, encryptionKey: data.encryptionKey });
  const immediateHash = await new Promise<string>((resolve, reject) => {
    client.execute(data.challengeId, (error, result) => {
      if (error) {
        const message = typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message)
          : "Circle transaction approval failed.";
        reject(new Error(message));
        return;
      }
      resolve((result as { data?: { txHash?: string } } | undefined)?.data?.txHash || "");
    });
  });
  if (immediateHash) return immediateHash as Hash;
  // The challenge is approved but Circle submits the tx asynchronously, so poll
  // for the on-chain hash before handing back to the caller's receipt wait.
  const txHash = await pollTxHash(userId, params.walletId);
  if (!txHash) throw new Error("Transaction is processing — check your profile in a moment for the result.");
  return txHash as Hash;
}

async function pollTxHash(userId: string, walletId: string, attempts = 24, delayMs = 2000): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(
        `${INDEXER_URL}/api/wallet/circle/tx-status?userId=${encodeURIComponent(userId)}&walletId=${encodeURIComponent(walletId)}`
      );
      if (res.ok) {
        const data = (await res.json()) as { txHash?: string };
        if (data.txHash) return data.txHash;
      }
    } catch {
      // transient — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return "";
}
