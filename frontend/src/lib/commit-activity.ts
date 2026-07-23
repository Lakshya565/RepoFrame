// Runtime-safe commit activity shapes. API responses cross an untyped network
// boundary, so this module validates the bundled month/year contract before the
// payload reaches React.

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

// Any malformed success response becomes a normal card error instead of reaching
// a render-time property access and crashing the entire Analysis route.
export function parseCommitActivityPayload(
  value: unknown,
): CommitActivityResponse {
  if (!isRecord(value)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const identity = parseIdentity(value);
  if (isRecord(value.ranges)) {
    return {
      ...identity,
      ranges: {
        month: parseTimeline(value.ranges.month),
        year: parseTimeline(value.ranges.year),
      },
    };
  }

  throw new Error(INVALID_RESPONSE_MESSAGE);
}
