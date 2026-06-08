const baseUrl = String(process.argv[2] || process.env.AURA_API_BASE || "https://api.aurapredict.xyz").replace(/\/$/, "");

const checks = [
  {
    path: "/health",
    validate(body) {
      if (!body?.ok) throw new Error("health.ok is not true");
      if (!body?.contractAddress) throw new Error("health.contractAddress missing");
      if (!body?.features?.socialReports) throw new Error("health.features.socialReports missing");
    }
  },
  {
    path: "/api/stats",
    validate(body) {
      if (!body?.stats) throw new Error("stats payload missing");
      if (!Number.isFinite(Number(body.stats.totalMarkets))) throw new Error("stats.totalMarkets invalid");
    }
  },
  {
    path: "/api/social/reports",
    validate(body) {
      if (!Array.isArray(body?.reports)) throw new Error("social reports array missing");
    }
  },
  {
    path: "/api/oracle-reputation",
    validate(body) {
      if (!body?.reputation) throw new Error("oracle reputation payload missing");
    }
  }
];

async function readJson(path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON response`);
  }
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${body?.error || text.slice(0, 120)}`);
  }
  return body;
}

let failures = 0;
for (const check of checks) {
  try {
    const body = await readJson(check.path);
    check.validate(body);
    console.log(`OK ${check.path}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${check.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`${failures} production API check${failures === 1 ? "" : "s"} failed for ${baseUrl}`);
  process.exitCode = 1;
} else {
  console.log(`All production API checks passed for ${baseUrl}`);
}
