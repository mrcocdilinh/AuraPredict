// Circle User-Controlled Wallets — frontend (verified login).
// Email OTP: the user proves they own the email (Circle emails a one-time code)
// before any wallet access, so typing an email alone no longer logs anyone in.
// The authenticated userToken from login is then used for wallet init and
// transaction challenges (each still PIN-approved in the Circle-hosted UI).
import { getAbiItem, toFunctionSignature } from "viem";
import type { Abi, AbiFunction, Hash } from "viem";
import { INDEXER_URL, GOOGLE_CLIENT_ID } from "../constants";

const SESSION_KEY = "aura_circle_session";
const WALLET_TYPE_KEY = "aura_wallet_type";
const GOOGLE_PENDING_KEY = "aura_circle_google_pending";

export type CircleWallet = { address: string; id: string };
type CircleSession = { userToken: string; encryptionKey: string; walletId: string; address: string };
type CircleW3SSdk = InstanceType<typeof import("@circle-fin/w3s-pw-web-sdk").W3SSdk>;
type LoginResult = { userToken: string; encryptionKey: string };

// --- session storage ------------------------------------------------------
function getSession(): CircleSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CircleSession) : null;
  } catch {
    return null;
  }
}
function setSession(session: CircleSession) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.localStorage.setItem(WALLET_TYPE_KEY, "circle");
  } catch {
    // ignore storage errors
  }
}
export function clearCircleSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(WALLET_TYPE_KEY);
  } catch {
    // ignore storage errors
  }
}

// --- SDK + app id ---------------------------------------------------------
let cachedAppId = "";
async function ensureAppId(): Promise<string> {
  if (cachedAppId) return cachedAppId;
  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/config`);
  const data = (await res.json().catch(() => ({}))) as { appId?: string };
  cachedAppId = data.appId || "";
  return cachedAppId;
}

// The W3S SDK reports login results through an onLoginComplete callback set at
// construction. Email OTP awaits in-page via `pendingLogin`; Google returns
// after an OAuth redirect (no in-page promise), so its result is handed to the
// app through registered handlers.
let pendingLogin: { resolve: (r: LoginResult) => void; reject: (e: Error) => void } | null = null;
let onVerifiedLogin: ((wallet: CircleWallet) => void) | null = null;
let onVerifiedLoginError: ((message: string) => void) | null = null;
export function setCircleLoginHandlers(
  onLogin: (wallet: CircleWallet) => void,
  onError: (message: string) => void
): void {
  onVerifiedLogin = onLogin;
  onVerifiedLoginError = onError;
}

let sdk: CircleW3SSdk | null = null;
type CircleLoginConfigs = NonNullable<Parameters<CircleW3SSdk["updateConfigs"]>[0]>["loginConfigs"];
async function getSdk(loginConfigs?: CircleLoginConfigs): Promise<CircleW3SSdk> {
  if (!sdk) {
    const appId = await ensureAppId();
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    sdk = new W3SSdk(
      { appSettings: { appId }, ...(loginConfigs ? { loginConfigs } : {}) },
      (error, result) => {
        const data = result as { userToken?: string; encryptionKey?: string } | undefined;
        if (pendingLogin) {
          const settle = pendingLogin;
          pendingLogin = null;
          if (error) settle.reject(new Error(errorMessage(error, "Login failed.")));
          else settle.resolve({ userToken: data?.userToken || "", encryptionKey: data?.encryptionKey || "" });
          return;
        }
        // Google redirect return — no in-page await; finish and notify the app.
        if (error) {
          onVerifiedLoginError?.(errorMessage(error, "Google login failed."));
          return;
        }
        if (sdk && data?.userToken && data?.encryptionKey) {
          finishLogin(sdk, data.userToken, data.encryptionKey)
            .then((wallet) => onVerifiedLogin?.(wallet))
            .catch((err) => onVerifiedLoginError?.(err instanceof Error ? err.message : String(err)));
        }
      }
    );
  } else if (loginConfigs) {
    sdk.updateConfigs({ appSettings: { appId: cachedAppId }, loginConfigs });
  }
  return sdk;
}

function errorMessage(error: unknown, fallback: string): string {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : fallback;
}

// --- login (email OTP) ----------------------------------------------------
export async function circleEmailLogin(email: string): Promise<CircleWallet> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 5 || !normalized.includes("@")) throw new Error("Please enter a valid email.");

  const client = await getSdk();
  const deviceId = await client.getDeviceId();

  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/login/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId, email: normalized })
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not start email login.");
  }
  const { deviceToken, deviceEncryptionKey, otpToken } = (await res.json()) as {
    deviceToken: string;
    deviceEncryptionKey: string;
    otpToken: string;
  };

  const appId = await ensureAppId();
  client.updateConfigs({ appSettings: { appId }, loginConfigs: { deviceToken, deviceEncryptionKey, otpToken } });

  // verifyOtp opens Circle's hosted OTP screen; onLoginComplete resolves this.
  const login = new Promise<LoginResult>((resolve, reject) => {
    pendingLogin = { resolve, reject };
  });
  client.verifyOtp();
  const { userToken, encryptionKey } = await login;
  if (!userToken || !encryptionKey) throw new Error("Login did not complete.");

  return finishLogin(client, userToken, encryptionKey);
}

// After a verified login, create the wallet (new users set a PIN) and resolve
// the Arc address.
async function finishLogin(client: CircleW3SSdk, userToken: string, encryptionKey: string): Promise<CircleWallet> {
  const initRes = await fetch(`${INDEXER_URL}/api/wallet/circle/init-wallet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userToken })
  });
  if (!initRes.ok) {
    const data = (await initRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not initialize the wallet.");
  }
  const init = (await initRes.json()) as { challengeId: string; walletReady: boolean };
  if (init.challengeId) {
    client.setAuthentication({ userToken, encryptionKey });
    await new Promise<void>((resolve, reject) => {
      client.execute(init.challengeId, (error) => {
        if (error) reject(new Error(errorMessage(error, "PIN/wallet setup failed.")));
        else resolve();
      });
    });
  }

  const wallet = await pollWallet(userToken);
  if (!wallet) throw new Error("Wallet was not created. Please try again.");
  setSession({ userToken, encryptionKey, walletId: wallet.id, address: wallet.address });
  return wallet;
}

