// Circle User-Controlled Wallets (email/social login) — backend.
// Lets users sign in without an injected crypto wallet: Circle custodies the
// key shards, the user authorizes with a PIN/social challenge in the frontend
// W3S SDK. Server-side we only create the user, mint a short-lived session
// token, and open the wallet-creation challenge. Keys never touch this server.
import { initiateUserControlledWalletsClient, Blockchain } from "@circle-fin/user-controlled-wallets";

const CIRCLE_API_KEY = String(process.env.CIRCLE_APP_API_KEY || "").trim();
const CIRCLE_APP_ID = String(process.env.CIRCLE_APP_ID || "").trim();

let cachedClient = null;
function client() {
  if (!CIRCLE_API_KEY) throw new Error("CIRCLE_APP_API_KEY is not configured.");
  if (!cachedClient) cachedClient = initiateUserControlledWalletsClient({ apiKey: CIRCLE_API_KEY });
  return cachedClient;
}

export function circleWalletsEnabled() {
  return Boolean(CIRCLE_API_KEY && CIRCLE_APP_ID);
}

export function circleAppId() {
  return CIRCLE_APP_ID;
}

function errorCode(error) {
  return Number(error?.response?.data?.code ?? error?.code ?? 0);
}

// Create (idempotent) the Circle user, mint a 60-minute session token, and — for
// a brand-new user — open the PIN + wallet creation challenge on Arc. The
// frontend SDK executes the returned challengeId. Returning users already have a
// wallet+PIN (155106) so no challenge is needed (walletReady=true).
export async function circleStartSession(userId) {
  const c = client();
  try {
    await c.createUser({ userId });
  } catch (error) {
    if (errorCode(error) !== 155101) throw error; // 155101: user already exists
  }

  const tokenRes = await c.createUserToken({ userId });
  const userToken = tokenRes.data?.userToken;
  const encryptionKey = tokenRes.data?.encryptionKey;
  if (!userToken || !encryptionKey) throw new Error("Circle did not return a user session token.");

  let challengeId = "";
  let walletReady = false;
  try {
    const initRes = await c.createUserPinWithWallets({
      userToken,
      blockchains: [Blockchain.ArcTestnet],
      accountType: "SCA"
    });
    challengeId = initRes.data?.challengeId || "";
  } catch (error) {
    if (errorCode(error) === 155106) walletReady = true; // already has wallet + PIN
    else throw error;
  }

  return { appId: CIRCLE_APP_ID, userToken, encryptionKey, challengeId, walletReady };
}

// List the user's Arc wallet(s) — called after the creation challenge completes
// so the app can read the address, balance, and let the user stake.
export async function circleListWallets(userId) {
  const c = client();
  const tokenRes = await c.createUserToken({ userId });
  const userToken = tokenRes.data?.userToken;
  if (!userToken) throw new Error("Circle did not return a user session token.");
  const res = await c.listWallets({ userToken });
  return (res.data?.wallets || []).map((wallet) => ({
    id: wallet.id,
    address: wallet.address,
    blockchain: wallet.blockchain,
    accountType: wallet.accountType,
    state: wallet.state
  }));
}
