import unittest

from app.services.file_content_service import (
    MAX_CHARS_PER_FILE,
    MAX_FILE_SIZE_BYTES,
    MAX_SELECTED_FILES,
    MAX_TOTAL_CHARS,
    collect_file_evidence,
    select_evidence_candidates,
)
from app.services.file_ranker import RankedRepoFile
from app.services.github_service import GitHubFileContentError, GitHubTextFileContent


# Builds ranked-file fixtures matching the Phase 5 output the evidence service
# consumes.
def make_ranked_file(path: str, size: int | None = 100) -> RankedRepoFile:
    return RankedRepoFile(
        path=path,
        size=size,
        importance_score=100,
        reasons=["test fixture"],
    )


# Builds a fake content fetcher backed by an in-memory map so tests never hit
# GitHub. Missing paths and configured statuses raise like the real service.
def make_fetcher(
    contents: dict[str, str],
    errors: dict[str, int] | None = None,
):
    errors = errors or {}

    def fetcher(owner, repo, path, ref, max_size_bytes):
        if path in errors:
            raise GitHubFileContentError("forced", errors[path])
        if path not in contents:
            raise GitHubFileContentError("missing", 404)
        return GitHubTextFileContent(
            path=path,
            content=contents[path],
            size=len(contents[path].encode("utf-8")),
        )

    return fetcher


# Covers Phase 7 bounded selection and limit enforcement against a fake fetcher.
class FileContentServiceTests(unittest.TestCase):
    def test_selects_readme_then_config_then_source_in_order(self) -> None:
        ranked_files = [
            make_ranked_file("src/app/page.tsx"),
            make_ranked_file("README.md"),
            make_ranked_file("package.json"),
            make_ranked_file("docs/notes.md"),  # non-readme markdown, not source
        ]

        selected, overflow = select_evidence_candidates(ranked_files)

        self.assertEqual(
            [candidate.path for candidate in selected],
            ["README.md", "package.json", "src/app/page.tsx"],
        )
        self.assertEqual(overflow, [])

    def test_ignores_unclassified_files(self) -> None:
        selected, _ = select_evidence_candidates(
            [make_ranked_file("data/sample.csv"), make_ranked_file("LICENSE")]
        )

        self.assertEqual(selected, [])

    def test_overflow_beyond_max_files_is_reported_as_skipped(self) -> None:
        ranked_files = [
            make_ranked_file(f"src/module_{index}.py")
            for index in range(MAX_SELECTED_FILES + 3)
        ]
        contents = {file.path: "print('ok')" for file in ranked_files}

        evidence = collect_file_evidence(
            "acme", "example", "main", ranked_files, fetcher=make_fetcher(contents)
        )

        self.assertEqual(len(evidence.selected_files), MAX_SELECTED_FILES)
        self.assertEqual(len(evidence.skipped_files), 3)
        self.assertTrue(
            all(
                "Maximum number of selected files" in skipped.reason
                for skipped in evidence.skipped_files
            )
        )

    def test_missing_readme_is_a_normal_skip_not_an_error(self) -> None:
        ranked_files = [make_ranked_file("README.md"), make_ranked_file("main.py")]
        contents = {"main.py": "print('hi')"}

        evidence = collect_file_evidence(
            "acme", "example", "main", ranked_files, fetcher=make_fetcher(contents)
        )

        selected_paths = [file.path for file in evidence.selected_files]
        self.assertEqual(selected_paths, ["main.py"])
        self.assertEqual(len(evidence.skipped_files), 1)
        self.assertEqual(evidence.skipped_files[0].path, "README.md")
        self.assertIn("not found", evidence.skipped_files[0].reason.lower())

    def test_oversized_file_skipped_before_fetch(self) -> None:
        ranked_files = [make_ranked_file("big.py", size=MAX_FILE_SIZE_BYTES + 1)]

        evidence = collect_file_evidence(
            "acme", "example", "main", ranked_files, fetcher=make_fetcher({})
        )

        self.assertEqual(evidence.selected_files, [])
        self.assertEqual(len(evidence.skipped_files), 1)
        self.assertIn("per-file size limit", evidence.skipped_files[0].reason)

    def test_per_file_content_is_trimmed_and_flagged(self) -> None:
        ranked_files = [make_ranked_file("main.py")]
        contents = {"main.py": "x" * (MAX_CHARS_PER_FILE + 500)}

        evidence = collect_file_evidence(
            "acme", "example", "main", ranked_files, fetcher=make_fetcher(contents)
        )

        selected = evidence.selected_files[0]
        self.assertTrue(selected.truncated)
        self.assertEqual(selected.char_count, MAX_CHARS_PER_FILE)
        self.assertEqual(selected.original_size, MAX_CHARS_PER_FILE + 500)

    def test_total_character_limit_stops_further_files(self) -> None:
        # Each fetched file fills most of the per-file cap; together they exceed
        # the total cap so later files are trimmed then skipped.
        per_file = MAX_CHARS_PER_FILE
        file_count = (MAX_TOTAL_CHARS // per_file) + 2
        ranked_files = [
            make_ranked_file(f"src/module_{index}.py") for index in range(file_count)
        ]
        contents = {file.path: "y" * per_file for file in ranked_files}

        evidence = collect_file_evidence(
            "acme", "example", "main", ranked_files, fetcher=make_fetcher(contents)
        )

        total = sum(file.char_count for file in evidence.selected_files)
        self.assertLessEqual(total, MAX_TOTAL_CHARS)
        self.assertEqual(evidence.total_characters, total)
        self.assertTrue(
            any(
                "Total content limit" in skipped.reason
                for skipped in evidence.skipped_files
            )
        )

    def test_non_text_file_skipped_with_reason(self) -> None:
        ranked_files = [make_ranked_file("main.py"), make_ranked_file("blob.py")]
        fetcher = make_fetcher({"main.py": "ok"}, errors={"blob.py": 415})

        evidence = collect_file_evidence(
            "acme", "example", "main", ranked_files, fetcher=fetcher
        )

        skipped = {file.path: file.reason for file in evidence.skipped_files}
        self.assertIn("blob.py", skipped)
        self.assertIn("UTF-8", skipped["blob.py"])

    def test_systemic_errors_are_raised_not_skipped(self) -> None:
        ranked_files = [make_ranked_file("main.py")]
        fetcher = make_fetcher({}, errors={"main.py": 429})

        with self.assertRaises(GitHubFileContentError):
            collect_file_evidence(
                "acme", "example", "main", ranked_files, fetcher=fetcher
            )


if __name__ == "__main__":
    unittest.main()
