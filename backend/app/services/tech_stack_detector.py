import json
import re
import tomllib
from collections import defaultdict
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, cast

from app.services.file_ranker import RankedRepoFile
from app.services.github_service import GitHubRepoMetadata, GitHubTextFileContent

MAX_STACK_EVIDENCE_FILES = 8
MAX_STACK_EVIDENCE_FILE_SIZE_BYTES = 80_000

MANIFEST_FILE_NAMES = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "tailwind.config.js",
    "tailwind.config.ts",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "vite.config.js",
    "vite.config.ts",
    "dockerfile",
    "docker-compose.yml",
    "compose.yaml",
    "tsconfig.json",
    "postcss.config.js",
    "postcss.config.mjs",
    "eslint.config.js",
    "eslint.config.mjs",
}

README_NAMES = {"readme", "readme.md", "readme.mdx", "readme.txt"}

PACKAGE_TECHNOLOGIES = {
    "@angular/core": "Angular",
    "@fastify/core": "Fastify",
    "@nestjs/core": "NestJS",
    "@prisma/client": "Prisma",
    "@supabase/supabase-js": "Supabase",
    "@tailwindcss/postcss": "Tailwind CSS",
    "@vitejs/plugin-react": "Vite",
    "django": "Django",
    "electron": "Electron",
    "express": "Express",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "jest": "Jest",
    "next": "Next.js",
    "numpy": "NumPy",
    "opencv-python": "OpenCV",
    "pandas": "Pandas",
    "pg": "PostgreSQL",
    "prisma": "Prisma",
    "psycopg": "PostgreSQL",
    "psycopg2": "PostgreSQL",
    "psycopg2-binary": "PostgreSQL",
    "pytest": "Pytest",
    "react": "React",
    "react-dom": "React",
    "react-native": "React Native",
    "requests": "Requests",
    "sqlalchemy": "SQLAlchemy",
    "svelte": "Svelte",
    "tailwindcss": "Tailwind CSS",
    "typescript": "TypeScript",
    "uvicorn": "Uvicorn",
    "vite": "Vite",
    "vitest": "Vitest",
    "vue": "Vue",
}

REQUIREMENT_TECHNOLOGIES = {
    "django": "Django",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "numpy": "NumPy",
    "opencv-python": "OpenCV",
    "pandas": "Pandas",
    "psycopg": "PostgreSQL",
    "psycopg2": "PostgreSQL",
    "psycopg2-binary": "PostgreSQL",
    "pytest": "Pytest",
    "requests": "Requests",
    "sqlalchemy": "SQLAlchemy",
    "uvicorn": "Uvicorn",
}

PATH_TECHNOLOGIES = {
    ".cs": "C#",
    ".css": "CSS",
    ".go": "Go",
    ".html": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".jsx": "React",
    ".kt": "Kotlin",
    ".php": "PHP",
    ".py": "Python",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".scss": "Sass",
    ".sql": "SQL",
    ".swift": "Swift",
    ".ts": "TypeScript",
    ".tsx": "React",
}

CONFIG_TECHNOLOGIES = {
    "docker-compose.yml": "Docker",
    "dockerfile": "Docker",
    "eslint.config.js": "ESLint",
    "eslint.config.mjs": "ESLint",
    "next.config.js": "Next.js",
    "next.config.mjs": "Next.js",
    "next.config.ts": "Next.js",
    "postcss.config.js": "PostCSS",
    "postcss.config.mjs": "PostCSS",
    "tailwind.config.js": "Tailwind CSS",
    "tailwind.config.ts": "Tailwind CSS",
    "tsconfig.json": "TypeScript",
    "vite.config.js": "Vite",
    "vite.config.ts": "Vite",
}

README_KEYWORDS = {
    "C#": ("c#",),
    "CSS": ("css",),
    "Django": ("django",),
    "Docker": ("docker",),
    "Electron": ("electron",),
    "ESLint": ("eslint",),
    "Express": ("express",),
    "FastAPI": ("fastapi", "fast api"),
    "Flask": ("flask",),
    "GitHub Actions": ("github actions",),
    "Go": ("golang", " go "),
    "Java": ("java",),
    "JavaScript": ("javascript",),
    "Next.js": ("next.js", "nextjs"),
    "Node.js": ("node.js", "nodejs"),
    "OpenCV": ("opencv",),
    "Pandas": ("pandas",),
    "PostgreSQL": ("postgresql", "postgres"),
    "Python": ("python",),
    "React": ("react",),
    "Rust": ("rust",),
    "SQLite": ("sqlite",),
    "Supabase": ("supabase",),
    "Tailwind CSS": ("tailwind",),
    "TypeScript": ("typescript",),
    "Vite": ("vite",),
    "Vue": ("vue",),
}

