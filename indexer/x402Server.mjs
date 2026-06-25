// x402 server-side gate for AuraOn paid endpoints.
// Wraps Circle Gateway middleware so any route can require USDC payment
// before serving data. Enabled when AURA_X402_SELLER_ADDRESS is set.
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const SELLER_ADDRESS = String(process.env.AURA_X402_SELLER_ADDRESS || "").trim();
const MARKET_FEED_PRICE = String(process.env.AURA_X402_MARKET_PRICE || "0.005").trim();
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com";

export function x402ServerEnabled() {
  return Boolean(SELLER_ADDRESS);
}

let _middleware = null;
function getMiddleware() {
  if (!_middleware) {
    _middleware = createGatewayMiddleware({
      facilitatorUrl: GATEWAY_API_URL,
      sellerAddress: SELLER_ADDRESS,
      description: "AuraOn Live Market Feed — real-time prediction market data on Arc Testnet",
      networks: ["arcTestnet"]
    });
  }
  return _middleware;
}

// Call before serving a paid endpoint. If payment is missing/invalid,
// writes 402 to res and resolves false. If payment is valid, resolves true.
export async function requireMarketPayment(req, res) {
  if (!x402ServerEnabled()) return true; // gate off — passthrough
  let granted = false;
  try {
    await getMiddleware().require(MARKET_FEED_PRICE)(req, res, () => {
      granted = true;
    });
  } catch (err) {
    if (!res.writableEnded) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payment gate error." }));
    }
  }
  return granted;
}
