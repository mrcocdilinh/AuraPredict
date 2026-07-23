import assert from "node:assert/strict";
import test from "node:test";
import { baseSecurityHeaders, checkRateLimit } from "../indexer/httpSecurity.mjs";

function request(address = "127.0.0.1", forwarded = "") {
  return {
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    socket: { remoteAddress: address }
  };
}

test("rate limiter isolates scopes and rejects calls above the configured limit", () => {
  const req = request("10.0.0.1");
  assert.equal(checkRateLimit(req, "ai-test", { max: 2 }).allowed, true);
  assert.equal(checkRateLimit(req, "ai-test", { max: 2 }).allowed, true);
  const blocked = checkRateLimit(req, "ai-test", { max: 2 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(checkRateLimit(req, "circle-test", { max: 1 }).allowed, true);
});

test("proxy forwarding is only trusted when explicitly enabled", () => {
  const first = request("10.0.0.2", "203.0.113.10");
  const second = request("10.0.0.2", "203.0.113.11");
  assert.equal(checkRateLimit(first, "proxy-off", { max: 1 }).allowed, true);
  assert.equal(checkRateLimit(second, "proxy-off", { max: 1 }).allowed, false);
  assert.equal(checkRateLimit(first, "proxy-on", { max: 1, trustProxy: true }).allowed, true);
  assert.equal(checkRateLimit(second, "proxy-on", { max: 1, trustProxy: true }).allowed, true);
});

test("security headers include browser hardening defaults", () => {
  const headers = baseSecurityHeaders("application/json");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.match(headers["permissions-policy"], /camera=\(\)/);
});
