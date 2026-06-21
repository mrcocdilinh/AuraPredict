// Circle User-Controlled Wallets — frontend (email login, Phase 2).
// Flow: backend opens a session + (for new users) a PIN/wallet creation
// challenge; the W3S SDK runs that challenge in a Circle-hosted iframe so the
// user sets a PIN and their Arc SCA wallet is created. Keys stay with Circle.
import { INDEXER_URL } from "../constants";

const USER_ID_KEY = "aura_circle_user_id";
const WALLET_TYPE_KEY = "aura_wallet_type";

export type CircleWallet = { address: string; id: string };
type CircleW3SSdk = InstanceType<typeof import("@circle-fin/w3s-pw-web-sdk").W3SSdk>;

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
async function getSdk(appId: string): Promise<CircleW3SSdk> {
  if (!sdk) {
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    sdk = new W3SSdk({ appSettings: { appId } });
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
