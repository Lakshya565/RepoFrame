import json
import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import patch

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient

from app.main import app
from app.schemas.repo import (
    RepoFileRankingResponse,
    RepoMetadataResponse,
    RepoTreeResponse,
    TechStackResponse,
)
from app.services.analysis_service import CacheResult
from app.services.auth import require_user_or_public_demo


class RepoAnalysisStreamRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[require_user_or_public_demo] = lambda: None

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_stream_emits_typed_stages_then_complete(self) -> None:
        identity = {
            "owner": "acme",
            "repo": "demo",
            "normalized_url": "https://github.com/acme/demo",
        }
        metadata = RepoMetadataResponse(
            **identity,
            name="demo",
            description=None,
            default_branch="main",
            stars=0,
            forks=0,
            language="Python",
            html_url="https://github.com/acme/demo",
        )
        tree = RepoTreeResponse(
            **identity,
            default_branch="main",
            files=[],
            total_files=0,
            total_directories=0,
            is_truncated=False,
        )
        ranking = RepoFileRankingResponse(
            **identity,
            default_branch="main",
            ranked_files=[],
            total_files=0,
            rankable_files=0,
            returned_files=0,
        )
        stack = TechStackResponse(
            **identity,
            default_branch="main",
            technologies=[],
            evidence_files_read=0,
        )

        def fake_analysis(_repo_url, _user, callback):
            callback("metadata", metadata)
            callback("structure", {"tree": tree, "rankedFiles": ranking})
            callback("techStack", stack)
            return CacheResult(
                SimpleNamespace(generated_at="2026-07-21T00:00:00+00:00"),
                "miss",
            )

        with patch(
            "app.routers.repo.analysis_service.get_repo_analysis",
            side_effect=fake_analysis,
        ):
            response = TestClient(app).post(
                "/api/repo/analysis/stream",
                json={"repoUrl": "https://github.com/acme/demo"},
            )

        events = [
            json.loads(line.removeprefix("data: "))
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        self.assertEqual(response.status_code, 200)
        self.assertIn("app;dur=", response.headers["Server-Timing"])
        self.assertEqual(
            [event["type"] for event in events],
            ["metadata", "structure", "techStack", "complete"],
        )
        self.assertEqual(events[-1]["cacheStatus"], "miss")


if __name__ == "__main__":
    unittest.main()
