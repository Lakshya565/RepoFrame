import unittest
from unittest.mock import patch

from app.services.auth import AuthenticatedUser
from app.services.evidence_investigator import (
    EvidenceWorkspace,
    RepositoryIndexEntry,
    build_evidence_workspace,
)
from app.services.file_content_service import (
    RepoEvidenceCollection,
    SelectedFileEvidence,
)
from app.services.github_service import (
    GitHubFileContentError,
    GitHubRepoFile,
    GitHubRepoMetadata,
    GitHubRepoTree,
    GitHubTextFileContent,
)

# Fully offline coverage for the investigator's repository boundary. Injected
# fetchers stand in for GitHub and let the tests assert caching and hard budgets
# without a network request.


def make_initial_evidence() -> RepoEvidenceCollection:
    readme = SelectedFileEvidence(
        path="README.md",
        source_type="readme",
        reason="Primary context",
        content="A FastAPI project.",
        original_size=18,
        truncated=False,
        char_count=18,
    )
    return RepoEvidenceCollection(
        selected_files=[readme],
        skipped_files=[],
        total_characters=18,
    )


def make_workspace(fetcher, **limits) -> EvidenceWorkspace:
    return EvidenceWorkspace(
        owner="acme",
        repo="demo",
        ref="main",
        initial_evidence=make_initial_evidence(),
        repository_index=[
            RepositoryIndexEntry(
                "README.md",
                18,
                100,
                ("README context",),
            ),
            RepositoryIndexEntry(
                "src/payments/service.py",
                80,
                63,
                ("Path includes important source area: src, services.",),
            ),
            RepositoryIndexEntry(
                "docs/authentication.md",
                70,
                0,
                (),
            ),
        ],
        fetcher=fetcher,
        **limits,
    )


class EvidenceWorkspaceTests(unittest.TestCase):
    def test_search_repository_finds_unselected_paths(self) -> None:
        workspace = make_workspace(lambda *_args: None)

        result = workspace.search_repository("payments service")

        self.assertIn("src/payments/service.py", result)
        self.assertNotIn("README.md", result)

    def test_on_demand_read_is_cached_and_becomes_searchable(self) -> None:
        calls: list[str] = []

        def fetcher(_owner, _repo, path, _ref, _limit):
            calls.append(path)
            return GitHubTextFileContent(
                path=path,
                content="def charge_customer():\n    return 'charged'\n",
                size=44,
            )

        workspace = make_workspace(fetcher)
        first = workspace.read_repository_file("src/payments/service.py")
        second = workspace.read_repository_file("SRC/PAYMENTS/SERVICE.PY")

        self.assertIn("charge_customer", first)
        self.assertIn("cached", second)
        self.assertEqual(calls, ["src/payments/service.py"])
        self.assertEqual(
            workspace.additional_files_inspected,
            ["src/payments/service.py"],
        )
        self.assertIn(
            "src/payments/service.py:L1",
            workspace.search_evidence("charge_customer"),
        )

    def test_invalid_and_unknown_paths_never_call_fetcher(self) -> None:
        calls: list[str] = []

        def fetcher(*_args):
            calls.append("called")
            raise AssertionError("fetcher must not be called")

        workspace = make_workspace(fetcher)

        self.assertIn(
            "without traversal",
            workspace.read_repository_file("../secret.txt"),
        )
        self.assertIn(
            "not an allowlisted path",
            workspace.read_repository_file("src/unknown.py"),
        )
        self.assertEqual(calls, [])

    def test_additional_file_and_character_limits_are_enforced(self) -> None:
        def fetcher(_owner, _repo, path, _ref, _limit):
            return GitHubTextFileContent(path=path, content="abcdefghij", size=10)

        workspace = make_workspace(
            fetcher,
            max_additional_files=1,
            max_additional_characters=5,
        )

        first = workspace.read_repository_file("src/payments/service.py")
        second = workspace.read_repository_file("docs/authentication.md")

        self.assertIn("abcde", first)
        self.assertIn("truncated", first)
        self.assertIn("additional-file limit", second)
        self.assertEqual(
            workspace.accumulated_evidence.total_characters,
            23,
        )

    def test_recoverable_file_error_becomes_tool_result(self) -> None:
        def fetcher(*_args):
            raise GitHubFileContentError("File is not UTF-8 text.", 415)

        workspace = make_workspace(fetcher)
        result = workspace.read_repository_file("src/payments/service.py")

        self.assertIn("could not read", result)
        self.assertEqual(workspace.additional_files_inspected, [])

    def test_systemic_file_error_propagates(self) -> None:
        def fetcher(*_args):
            raise GitHubFileContentError("GitHub rate limit reached.", 429)

        workspace = make_workspace(fetcher)
        with self.assertRaises(GitHubFileContentError) as ctx:
            workspace.read_repository_file("src/payments/service.py")
        self.assertEqual(ctx.exception.status_code, 429)


class EvidenceWorkspaceBuilderTests(unittest.TestCase):
    def test_builder_applies_private_repo_access_in_current_thread(self) -> None:
        user = AuthenticatedUser(user_id="user-1", github_id="42")
        metadata = GitHubRepoMetadata(
            name="demo",
            description=None,
            default_branch="main",
            stars=0,
            forks=0,
            language="Python",
            html_url="https://github.com/acme/demo",
        )
        tree = GitHubRepoTree(
            files=[
                GitHubRepoFile(
                    path="src/main.py",
                    type="file",
                    size=20,
                    url=None,
                ),
                GitHubRepoFile(
                    path=".env",
                    type="file",
                    size=20,
                    url=None,
                ),
            ],
            total_files=2,
            total_directories=1,
            is_truncated=False,
        )
        with (
            patch(
                "app.services.evidence_investigator.repo_access.apply_repo_access"
            ) as apply_access,
            patch(
                "app.services.evidence_investigator.fetch_repo_metadata",
                return_value=metadata,
            ),
            patch(
                "app.services.evidence_investigator.fetch_repo_tree",
                return_value=tree,
            ),
            patch(
                "app.services.evidence_investigator.collect_file_evidence",
                return_value=make_initial_evidence(),
            ),
        ):
            workspace = build_evidence_workspace(
                "https://github.com/acme/demo",
                user,
            )

        apply_access.assert_called_once_with(user, "acme", "demo")
        self.assertEqual(workspace.owner, "acme")
        self.assertEqual(workspace.ref, "main")
        self.assertEqual(workspace.repository_index[0].path, "src/main.py")
        self.assertNotIn(
            ".env",
            [entry.path for entry in workspace.repository_index],
        )


if __name__ == "__main__":
    unittest.main()
