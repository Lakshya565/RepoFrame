from dataclasses import dataclass
from pathlib import PurePosixPath

from app.services.github_service import GitHubRepoFile

MAX_RANKABLE_FILE_SIZE_BYTES = 500_000
DEFAULT_TOP_FILE_LIMIT = 20

DEPENDENCY_AND_BUILD_DIRS = {
    ".cache",
    ".git",
    ".mypy_cache",
    ".next",
    ".nuxt",
    ".parcel-cache",
    ".pytest_cache",
    ".ruff_cache",
    ".serverless",
    ".svelte-kit",
    ".terraform",
    ".turbo",
    ".venv",
    "__pycache__",
    "bower_components",
    "build",
    "coverage",
    "dist",
    "htmlcov",
    "node_modules",
    "out",
    "target",
    "vendor",
    "venv",
}

LOCK_FILE_NAMES = {
    "bun.lock",
    "bun.lockb",
    "cargo.lock",
    "composer.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "poetry.lock",
    "yarn.lock",
}

GENERATED_FILE_SUFFIXES = (
    ".d.ts.map",
    ".generated.js",
    ".generated.json",
    ".generated.py",
    ".generated.ts",
    ".min.css",
    ".min.js",
)

BINARY_OR_MEDIA_EXTENSIONS = {
    ".7z",
    ".avif",
    ".bmp",
    ".eot",
    ".exe",
    ".gif",
    ".gz",
    ".ico",
    ".jpeg",
    ".jpg",
    ".mov",
    ".mp3",
    ".mp4",
    ".otf",
    ".pdf",
    ".png",
    ".rar",
    ".svg",
    ".tar",
    ".ttf",
    ".webm",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
}

README_NAMES = {"readme", "readme.md", "readme.mdx", "readme.txt"}

CONFIG_FILE_NAMES = {
    ".env.example",
    ".eslintrc",
    ".eslintrc.cjs",
    ".eslintrc.js",
    ".eslintrc.json",
    ".prettierrc",
    ".prettierrc.json",
    "compose.yaml",
    "docker-compose.yml",
    "dockerfile",
    "eslint.config.js",
    "eslint.config.mjs",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "tailwind.config.js",
    "tailwind.config.ts",
    "tsconfig.json",
    "vite.config.js",
    "vite.config.ts",
}

CONFIG_EXTENSIONS = {".toml", ".yaml", ".yml"}

SOURCE_EXTENSIONS = {
    ".c",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".html",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sql",
    ".swift",
    ".tsx",
    ".ts",
}

IMPORTANT_SOURCE_DIRS = {
    "api",
    "app",
    "components",
    "lib",
    "models",
    "pages",
    "routes",
    "schema",
    "schemas",
    "services",
    "src",
}

ENTRY_POINT_STEMS = {
    "__init__",
    "app",
    "index",
    "layout",
    "main",
    "page",
    "route",
    "router",
    "server",
}


# Ranked file selection that the API exposes to the frontend. The score is
# deterministic, and reasons explain why the file is useful for later evidence.
@dataclass(frozen=True)
class RankedRepoFile:
    path: str
    size: int | None
    importance_score: int
    reasons: list[str]


# Removes files that are unlikely to help describe project behavior before any
# scoring happens. This avoids dependency folders, generated output, binaries,
# lock files, and files too large for later content fetching.
def filter_repo_files(files: list[GitHubRepoFile]) -> list[GitHubRepoFile]:
    return [file for file in files if _is_rankable_file(file)]


# Scores eligible files by how useful they are likely to be for evidence-backed
# project summaries. The sort is stable and deterministic for repeat analyses.
def rank_important_files(
    files: list[GitHubRepoFile],
    limit: int = DEFAULT_TOP_FILE_LIMIT,
) -> list[RankedRepoFile]:
    ranked_files = [_rank_file(file) for file in filter_repo_files(files)]
    useful_files = [file for file in ranked_files if file.importance_score > 0]

    return sorted(
        useful_files,
        key=lambda file: (-file.importance_score, _path_depth(file.path), file.path),
    )[:limit]


# Checks one GitHub tree entry against the Phase 5 exclusion rules. The checks
# are path-based because this phase has file metadata only, not file contents.
def _is_rankable_file(file: GitHubRepoFile) -> bool:
    if file.type != "file":
        return False

    path = PurePosixPath(file.path)
    name = path.name.lower()
    suffix = path.suffix.lower()
    path_parts = [part.lower() for part in path.parts]

    if any(part in DEPENDENCY_AND_BUILD_DIRS for part in path_parts[:-1]):
        return False

    if name in LOCK_FILE_NAMES:
        return False

    if suffix in BINARY_OR_MEDIA_EXTENSIONS:
        return False

    if file.size is not None and file.size > MAX_RANKABLE_FILE_SIZE_BYTES:
        return False

    return not any(name.endswith(suffix) for suffix in GENERATED_FILE_SUFFIXES)


# Applies additive score rules to one file and records the matching reasons.
# A small depth penalty keeps shallow overview files ahead of deeply nested code.
def _rank_file(file: GitHubRepoFile) -> RankedRepoFile:
    path = PurePosixPath(file.path)
    path_parts = [part.lower() for part in path.parts]
    name = path.name.lower()
    stem = path.stem.lower()
    suffix = path.suffix.lower()
    score = 0
    reasons: list[str] = []

    if name in README_NAMES:
        score += 100
        reasons.append("README file explains project purpose, setup, or usage.")

    if name in CONFIG_FILE_NAMES or suffix in CONFIG_EXTENSIONS:
        score += 75
        reasons.append("Configuration or dependency file shows project tooling.")

    matched_dirs = sorted(
        {
            part
            for part in path_parts[:-1]
            if part in IMPORTANT_SOURCE_DIRS
        }
    )
    if matched_dirs:
        score += 40
        reasons.append(
            f"Path includes important source area: {', '.join(matched_dirs)}."
        )

    if stem in ENTRY_POINT_STEMS:
        score += 35
        reasons.append("Filename looks like an application entry point or route.")

    if suffix in SOURCE_EXTENSIONS:
        score += 25
        reasons.append("Source file can provide implementation evidence.")

    if "test" in path_parts or "tests" in path_parts or stem.endswith(".test"):
        score -= 15
        reasons.append("Test file is useful but lower priority than product code.")

    score = max(score - min(_path_depth(file.path) * 2, 20), 0)

    return RankedRepoFile(
        path=file.path,
        size=file.size,
        importance_score=score,
        reasons=reasons,
    )


# Counts path segments so ranking can prefer simpler top-level evidence when
# two files otherwise have similar scores.
def _path_depth(path: str) -> int:
    return len(PurePosixPath(path).parts)
