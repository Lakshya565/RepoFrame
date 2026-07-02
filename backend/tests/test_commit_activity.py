import unittest

from app.services.commit_activity import (
    DEFAULT_INTERVAL,
    build_commit_timeline,
    build_daily_timeline,
    choose_interval,
)
from app.services.github_service import WeeklyCommitCount

SECONDS_PER_DAY = 86_400
SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY


# Builds a chronological run of weekly counts starting at a fixed Unix time, so
# tests can control the span and the per-week totals precisely.
def make_weeks(totals: list[int], start: int = 1_600_000_000) -> list[WeeklyCommitCount]:
    return [
        WeeklyCommitCount(week_start=start + index * SECONDS_PER_WEEK, total=total)
        for index, total in enumerate(totals)
    ]


class ChooseIntervalTests(unittest.TestCase):
    def test_year_or_less_uses_two_week_buckets(self) -> None:
        # The last-12-months data source always lands on this rung.
        self.assertEqual(choose_interval(364).label, "2 weeks")
        self.assertEqual(choose_interval(366).label, "2 weeks")

    def test_ladder_steps_up_with_span(self) -> None:
        self.assertEqual(choose_interval(500).label, "1 month")
        self.assertEqual(choose_interval(1000).label, "3 months")

    def test_beyond_five_years_uses_default(self) -> None:
        self.assertEqual(choose_interval(3000), DEFAULT_INTERVAL)
        self.assertEqual(choose_interval(3000).label, "6 months")


class BuildCommitTimelineTests(unittest.TestCase):
    def test_empty_weeks_yield_empty_timeline(self) -> None:
        timeline = build_commit_timeline([])
        self.assertEqual(timeline.buckets, [])
        self.assertEqual(timeline.total_commits, 0)
        self.assertIsNone(timeline.range_start)
        self.assertIsNone(timeline.range_end)

    def test_year_of_weeks_buckets_into_two_week_bars(self) -> None:
        # 52 weeks (~1 year) -> 2-week rung -> 26 bars, each summing two weeks.
        weeks = make_weeks([1] * 52)
        timeline = build_commit_timeline(weeks)

        self.assertEqual(timeline.interval_label, "2 weeks")
        self.assertEqual(len(timeline.buckets), 26)
        self.assertTrue(all(bucket.commit_count == 2 for bucket in timeline.buckets))
        self.assertEqual(timeline.total_commits, 52)

    def test_bucket_sums_and_period_start_align_to_first_week(self) -> None:
        weeks = make_weeks([3, 5, 2, 4])  # 4 weeks -> two 2-week bars: 8 then 6
        timeline = build_commit_timeline(weeks)

        self.assertEqual([b.commit_count for b in timeline.buckets], [8, 6])
        # The first bar starts on the first week's date.
        self.assertEqual(timeline.buckets[0].period_start, timeline.range_start)

    def test_trailing_partial_bucket_is_kept(self) -> None:
        # An odd number of weeks leaves a final single-week bar rather than dropping it.
        weeks = make_weeks([1, 1, 1])
        timeline = build_commit_timeline(weeks)

        self.assertEqual([b.commit_count for b in timeline.buckets], [2, 1])
        self.assertEqual(timeline.total_commits, 3)

    def test_min_weeks_pads_short_history_to_a_full_year(self) -> None:
        # A repo with only 4 weeks of history, asked to span a year, is padded up
        # front with zero weeks so it still lands on the 2-week rung (26 bars) with
        # the real commits sitting at the end.
        weeks = make_weeks([3, 5, 2, 4])
        timeline = build_commit_timeline(weeks, min_weeks=52)

        self.assertEqual(timeline.interval_label, "2 weeks")
        self.assertEqual(len(timeline.buckets), 26)
        # Padding adds no commits; the real weeks land in the last two 2-week bars
        # ([3, 5] -> 8, then [2, 4] -> 6) and every earlier bar is zero.
        self.assertEqual(timeline.total_commits, 14)
        self.assertEqual([b.commit_count for b in timeline.buckets[-2:]], [8, 6])
        self.assertTrue(all(b.commit_count == 0 for b in timeline.buckets[:-2]))

    def test_min_weeks_leaves_longer_history_untouched(self) -> None:
        # History already at/above the floor is not padded.
        weeks = make_weeks([1] * 52)
        timeline = build_commit_timeline(weeks, min_weeks=52)

        self.assertEqual(len(timeline.buckets), 26)
        self.assertEqual(timeline.total_commits, 52)

    def test_min_weeks_does_not_resurrect_empty_history(self) -> None:
        # With no data there is no anchor date to pad from, so it stays empty.
        timeline = build_commit_timeline([], min_weeks=52)

        self.assertEqual(timeline.buckets, [])
        self.assertEqual(timeline.total_commits, 0)
        self.assertIsNone(timeline.range_start)


class BuildDailyTimelineTests(unittest.TestCase):
    def test_daily_timeline_expands_days_and_takes_last_n(self) -> None:
        # Three weeks of daily breakdowns (21 days); the month view keeps the last
        # `lookback_days` as one point per day.
        weeks = [
            WeeklyCommitCount(
                week_start=1_600_000_000 + index * SECONDS_PER_WEEK,
                total=sum(days),
                days=tuple(days),
            )
            for index, days in enumerate(
                [
                    [1, 0, 0, 0, 0, 0, 1],
                    [2, 0, 0, 0, 0, 0, 0],
                    [0, 0, 3, 0, 0, 0, 0],
                ]
            )
        ]

        timeline = build_daily_timeline(weeks, lookback_days=10)

        self.assertEqual(timeline.interval_label, "1 day")
        # Last 10 of 21 days, one bucket each.
        self.assertEqual(len(timeline.buckets), 10)
        # Totals across the kept window sum correctly (the "3" day is included).
        self.assertEqual(timeline.total_commits, 3)

    def test_daily_timeline_empty_without_daily_data(self) -> None:
        # The full-history source has no daily breakdown, so a month view built from
        # it is empty rather than wrong.
        weeks = make_weeks([5, 5, 5])  # days default to ()
        timeline = build_daily_timeline(weeks)

        self.assertEqual(timeline.buckets, [])
        self.assertEqual(timeline.total_commits, 0)


if __name__ == "__main__":
    unittest.main()
