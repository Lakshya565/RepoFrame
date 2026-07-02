from dataclasses import dataclass
from datetime import datetime, timezone

from app.services.github_service import WeeklyCommitCount

# Turns GitHub's weekly commit counts into a bucketed timeline for the Analysis-page
# graph. The bucket size adapts to how much history the data spans (an adaptive
# "interval ladder"), so a long span reads at a coarse grain and a short one stays
# fine-grained. This is deterministic data shaping — no network, no LLM — so it
# lives in a service and is unit-tested with injected weekly counts.
#
# NOTE: the current data source is GitHub's /stats/commit_activity endpoint, which
# only returns the last ~52 weeks. That span always resolves to the 2-week rung
# below; the coarser rungs exist so the ladder is ready if the source is later
# widened to full repository history.

SECONDS_PER_DAY = 86_400
DAYS_PER_WEEK = 7
SECONDS_PER_WEEK = SECONDS_PER_DAY * DAYS_PER_WEEK

# How many trailing days the "1 month" range covers, drawn from the daily breakdown
# GitHub returns with each week.
MONTH_LOOKBACK_DAYS = 30

# The "all time" range always spans at least this many weeks (~1 year). A repository
# younger than a year is padded with leading zero-count weeks so its timeline still
# reads as a full year rising into the real data, rather than collapsing to a handful
# of points. Matches the "1 year" view's grain (52 weeks lands on the 2-week rung).
MIN_ALL_RANGE_WEEKS = 52


# One bucketing choice: how many consecutive weekly counts to sum per bar, and the
# human label for that grain.
@dataclass(frozen=True)
class TimelineInterval:
    weeks_per_bucket: int
    label: str


# Span thresholds (in days) mapped to the bucket size used at or below that span,
# ordered ascending. choose_interval returns the first interval whose threshold the
# span fits under, else DEFAULT_INTERVAL. Tunable in one place:
#   <= 1 year  -> 2 weeks    |  <= 2 years -> 1 month
#   <= 5 years -> 3 months   |  >  5 years -> 6 months
# Labels are phrased so "each point spans <label>" reads naturally in the UI.
INTERVAL_LADDER: tuple[tuple[int, TimelineInterval], ...] = (
    (366, TimelineInterval(weeks_per_bucket=2, label="2 weeks")),
    (731, TimelineInterval(weeks_per_bucket=4, label="1 month")),
    (1826, TimelineInterval(weeks_per_bucket=13, label="3 months")),
)
DEFAULT_INTERVAL = TimelineInterval(weeks_per_bucket=26, label="6 months")

# The label for the daily "1 month" range (its bars are single days).
DAILY_INTERVAL_LABEL = "1 day"


# One uniform-granularity data point (a day or a week) before bucketing: the UTC
# Unix start of the period and its commit count.
@dataclass(frozen=True)
class PeriodSample:
    start: int
    count: int


# One rendered bar: the UTC ISO date the bucket starts on and its summed commits.
@dataclass(frozen=True)
class CommitTimelineBucket:
    period_start: str
    commit_count: int


# The full timeline: the bars, the chosen grain's label, the total commits across
# the window, and the window's start/end dates (None when there is no data).
@dataclass(frozen=True)
class CommitTimeline:
    buckets: list[CommitTimelineBucket]
    interval_label: str
    total_commits: int
    range_start: str | None
    range_end: str | None


# Picks the bucket grain for a given data span from the ladder above.
def choose_interval(span_days: int) -> TimelineInterval:
    for threshold_days, interval in INTERVAL_LADDER:
        if span_days <= threshold_days:
            return interval
    return DEFAULT_INTERVAL


# Converts a Unix timestamp (seconds) to a UTC ISO date string (YYYY-MM-DD).
def _to_iso_date(unix_seconds: int) -> str:
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).date().isoformat()


