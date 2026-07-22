import test from "node:test";
import assert from "node:assert/strict";

import {
  combineLegacyCommitActivity,
  parseCommitActivityPayload,
} from "../src/lib/commit-activity.ts";

const timeline = {
  intervalLabel: "1 day",
  totalCommits: 2,
  rangeStart: "2026-01-01",
  rangeEnd: "2026-01-02",
  buckets: [
    { periodStart: "2026-01-01", commitCount: 1 },
    { periodStart: "2026-01-02", commitCount: 1 },
  ],
};

const identity = {
  owner: "acme",
  repo: "demo",
  normalizedUrl: "https://github.com/acme/demo",
};

test("accepts the bundled month and year response", () => {
  const parsed = parseCommitActivityPayload({
    ...identity,
    ranges: { month: timeline, year: timeline },
  });
  assert.equal(parsed.kind, "bundled");
  if (parsed.kind === "bundled") {
    assert.equal(parsed.data.ranges.month.totalCommits, 2);
  }
});

test("normalizes two legacy single-range responses", () => {
  const year = parseCommitActivityPayload({ ...identity, range: "year", ...timeline });
  const month = parseCommitActivityPayload({
    ...identity,
    range: "month",
    ...timeline,
  });
  assert.equal(year.kind, "legacy");
  assert.equal(month.kind, "legacy");
  if (year.kind === "legacy" && month.kind === "legacy") {
    const combined = combineLegacyCommitActivity(year.data, month.data);
    assert.deepEqual(combined.ranges.month.buckets, timeline.buckets);
    assert.deepEqual(combined.ranges.year.buckets, timeline.buckets);
  }
});

test("rejects a success payload with missing ranges", () => {
  assert.throws(
    () => parseCommitActivityPayload(identity),
    /invalid commit activity response/i,
  );
});

test("rejects malformed buckets instead of leaking them to render", () => {
  assert.throws(
    () =>
      parseCommitActivityPayload({
        ...identity,
        ranges: {
          month: { ...timeline, buckets: [{ periodStart: "today" }] },
          year: timeline,
        },
      }),
    /invalid commit activity response/i,
  );
});

test("accepts a valid empty timeline", () => {
  const parsed = parseCommitActivityPayload({
    ...identity,
    ranges: {
      month: {
        intervalLabel: "1 day",
        totalCommits: 0,
        rangeStart: null,
        rangeEnd: null,
        buckets: [],
      },
      year: timeline,
    },
  });
  assert.equal(parsed.kind, "bundled");
});
