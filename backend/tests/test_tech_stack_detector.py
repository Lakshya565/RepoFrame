import unittest

from app.services.file_ranker import RankedRepoFile
from app.services.github_service import (
    GitHubFileContentError,
    GitHubRepoMetadata,
    GitHubTextFileContent,
)
from app.services.tech_stack_detector import (
    collect_stack_evidence,
    detect_tech_stack,
    select_stack_evidence_files,
)


# Builds ranked-file fixtures that match the Phase 5 output consumed by the
# stack detector.
def make_ranked_file(path: str, size: int | None = 100) -> RankedRepoFile:
    return RankedRepoFile(
        path=path,
        size=size,
        importance_score=100,
        reasons=["test fixture"],
    )


# Builds decoded text-file fixtures so tests can focus on manifest parsing.
def make_content(path: str, content: str) -> GitHubTextFileContent:
    return GitHubTextFileContent(
        path=path,
        content=content,
        size=len(content.encode("utf-8")),
    )


# Metadata fixture used by tests that need a GitHub primary language signal.
def make_metadata(language: str | None = None) -> GitHubRepoMetadata:
    return GitHubRepoMetadata(
        name="example",
        description=None,
        default_branch="main",
        stars=0,
        forks=0,
        language=language,
        html_url="https://github.com/acme/example",
    )


# Covers deterministic Phase 6 stack detection from ranked paths and small
# README/manifest contents only.
class TechStackDetectorTests(unittest.TestCase):
    def test_selects_only_ranked_readme_and_manifest_files(self) -> None:
        ranked_files = [
            make_ranked_file("README.md"),
            make_ranked_file("src/app/page.tsx"),
            make_ranked_file("package.json"),
            make_ranked_file("requirements.txt", size=90_000),
            make_ranked_file("pyproject.toml"),
        ]

        selected_files = select_stack_evidence_files(ranked_files)

        self.assertEqual(
            [file.path for file in selected_files],
            ["README.md", "package.json", "pyproject.toml"],
        )

    def test_detects_frontend_stack_from_package_json_paths_and_readme(self) -> None:
        ranked_files = [
            make_ranked_file("README.md"),
            make_ranked_file("package.json"),
            make_ranked_file("next.config.ts"),
            make_ranked_file("src/app/page.tsx"),
            make_ranked_file("tailwind.config.ts"),
        ]
        evidence_files = [
            make_content(
                "package.json",
                """
                {
                  "dependencies": {
                    "next": "16.2.7",
                    "react": "19.2.4",
                    "@supabase/supabase-js": "2.0.0"
                  },
                  "devDependencies": {
                    "typescript": "5.0.0",
                    "tailwindcss": "4.0.0"
                  }
                }
                """,
            ),
            make_content("README.md", "Built with Next.js, React, and Tailwind CSS."),
        ]

        technologies = detect_tech_stack(
            make_metadata(language="TypeScript"),
            ranked_files,
            evidence_files,
        )
        technologies_by_name = {technology.name: technology for technology in technologies}

        self.assertIn("Next.js", technologies_by_name)
        self.assertIn("React", technologies_by_name)
        self.assertIn("Tailwind CSS", technologies_by_name)
        self.assertIn("Supabase", technologies_by_name)
        self.assertIn("TypeScript", technologies_by_name)
        self.assertTrue(
            any(
                evidence.source == "README"
                for evidence in technologies_by_name["Next.js"].evidence
            )
        )

    def test_detects_python_stack_from_requirements(self) -> None:
        ranked_files = [
            make_ranked_file("requirements.txt"),
            make_ranked_file("backend/app/main.py"),
        ]
        evidence_files = [
            make_content(
                "requirements.txt",
                """
                fastapi==0.136.3
                uvicorn==0.49.0
                pydantic==2.13.4
                pandas>=2
                psycopg2-binary==2.9.9
                """,
            )
        ]

        technologies = detect_tech_stack(
            make_metadata(language="Python"),
            ranked_files,
            evidence_files,
        )
        technology_names = {technology.name for technology in technologies}

        self.assertIn("Python", technology_names)
        self.assertIn("FastAPI", technology_names)
        self.assertIn("Uvicorn", technology_names)
        self.assertIn("Pydantic", technology_names)
        self.assertIn("Pandas", technology_names)
        self.assertIn("PostgreSQL", technology_names)

    def test_readme_mentions_do_not_create_unbacked_technologies(self) -> None:
        technologies = detect_tech_stack(
            make_metadata(),
            [make_ranked_file("README.md")],
            [make_content("README.md", "This project mentions React and PostgreSQL.")],
        )

        self.assertEqual(technologies, [])

    def test_languages_breakdown_surfaces_secondary_languages(self) -> None:
        # The openjdk/jdk case: metadata only reports the primary language (Java),
        # so the secondary languages must come from the /languages breakdown.
        technologies = detect_tech_stack(
            make_metadata(language="Java"),
            [],
            [],
            languages={
                "Java": 500_000,
                "C++": 200_000,
                "C": 120_000,
                "Assembly": 30_000,
            },
        )
        names = {technology.name for technology in technologies}

        self.assertIn("Java", names)
        self.assertIn("C++", names)
        self.assertIn("C", names)
        self.assertIn("Assembly", names)
        # Categories resolve to Language for the newly-added entries.
        by_name = {technology.name: technology for technology in technologies}
        self.assertEqual(by_name["C++"].category, "Language")
        self.assertEqual(by_name["Assembly"].category, "Language")

    def test_languages_below_one_percent_are_dropped(self) -> None:
        # A tiny tail language (well under 1% of bytes) must not clutter the stack.
        technologies = detect_tech_stack(
            make_metadata(language="Python"),
            [],
            [],
            languages={
                "Python": 990_000,
                "Shell": 500,  # ~0.05% — below the 1% threshold
            },
        )
        names = {technology.name for technology in technologies}

        self.assertIn("Python", names)
        self.assertNotIn("Shell", names)

    def test_languages_alias_merges_into_canonical_name(self) -> None:
        # GitHub's "Dockerfile" language maps onto the existing Docker technology.
        technologies = detect_tech_stack(
            make_metadata(language="Go"),
            [],
            [],
            languages={"Go": 800_000, "Dockerfile": 200_000},
        )
        names = {technology.name for technology in technologies}

        self.assertIn("Docker", names)
        self.assertNotIn("Dockerfile", names)

    def test_primary_language_gains_confidence_from_two_sources(self) -> None:
        # When metadata AND the breakdown agree on the primary language, both
        # sources attach as evidence (raising its confidence over a lone signal).
        technologies = detect_tech_stack(
            make_metadata(language="Java"),
            [],
            [],
            languages={"Java": 1_000_000},
        )
        java = next(item for item in technologies if item.name == "Java")
        sources = {evidence.source for evidence in java.evidence}

        self.assertIn("GitHub metadata", sources)
        self.assertIn("GitHub languages", sources)


