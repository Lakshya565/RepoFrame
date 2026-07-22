// Runtime-safe commit activity shapes. API responses cross an untyped network
// boundary, so this module validates both the current bundled contract and the
// temporary single-range contract used during a staggered frontend/backend deploy.

export type CommitActivityRange = "month" | "year";

export type CommitTimelineBucket = {
  periodStart: string;
  commitCount: number;
};

export type CommitActivityTimeline = {
  intervalLabel: string;
  totalCommits: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  buckets: CommitTimelineBucket[];
};

export type CommitActivityResponse = {
  owner: string;
  repo: string;
  normalizedUrl: string;
  ranges: Record<CommitActivityRange, CommitActivityTimeline>;
};

export type LegacyCommitActivityResponse = {
  owner: string;
  repo: string;
  normalizedUrl: string;
  range: CommitActivityRange;
  timeline: CommitActivityTimeline;
};

export type ParsedCommitActivityPayload =
  | { kind: "bundled"; data: CommitActivityResponse }
  | { kind: "legacy"; data: LegacyCommitActivityResponse };

const INVALID_RESPONSE_MESSAGE =
  "RepoFrame received an invalid commit activity response.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
  return value;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
  return value;
}

function readNonNegativeNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
  return value;
}

function parseTimeline(value: unknown): CommitActivityTimeline {
  if (!isRecord(value) || !Array.isArray(value.buckets)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const buckets = value.buckets.map((bucket): CommitTimelineBucket => {
    if (!isRecord(bucket)) {
      throw new Error(INVALID_RESPONSE_MESSAGE);
    }
    return {
      periodStart: readString(bucket, "periodStart"),
      commitCount: readNonNegativeNumber(bucket, "commitCount"),
    };
  });

  return {
    intervalLabel: readString(value, "intervalLabel"),
    totalCommits: readNonNegativeNumber(value, "totalCommits"),
    rangeStart: readNullableString(value, "rangeStart"),
    rangeEnd: readNullableString(value, "rangeEnd"),
    buckets,
  };
}

function parseIdentity(value: Record<string, unknown>) {
  return {
    owner: readString(value, "owner"),
    repo: readString(value, "repo"),
    normalizedUrl: readString(value, "normalizedUrl"),
  };
}

// Accepts the current bundled payload or the former single-range payload. Any
// malformed success response becomes a normal card error instead of reaching a
// render-time property access and crashing the entire Analysis route.
export function parseCommitActivityPayload(
  value: unknown,
): ParsedCommitActivityPayload {
  if (!isRecord(value)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const identity = parseIdentity(value);
  if (isRecord(value.ranges)) {
    return {
      kind: "bundled",
      data: {
        ...identity,
        ranges: {
          month: parseTimeline(value.ranges.month),
          year: parseTimeline(value.ranges.year),
        },
      },
    };
  }

  if (value.range === "month" || value.range === "year") {
    return {
      kind: "legacy",
      data: {
        ...identity,
        range: value.range,
        timeline: parseTimeline(value),
      },
    };
  }

  throw new Error(INVALID_RESPONSE_MESSAGE);
}

// Combines two validated legacy responses after the caller has explicitly
// requested each range. Identity mismatches are rejected as an invalid response.
export function combineLegacyCommitActivity(
  first: LegacyCommitActivityResponse,
  second: LegacyCommitActivityResponse,
): CommitActivityResponse {
  if (
    first.owner !== second.owner ||
    first.repo !== second.repo ||
    first.normalizedUrl !== second.normalizedUrl ||
    first.range === second.range
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const timelines = {
    [first.range]: first.timeline,
    [second.range]: second.timeline,
  } as Partial<Record<CommitActivityRange, CommitActivityTimeline>>;

  if (!timelines.month || !timelines.year) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return {
    owner: first.owner,
    repo: first.repo,
    normalizedUrl: first.normalizedUrl,
    ranges: { month: timelines.month, year: timelines.year },
  };
}