TECH_CATEGORIES = {
    "Angular": "Frontend",
    "C#": "Language",
    "CSS": "Frontend",
    "Django": "Backend",
    "Docker": "Infrastructure",
    "Electron": "Runtime",
    "ESLint": "Tooling",
    "Express": "Backend",
    "FastAPI": "Backend",
    "Fastify": "Backend",
    "Flask": "Backend",
    "GitHub Actions": "Infrastructure",
    "Go": "Language",
    "HTML": "Frontend",
    "Java": "Language",
    "JavaScript": "Language",
    "Jest": "Testing",
    "Kotlin": "Language",
    "NestJS": "Backend",
    "Next.js": "Framework",
    "Node.js": "Runtime",
    "NumPy": "Data",
    "OpenCV": "Computer vision",
    "PHP": "Language",
    "Pandas": "Data",
    "PostCSS": "Tooling",
    "PostgreSQL": "Database",
    "Prisma": "Database",
    "Pydantic": "Backend",
    "Pytest": "Testing",
    "Python": "Language",
    "React": "Frontend",
    "React Native": "Mobile",
    "Requests": "Backend",
    "Ruby": "Language",
    "Rust": "Language",
    "SQL": "Database",
    "SQLAlchemy": "Database",
    "SQLite": "Database",
    "Sass": "Frontend",
    "Supabase": "Platform",
    "Svelte": "Frontend",
    "Swift": "Language",
    "Tailwind CSS": "Frontend",
    "TypeScript": "Language",
    "Uvicorn": "Backend",
    "Vite": "Tooling",
    "Vitest": "Testing",
    "Vue": "Frontend",
}


# One concise evidence point behind a detected technology. The source is a
# stable label, and path is present when evidence came from an important file.
@dataclass(frozen=True)
class TechStackEvidence:
    source: str
    detail: str
    path: str | None = None


# One technology returned by the detector with a deterministic confidence score.
# Evidence stays attached so later generated claims can trace back to repo facts.
@dataclass(frozen=True)
class DetectedTechnology:
    name: str
    category: str
    confidence: float
    evidence: list[TechStackEvidence]


# Chooses the ranked files Phase 6 is allowed to read. This is intentionally
# smaller than Phase 7: README and dependency/config manifests only.
def select_stack_evidence_files(
    ranked_files: list[RankedRepoFile],
    limit: int = MAX_STACK_EVIDENCE_FILES,
) -> list[RankedRepoFile]:
    selected_files = [
        file
        for file in ranked_files
        if _is_stack_evidence_file(file.path)
        and (
            file.size is None
            or file.size <= MAX_STACK_EVIDENCE_FILE_SIZE_BYTES
        )
    ]

    return selected_files[:limit]


# Detects stack entries from metadata, ranked paths, and the bounded manifest
# text that Phase 6 is permitted to fetch. README mentions only strengthen
# existing detections rather than creating unsupported stack entries by itself.
def detect_tech_stack(
    metadata: GitHubRepoMetadata,
    ranked_files: list[RankedRepoFile],
    evidence_files: list[GitHubTextFileContent],
) -> list[DetectedTechnology]:
    detections: dict[str, list[TechStackEvidence]] = defaultdict(list)

    if metadata.language:
        _add_evidence(
            detections,
            metadata.language,
            TechStackEvidence(
                source="GitHub metadata",
                detail=f"GitHub reports {metadata.language} as the primary language.",
            ),
        )

    _detect_from_paths(detections, ranked_files)

    readme_files: list[GitHubTextFileContent] = []
    for file in evidence_files:
        name = PurePosixPath(file.path).name.lower()
        if name in README_NAMES:
            readme_files.append(file)
            continue

        if name == "package.json":
            _detect_from_package_json(detections, file)
        elif name == "requirements.txt":
            _detect_from_requirements(detections, file)
        elif name == "pyproject.toml":
            _detect_from_pyproject(detections, file)
        elif name in CONFIG_TECHNOLOGIES:
            _add_evidence(
                detections,
                CONFIG_TECHNOLOGIES[name],
                TechStackEvidence(
                    source="Config file",
                    detail=f"{file.path} is a {CONFIG_TECHNOLOGIES[name]} configuration file.",
                    path=file.path,
                ),
            )

    _add_readme_supporting_evidence(detections, readme_files)

    return [
        DetectedTechnology(
            name=name,
            category=TECH_CATEGORIES.get(name, "Other"),
            confidence=_calculate_confidence(evidence),
            evidence=evidence,
        )
        for name, evidence in sorted(
            detections.items(),
            key=lambda item: (-_calculate_confidence(item[1]), item[0].lower()),
        )
    ]


# Keeps file eligibility readable and shared by the route and tests.
def _is_stack_evidence_file(path: str) -> bool:
    name = PurePosixPath(path).name.lower()
    return name in MANIFEST_FILE_NAMES or name in README_NAMES