# Covers the shared evidence-fetching helper used by both routes that run stack
# detection: it returns fetched files and tolerates the expected per-file gaps
# without hitting the network (a fake fetcher is injected).
class CollectStackEvidenceTests(unittest.TestCase):
    def test_returns_only_fetchable_readme_and_manifest_files(self) -> None:
        ranked_files = [
            make_ranked_file("README.md"),
            make_ranked_file("package.json"),
            make_ranked_file("src/app/page.tsx"),
        ]

        # Records the calls so we can confirm only stack-evidence files are fetched.
        fetched_paths: list[str] = []

        def fake_fetcher(owner, repo, path, ref, max_size_bytes):
            fetched_paths.append(path)
            return make_content(path, "content")

        evidence = collect_stack_evidence(
            "acme", "example", "main", ranked_files, fetcher=fake_fetcher
        )

        self.assertEqual(fetched_paths, ["README.md", "package.json"])
        self.assertEqual([file.path for file in evidence], ["README.md", "package.json"])

    def test_skips_tolerated_file_errors_but_reraises_others(self) -> None:
        ranked_files = [make_ranked_file("README.md"), make_ranked_file("package.json")]

        # Missing README (404) is skipped; package.json still comes through.
        def tolerant_fetcher(owner, repo, path, ref, max_size_bytes):
            if path == "README.md":
                raise GitHubFileContentError("missing", 404)
            return make_content(path, "{}")

        evidence = collect_stack_evidence(
            "acme", "example", "main", ranked_files, fetcher=tolerant_fetcher
        )
        self.assertEqual([file.path for file in evidence], ["package.json"])

        # A systemic error (e.g. rate limit) must propagate, not be swallowed.
        def failing_fetcher(owner, repo, path, ref, max_size_bytes):
            raise GitHubFileContentError("rate limited", 429)

        with self.assertRaises(GitHubFileContentError):
            collect_stack_evidence(
                "acme", "example", "main", ranked_files, fetcher=failing_fetcher
            )


if __name__ == "__main__":
    unittest.main()