# Chunks uniform samples (days or weeks) into bars of `samples_per_bucket` each,
# summing their counts; the bar's date is its first sample's date. Zero-count samples
# are kept so the timeline stays continuous (a quiet stretch reads as low points, not
# a gap). An empty input yields an empty timeline.
def _bucket_samples(
    samples: list[PeriodSample],
    samples_per_bucket: int,
    label: str,
) -> CommitTimeline:
    if not samples:
        return CommitTimeline(
            buckets=[],
            interval_label="",
            total_commits=0,
            range_start=None,
            range_end=None,
        )

    buckets: list[CommitTimelineBucket] = []
    for start in range(0, len(samples), samples_per_bucket):
        chunk = samples[start : start + samples_per_bucket]
        buckets.append(
            CommitTimelineBucket(
                period_start=_to_iso_date(chunk[0].start),
                commit_count=sum(sample.count for sample in chunk),
            )
        )

    return CommitTimeline(
        buckets=buckets,
        interval_label=label,
        total_commits=sum(sample.count for sample in samples),
        range_start=_to_iso_date(samples[0].start),
        range_end=_to_iso_date(samples[-1].start),
    )


# Turns weekly counts into one sample per week.
def _weekly_samples(weeks: list[WeeklyCommitCount]) -> list[PeriodSample]:
    return [PeriodSample(start=week.week_start, count=week.total) for week in weeks]


# Expands weekly counts into one sample per day using each week's daily breakdown,
# oldest-first. Weeks without daily data (the full-history source) contribute nothing.
def _daily_samples(weeks: list[WeeklyCommitCount]) -> list[PeriodSample]:
    samples: list[PeriodSample] = []
    for week in weeks:
        for day_index, count in enumerate(week.days):
            samples.append(
                PeriodSample(
                    start=week.week_start + day_index * SECONDS_PER_DAY,
                    count=count,
                )
            )
    samples.sort(key=lambda sample: sample.start)
    return samples


# Prepends zero-count weeks so `weeks` spans at least `min_weeks`, keeping the series
# contiguous and chronological. Does nothing when the input is empty (no anchor date)
# or already long enough, so it only ever widens a short-but-nonempty history.
def _pad_leading_weeks(
    weeks: list[WeeklyCommitCount], min_weeks: int
) -> list[WeeklyCommitCount]:
    if not weeks or len(weeks) >= min_weeks:
        return weeks

    first_start = weeks[0].week_start
    missing = min_weeks - len(weeks)
    padding = [
        WeeklyCommitCount(
            week_start=first_start - (missing - index) * SECONDS_PER_WEEK,
            total=0,
        )
        for index in range(missing)
    ]
    return padding + weeks


# Buckets weekly commit counts into an adaptive-interval timeline (the "1 year" and
# "all time" ranges): the span across the weeks picks the grain from the ladder, then
# consecutive weeks are chunked into bars. An empty input yields an empty timeline.
# `min_weeks` floors the window length (used by "all time" to guarantee a full year).
def build_commit_timeline(
    weeks: list[WeeklyCommitCount], min_weeks: int = 0
) -> CommitTimeline:
    weeks = _pad_leading_weeks(weeks, min_weeks)
    if not weeks:
        return _bucket_samples([], 1, "")

    # Inclusive span from the first week's start to the end of the last week.
    span_seconds = weeks[-1].week_start - weeks[0].week_start
    span_days = span_seconds // SECONDS_PER_DAY + DAYS_PER_WEEK
    interval = choose_interval(span_days)
    return _bucket_samples(
        _weekly_samples(weeks), interval.weeks_per_bucket, interval.label
    )


# Buckets the last MONTH_LOOKBACK_DAYS of daily commit counts into a one-point-per-day
# timeline (the "1 month" range). Needs weeks that carry daily breakdowns.
def build_daily_timeline(
    weeks: list[WeeklyCommitCount],
    lookback_days: int = MONTH_LOOKBACK_DAYS,
) -> CommitTimeline:
    recent = _daily_samples(weeks)[-lookback_days:]
    return _bucket_samples(recent, 1, DAILY_INTERVAL_LABEL)
