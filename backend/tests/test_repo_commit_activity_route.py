import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.routers.repo import get_repo_commit_activity
from app.schemas.repo import RepoParseRequest
from app.services.github_service import WeeklyCommitCount


class CommitActivityRouteTests(unittest.TestCase):
    def test_one_github_result_builds_both_supported_ranges(self) -> None:
        weeks = [
            WeeklyCommitCount(
                week_start=1_600_000_000,
                total=3,
                days=(0, 1, 0, 2, 0, 0, 0),
            ),
            WeeklyCommitCount(
                week_start=1_600_604_800,
                total=4,
                days=(1, 0, 1, 0, 1, 0, 1),
            ),
        ]
        with (
            patch("app.routers.repo.repo_access.apply_repo_access"),
            patch(
                "app.routers.repo.fetch_commit_activity",
                return_value=weeks,
            ) as fetch,
        ):
            response = get_repo_commit_activity(
                RepoParseRequest(repoUrl="https://github.com/acme/demo"),
                user=None,
            )

        fetch.assert_called_once_with("acme", "demo")
        self.assertEqual(response.ranges.month.total_commits, 7)
        self.assertEqual(response.ranges.month.interval_label, "1 day")
        self.assertEqual(response.ranges.year.total_commits, 7)
        self.assertEqual(response.ranges.year.interval_label, "2 weeks")

    def test_range_field_is_no_longer_accepted(self) -> None:
        with self.assertRaises(ValidationError):
            RepoParseRequest.model_validate(
                {
                    "repoUrl": "https://github.com/acme/demo",
                    "range": "all",
                }
            )


if __name__ == "__main__":
    unittest.main()
