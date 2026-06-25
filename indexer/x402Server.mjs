// x402 server-side gate — calls Circle Gateway API directly, no peer deps.
// When AURA_X402_SELLER_ADDRESS is set, GET /api/agent/markets returns 402
// for unauthenticated requests and serves data after valid payment.

const SELLER_ADDRESS = String(process.env.AURA_X402_SELLER_ADDRESS || "").trim();
const MARKET_PRICE = String(process.env.AURA_X402_MARKET_PRICE || "0.005").trim();
const GATEWAY_API = "https://gateway-api-testnet.circle.com";
// Circle Gateway identifies Arc Testnet by CAIP-2 chain ID
const ARC_NETWORK_ID = "eip155:5042002";
// USDC on Arc Testnet: 6 decimals (per Circle Gateway assets list)
const ARC_USDC_DECIMALS = 6;
const GATEWAY_AUTH_VALIDITY = 604900; // 7 days + 100s buffer

export function x402ServerEnabled() {
  return Boolean(SELLER_ADDRESS);
}

function priceToAtomic(usdcDecimal) {
  // e.g. "0.005" → "5000" (6 decimals)
  return String(Math.round(parseFloat(usdcDecimal) * 10 ** ARC_USDC_DECIMALS));
}

let cachedArcKind = null;
async function getArcKind() {
  if (cachedArcKind) return cachedArcKind;
  const res = await fetch(`${GATEWAY_API}/v1/x402/supported`);
  if (!res.ok) throw new Error(`Gateway supported fetch failed: ${res.status}`);
  const data = await res.json();
  cachedArcKind = (data.kinds || []).find((k) => k.network === ARC_NETWORK_ID);
  if (!cachedArcKind) throw new Error(`${ARC_NETWORK_ID} not in Gateway supported list`);
  return cachedArcKind;
}

function buildPaymentRequirements(url, kind) {
  // Circle Gateway response: extra.assets[0].address is the USDC token address
  const usdcAddress = kind.extra?.assets?.[0]?.address || "";
  return {
    x402Version: 2,
    resource: { url, description: "AuraOn Live Market Feed", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: ARC_NETWORK_ID,
        asset: usdcAddress,
        amount: priceToAtomic(MARKET_PRICE),
        payTo: SELLER_ADDRESS,
        maxTimeoutSeconds: GATEWAY_AUTH_VALIDITY,
        extra: {
          name: kind.extra?.name || "GatewayWalletBatched",
          version: kind.extra?.version || "1",
          verifyingContract: kind.extra?.verifyingContract || ""
        }
      }
    ]
  };
}

// Call before serving a paid route.
// Returns true  → payment OK (or gate disabled), caller should serve data.
// Returns false → 402 or error already written to res, caller should return.
export async function requireMarketPayment(req, res) {
  if (!x402ServerEnabled()) return true;

  const paymentHeader = req.headers["payment-signature"];

  if (!paymentHeader) {
    // No payment → send 402
    try {
      const kind = await getArcKind();
      const requirements = buildPaymentRequirements(req.url ?? "/api/agent/markets", kind);
      const encoded = Buffer.from(JSON.stringify(requirements)).toString("base64");
      res.writeHead(402, { "Content-Type": "application/json", "PAYMENT-REQUIRED": encoded });
      res.end(JSON.stringify({}));
    } catch (err) {
      console.warn("[x402] 402 build failed, serving open:", err.message);
      return true; // fallback: serve data if gateway unreachable
    }
    return false;
  }

  // Payment header present → verify then settle
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));
    const kind = await getArcKind();
    const paymentRequirements = buildPaymentRequirements(
      req.url ?? "/api/agent/markets",
      kind
    ).accepts[0];

    const verifyRes = await fetch(`${GATEWAY_API}/v1/x402/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, paymentRequirements })
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: verifyData.invalidReason || "Payment invalid" }));
      return false;
    }

    const settleRes = await fetch(`${GATEWAY_API}/v1/x402/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, paymentRequirements })
    });
    const settleData = await settleRes.json();
    if (!settleData.success) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payment settlement failed" }));
      return false;
    }

    res.setHeader(
      "X-PAYMENT-RESPONSE",
      Buffer.from(JSON.stringify(settleData)).toString("base64")
    );
    console.log(`[x402] Payment settled: ${MARKET_PRICE} USDC from ${payment?.accepted?.from || "?"}`);
    return true;
  } catch (err) {
    console.warn("[x402] Payment verify/settle error (serving open):", err.message);
    return true; // non-fatal: serve data on unexpected error
  }
}
