import unittest

from app.services.file_ranker import filter_repo_files, rank_important_files
from app.services.github_service import GitHubRepoFile


# Builds concise tree-entry fixtures so each test can focus on the path and size
# rules being exercised.
def make_file(
    path: str,
    size: int | None = 100,
    file_type: str = "file",
) -> GitHubRepoFile:
    return GitHubRepoFile(path=path, type=file_type, size=size, url=None)


# Covers the deterministic path-based filtering and scoring used before
# RepoFrame fetches file contents or calls any LLM.
class FileRankerTests(unittest.TestCase):
    def test_filters_dependency_outputs_locks_media_and_large_files(self) -> None:
        files = [
            make_file("README.md"),
            make_file("node_modules/react/index.js"),
            make_file("dist/app.js"),
            make_file("package-lock.json"),
            make_file("public/logo.png"),
            make_file("src/generated/client.generated.ts"),
            make_file("src/large.ts", size=600_000),
            make_file("src/app/page.tsx"),
            make_file("src", file_type="directory"),
        ]

        filtered_files = filter_repo_files(files)

        self.assertEqual(
            [file.path for file in filtered_files],
            ["README.md", "src/app/page.tsx"],
        )

    def test_ranks_readme_config_routes_and_source_files_first(self) -> None:
        files = [
            make_file("docs/notes.md"),
            make_file("src/utils/date.ts"),
            make_file("src/app/api/route.ts"),
            make_file("package.json"),
            make_file("README.md"),
            make_file("tests/app.test.ts"),
        ]

        ranked_files = rank_important_files(files, limit=4)

        self.assertEqual(
            [file.path for file in ranked_files],
            [
                "README.md",
                "src/app/api/route.ts",
                "package.json",
                "src/utils/date.ts",
            ],
        )
        self.assertGreater(
            ranked_files[1].importance_score,
            ranked_files[3].importance_score,
        )
        self.assertIn("README file", ranked_files[0].reasons[0])
        self.assertTrue(
            any("entry point" in reason for reason in ranked_files[1].reasons)
        )

    def test_uses_path_as_final_tiebreaker(self) -> None:
        files = [
            make_file("src/b.ts"),
            make_file("src/a.ts"),
        ]

        ranked_files = rank_important_files(files, limit=2)

        self.assertEqual(
            [file.path for file in ranked_files],
            ["src/a.ts", "src/b.ts"],
        )


if __name__ == "__main__":
    unittest.main()
