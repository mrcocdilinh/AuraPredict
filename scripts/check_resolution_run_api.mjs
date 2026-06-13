const apiBase = String(
  process.env.AURA_INDEXER_URL ||
  process.env.VITE_AURA_INDEXER_URL ||
  "https://api.aurapredict.xyz"
).replace(/\/+$/, "");
const adminToken = String(process.env.AURA_RESOLUTION_ADMIN_TOKEN || "").trim();
const marketId = String(process.env.AURA_SMOKE_MARKET_ID || process.argv[2] || "").trim();

if (!adminToken || !marketId) {
  console.log("[smoke:resolution] skipped: set AURA_RESOLUTION_ADMIN_TOKEN and AURA_SMOKE_MARKET_ID to run.");
  process.exit(0);
}

const url = `${apiBase}/api/resolutions/${encodeURIComponent(marketId)}/run`;
const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${adminToken}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    force: true,
    propose: false
  })
});

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text.slice(0, 800) };
}

if (!response.ok) {
  console.error(`[smoke:resolution] failed: HTTP ${response.status}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const receipt = body?.receipt || body;
console.log(`[smoke:resolution] ok: market #${marketId}`);
console.log(JSON.stringify({
  outcome: receipt?.outcome || body?.outcome,
  confidence: receipt?.confidence ?? body?.confidence,
  consensusOutcome: receipt?.consensusOutcome,
  evidenceRows: Array.isArray(receipt?.evidence) ? receipt.evidence.length : undefined,
  proposalStatus: body?.proposal?.status,
  receiptHash: receipt?.receiptHash
}, null, 2));