async function fetchWallet(userToken: string): Promise<CircleWallet | null> {
  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/wallets-by-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userToken })
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({ wallets: [] }))) as { wallets?: Array<{ id: string; address: string }> };
  const wallet = (data.wallets || []).find((entry) => entry.address);
  return wallet ? { address: wallet.address, id: wallet.id } : null;
}

// Circle provisions the SCA wallet asynchronously after the PIN challenge.
async function pollWallet(userToken: string, attempts = 12, delayMs = 1500): Promise<CircleWallet | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const wallet = await fetchWallet(userToken);
    if (wallet) return wallet;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

// Restore a stored session on reload. The userToken may have expired (60 min);
// if so, transactions will surface an error and the user logs in again.
export async function restoreCircleWallet(): Promise<CircleWallet | null> {
  const session = getSession();
  if (!session?.address || !session.walletId) return null;
  return { address: session.address, id: session.walletId };
}

// --- login (Google social) ------------------------------------------------
// performLogin redirects to Google and back, so this returns nothing; the
// result arrives via onLoginComplete on the return page (circleResumeGoogleLogin
// re-inits the SDK to catch it). Register handlers with setCircleLoginHandlers.
export async function circleGoogleLogin(): Promise<void> {
  const redirectUri = window.location.origin;
  const client = await getSdk();
  const deviceId = await client.getDeviceId();

  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/login/social`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId })
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not start Google login.");
  }
  const { deviceToken, deviceEncryptionKey } = (await res.json()) as {
    deviceToken: string;
    deviceEncryptionKey: string;
  };

  const appId = await ensureAppId();
  // Remember we're mid-login so the return page knows to re-init and finish.
  window.localStorage.setItem(GOOGLE_PENDING_KEY, JSON.stringify({ deviceToken, deviceEncryptionKey }));
  const loginConfigs = {
    deviceToken,
    deviceEncryptionKey,
    google: { clientId: GOOGLE_CLIENT_ID, redirectUri, selectAccountPrompt: true }
  };
  client.updateConfigs({ appSettings: { appId }, loginConfigs });
  // SocialLoginProvider.GOOGLE === "Google"; the enum isn't re-exported, so pass
  // the value directly with the parameter's type.
  client.performLogin("Google" as Parameters<CircleW3SSdk["performLogin"]>[0]);
}

// Call on app load: if we redirected out for Google, re-init the SDK with the
// stored configs so it processes the OAuth return and fires onLoginComplete.
export async function circleResumeGoogleLogin(): Promise<void> {
  const raw = window.localStorage.getItem(GOOGLE_PENDING_KEY);
  if (!raw) return;
  window.localStorage.removeItem(GOOGLE_PENDING_KEY);
  try {
    const { deviceToken, deviceEncryptionKey } = JSON.parse(raw) as {
      deviceToken: string;
      deviceEncryptionKey: string;
    };
    await getSdk({
      deviceToken,
      deviceEncryptionKey,
      google: { clientId: GOOGLE_CLIENT_ID, redirectUri: window.location.origin, selectAccountPrompt: true }
    });
    // onLoginComplete (set in getSdk) will fire with the OAuth result.
  } catch {
    // ignore — user can retry
  }
}

// --- transactions ---------------------------------------------------------
function toCircleParam(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toCircleParam);
  return value;
}

export async function circleSendTx(params: {
  walletId: string;
  contractAddress: string;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}): Promise<Hash> {
  const session = getSession();
  if (!session?.userToken) throw new Error("Please sign in with email again.");
  const walletId = params.walletId || session.walletId;
  if (!walletId) throw new Error("Circle wallet is not ready.");

  const abiItem = getAbiItem({ abi: params.abi, name: params.functionName }) as AbiFunction | undefined;
  if (!abiItem) throw new Error(`Unknown contract function: ${params.functionName}`);
  const abiFunctionSignature = toFunctionSignature(abiItem);
  const abiParameters = params.args.map(toCircleParam);

  const res = await fetch(`${INDEXER_URL}/api/wallet/circle/contract-execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userToken: session.userToken,
      walletId,
      contractAddress: params.contractAddress,
      abiFunctionSignature,
      abiParameters
    })
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not start the Circle transaction.");
  }
  const data = (await res.json()) as { challengeId: string };
  if (!data.challengeId) throw new Error("Circle did not return a transaction challenge.");

  const client = await getSdk();
  client.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });
  const immediateHash = await new Promise<string>((resolve, reject) => {
    client.execute(data.challengeId, (error, result) => {
      if (error) reject(new Error(errorMessage(error, "Transaction approval failed.")));
      else resolve((result as { data?: { txHash?: string } } | undefined)?.data?.txHash || "");
    });
  });
  if (immediateHash) return immediateHash as Hash;

  const txHash = await pollTxHash(session.userToken, walletId);
  if (!txHash) throw new Error("Transaction is processing — check your profile in a moment for the result.");
  return txHash as Hash;
}

async function pollTxHash(userToken: string, walletId: string, attempts = 40, delayMs = 1200): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`${INDEXER_URL}/api/wallet/circle/tx-status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userToken, walletId })
      });
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
