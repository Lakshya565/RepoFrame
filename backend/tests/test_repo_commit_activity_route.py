import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import ANY, patch

from pydantic import ValidationError

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient

from app.main import app
from app.routers.repo import get_repo_commit_activity
from app.schemas.repo import CommitActivityResponse, RepoParseRequest
from app.services import analysis_service, repo_access
from app.services.auth import require_user_or_public_demo
from app.services.github_service import WeeklyCommitCount


class CommitActivityRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        analysis_service.reset_analysis_caches()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        analysis_service.reset_analysis_caches()

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
            patch(
                "app.services.analysis_service.repo_access.resolve_repo_access",
                return_value=repo_access.RepoAccess(None, None),
            ),
            patch(
                "app.services.analysis_service.fetch_commit_activity",
                return_value=weeks,
            ) as fetch,
        ):
            response = get_repo_commit_activity(
                RepoParseRequest(repoUrl="https://github.com/acme/demo"),
                user=None,
            )

        fetch.assert_called_once_with("acme", "demo", session=ANY)
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

    def test_http_route_serializes_the_bundled_camel_case_contract(self) -> None:
        payload = {
            "owner": "acme",
            "repo": "demo",
            "normalizedUrl": "https://github.com/acme/demo",
            "ranges": {
                "month": {
                    "intervalLabel": "1 day",
                    "totalCommits": 1,
                    "rangeStart": "2026-01-01",
                    "rangeEnd": "2026-01-01",
                    "buckets": [
                        {"periodStart": "2026-01-01", "commitCount": 1}
                    ],
                },
                "year": {
                    "intervalLabel": "1 week",
                    "totalCommits": 1,
                    "rangeStart": "2026-01-01",
                    "rangeEnd": "2026-01-01",
                    "buckets": [
                        {"periodStart": "2026-01-01", "commitCount": 1}
                    ],
                },
            },
        }
        app.dependency_overrides[require_user_or_public_demo] = lambda: None
        with patch(
            "app.routers.repo.analysis_service.get_commit_activity",
            return_value=SimpleNamespace(
                value=CommitActivityResponse.model_validate(payload)
            ),
        ):
            response = TestClient(app).post(
                "/api/repo/commit-activity",
                json={"repoUrl": "https://github.com/acme/demo"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)


if __name__ == "__main__":
    unittest.main()
