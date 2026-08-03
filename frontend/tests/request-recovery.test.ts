import test from "node:test";
import assert from "node:assert/strict";

import {
  isRetryablePersistenceStatus,
  requestWithAuthRefreshRetry,
} from "../src/lib/request-recovery.ts";

test("returns an accepted authenticated response without refreshing", async () => {
  const tokens: boolean[] = [];
  const sent: Array<string | null> = [];
  const response = await requestWithAuthRefreshRetry(
    async (token) => {
      sent.push(token);
      return new Response(null, { status: 200 });
    },
    async (forceRefresh) => {
      tokens.push(forceRefresh);
      return "current";
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(tokens, [false]);
  assert.deepEqual(sent, ["current"]);
});

test("refreshes and replays exactly once after a 401", async () => {
  const sent: Array<string | null> = [];
  const response = await requestWithAuthRefreshRetry(
    async (token) => {
      sent.push(token);
      return new Response(null, {
        status: token === "fresh" ? 200 : 401,
      });
    },
    async (forceRefresh) => (forceRefresh ? "fresh" : "stale"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(sent, ["stale", "fresh"]);
});

test("does not replay when session refresh produces no token", async () => {
  let sends = 0;
  const response = await requestWithAuthRefreshRetry(
    async () => {
      sends += 1;
      return new Response(null, { status: 401 });
    },
    async (forceRefresh) => (forceRefresh ? null : "stale"),
  );

  assert.equal(response.status, 401);
  assert.equal(sends, 1);
});

test("autosave retries only transient response statuses", () => {
  for (const status of [408, 429, 500, 503]) {
    assert.equal(isRetryablePersistenceStatus(status), true);
  }
  for (const status of [400, 401, 403, 422]) {
    assert.equal(isRetryablePersistenceStatus(status), false);
  }
});