# Adds one evidence point while avoiding duplicate messages from overlapping
# rules, such as React appearing in both dependencies and devDependencies.
def _add_evidence(
    detections: dict[str, list[TechStackEvidence]],
    technology: str,
    evidence: TechStackEvidence,
) -> None:
    evidence_key = (evidence.source, evidence.detail, evidence.path)
    existing_keys = {
        (item.source, item.detail, item.path)
        for item in detections[technology]
    }

    if evidence_key not in existing_keys:
        detections[technology].append(evidence)


# Uses the important-file paths from Phase 5 for language, framework, config,
# and infrastructure clues that do not need file contents.
def _detect_from_paths(
    detections: dict[str, list[TechStackEvidence]],
    ranked_files: list[RankedRepoFile],
) -> None:
    for file in ranked_files:
        path = PurePosixPath(file.path)
        lower_path = file.path.lower()
        name = path.name.lower()
        suffix = path.suffix.lower()

        if suffix in PATH_TECHNOLOGIES:
            _add_evidence(
                detections,
                PATH_TECHNOLOGIES[suffix],
                TechStackEvidence(
                    source="File pattern",
                    detail=f"{file.path} uses the {suffix} extension.",
                    path=file.path,
                ),
            )

        if name in CONFIG_TECHNOLOGIES:
            _add_evidence(
                detections,
                CONFIG_TECHNOLOGIES[name],
                TechStackEvidence(
                    source="Config file",
                    detail=f"{file.path} is a {CONFIG_TECHNOLOGIES[name]} configuration file.",
                    path=file.path,
                ),
            )

        if lower_path.startswith(".github/workflows/"):
            _add_evidence(
                detections,
                "GitHub Actions",
                TechStackEvidence(
                    source="File pattern",
                    detail=f"{file.path} is a GitHub Actions workflow file.",
                    path=file.path,
                ),
            )

        if name == "package.json":
            _add_evidence(
                detections,
                "Node.js",
                TechStackEvidence(
                    source="Dependency manifest",
                    detail="package.json indicates a Node.js package ecosystem.",
                    path=file.path,
                ),
            )

        if name in {"requirements.txt", "pyproject.toml"}:
            _add_evidence(
                detections,
                "Python",
                TechStackEvidence(
                    source="Dependency manifest",
                    detail=f"{file.path} indicates a Python package ecosystem.",
                    path=file.path,
                ),
            )

        if "sqlite" in lower_path:
            _add_evidence(
                detections,
                "SQLite",
                TechStackEvidence(
                    source="File pattern",
                    detail=f"{file.path} includes a SQLite-related path.",
                    path=file.path,
                ),
            )


# Parses package.json dependency sections and scripts for frontend/backend
# framework clues. Malformed JSON simply contributes no manifest evidence.
def _detect_from_package_json(
    detections: dict[str, list[TechStackEvidence]],
    file: GitHubTextFileContent,
) -> None:
    try:
        payload = json.loads(file.content)
    except json.JSONDecodeError:
        return

    if not isinstance(payload, dict):
        return

    dependencies = _collect_package_dependencies(payload)
    for package_name, technology in PACKAGE_TECHNOLOGIES.items():
        if package_name in dependencies:
            _add_evidence(
                detections,
                technology,
                TechStackEvidence(
                    source="package.json",
                    detail=f"{package_name} is listed as a dependency.",
                    path=file.path,
                ),
            )

    if "next" in dependencies:
        _add_evidence(
            detections,
            "React",
            TechStackEvidence(
                source="package.json",
                detail="Next.js dependency implies a React application.",
                path=file.path,
            ),
        )

    scripts = payload.get("scripts")
    if isinstance(scripts, dict):
        for script_name, script_value in scripts.items():
            if isinstance(script_name, str) and isinstance(script_value, str):
                _detect_from_script(detections, file.path, script_name, script_value)


# Reads standard package.json dependency maps without assuming every value is a
# string. Only package names are needed for stack detection.
def _collect_package_dependencies(payload: dict[str, object]) -> set[str]:
    dependencies: set[str] = set()
    for key in ("dependencies", "devDependencies", "peerDependencies"):
        section = payload.get(key)
        if isinstance(section, dict):
            dependencies.update(
                package_name
                for package_name in section
                if isinstance(package_name, str)
            )

    return dependencies


# Adds script-based evidence when package scripts name a common tool directly.
def _detect_from_script(
    detections: dict[str, list[TechStackEvidence]],
    path: str,
    script_name: str,
    script_value: str,
) -> None:
    script_text = f"{script_name} {script_value}".lower()
    script_technologies = {
        "next": "Next.js",
        "vite": "Vite",
        "tailwind": "Tailwind CSS",
        "prisma": "Prisma",
        "jest": "Jest",
        "vitest": "Vitest",
    }

    for token, technology in script_technologies.items():
        if token in script_text:
            _add_evidence(
                detections,
                technology,
                TechStackEvidence(
                    source="package.json",
                    detail=f"Script '{script_name}' runs {technology}-related tooling.",
                    path=path,
                ),
            )


# Parses requirements.txt package names while ignoring comments, options, and
# version specifiers that are not part of the package identity.
def _detect_from_requirements(
    detections: dict[str, list[TechStackEvidence]],
    file: GitHubTextFileContent,
) -> None:
    packages = {
        package_name
        for line in file.content.splitlines()
        if (package_name := _parse_requirement_name(line))
    }

    for package_name, technology in REQUIREMENT_TECHNOLOGIES.items():
        if package_name in packages:
            _add_evidence(
                detections,
                technology,
                TechStackEvidence(
                    source="requirements.txt",
                    detail=f"{package_name} is listed as a dependency.",
                    path=file.path,
                ),
            )

    if "pydantic" in packages:
        _add_evidence(
            detections,
            "Pydantic",
            TechStackEvidence(
                source="requirements.txt",
                detail="pydantic is listed as a dependency.",
                path=file.path,
            ),
        )


# Extracts one requirement package name from common pinned/ranged forms.
def _parse_requirement_name(line: str) -> str | None:
    cleaned_line = line.split("#", 1)[0].strip().lower()
    if not cleaned_line or cleaned_line.startswith(("-", "git+", "http")):
        return None

    match = re.match(r"([a-z0-9_.-]+)", cleaned_line)
    return match.group(1) if match else None


# Parses pyproject dependency arrays from PEP 621 and Poetry-style sections.
def _detect_from_pyproject(
    detections: dict[str, list[TechStackEvidence]],
    file: GitHubTextFileContent,
) -> None:
    try:
        payload = tomllib.loads(file.content)
    except tomllib.TOMLDecodeError:
        return

    packages = _collect_pyproject_dependencies(payload)
    for package_name, technology in REQUIREMENT_TECHNOLOGIES.items():
        if package_name in packages:
            _add_evidence(
                detections,
                technology,
                TechStackEvidence(
                    source="pyproject.toml",
                    detail=f"{package_name} is listed as a dependency.",
                    path=file.path,
                ),
            )


# Collects dependency names from the most common pyproject layouts without
# introducing a third-party TOML or packaging parser.
def _collect_pyproject_dependencies(payload: dict[str, Any]) -> set[str]:
    packages: set[str] = set()
    project = payload.get("project")
    if isinstance(project, dict):
        dependencies = project.get("dependencies")
        if isinstance(dependencies, list):
            packages.update(
                package_name
                for item in dependencies
                if isinstance(item, str)
                if (package_name := _parse_requirement_name(item))
            )

        optional_dependencies = project.get("optional-dependencies")
        if isinstance(optional_dependencies, dict):
            for dependency_group in optional_dependencies.values():
                if isinstance(dependency_group, list):
                    packages.update(
                        package_name
                        for item in dependency_group
                        if isinstance(item, str)
                        if (package_name := _parse_requirement_name(item))
                    )

    poetry_dependencies = _get_nested_mapping(payload, ("tool", "poetry", "dependencies"))
    if poetry_dependencies:
        packages.update(
            package_name
            for package_name in poetry_dependencies
            if isinstance(package_name, str)
        )

    return packages


# Walks nested dictionaries from parsed TOML and returns the final mapping when
# every segment exists. This keeps pyproject parsing compact and defensive.
def _get_nested_mapping(
    payload: dict[str, Any],
    keys: tuple[str, ...],
) -> dict[str, object] | None:
    current: object = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)

    return cast(dict[str, object], current) if isinstance(current, dict) else None


# Adds README wording only to technologies already detected elsewhere, keeping
# README claims backed by at least one non-README source.
def _add_readme_supporting_evidence(
    detections: dict[str, list[TechStackEvidence]],
    readme_files: list[GitHubTextFileContent],
) -> None:
    for file in readme_files:
        normalized_content = f" {file.content.lower()} "
        for technology, keywords in README_KEYWORDS.items():
            if technology not in detections:
                continue

            if any(keyword in normalized_content for keyword in keywords):
                _add_evidence(
                    detections,
                    technology,
                    TechStackEvidence(
                        source="README",
                        detail=f"{file.path} mentions {technology}.",
                        path=file.path,
                    ),
                )


# Translates the number and diversity of evidence points into a simple,
# deterministic confidence score for display. It is not a statistical model.
def _calculate_confidence(evidence: list[TechStackEvidence]) -> float:
    source_count = len({item.source for item in evidence})
    score = 0.45 + min(len(evidence), 4) * 0.1 + min(source_count, 3) * 0.05
    return min(round(score, 2), 0.95)
