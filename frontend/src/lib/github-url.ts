export type ParsedGitHubRepo = {
  owner: string;
  repo: string;
  normalizedUrl: string;
};

const GITHUB_HOST = "github.com";
const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]+$/;
const GIT_SUFFIX = ".git";

export function parseGitHubRepoUrl(repoUrl: string): ParsedGitHubRepo | null {
  const trimmedUrl = repoUrl.trim();

  if (!trimmedUrl) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmedUrl);
  } catch {
    return null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== GITHUB_HOST ||
    pathParts.length !== 2 ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const [owner, rawRepo] = pathParts;
  const repo = stripGitSuffix(rawRepo);

  if (!isValidGitHubOwner(owner) || !isValidGitHubRepoName(repo)) {
    return null;
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://${GITHUB_HOST}/${owner}/${repo}`,
  };
}

export function buildGitHubRepoUrl(owner: string, repo: string): string | null {
  const normalizedRepo = normalizeGitHubRepoName(repo);

  if (!isValidGitHubOwner(owner) || !isValidGitHubRepoName(normalizedRepo)) {
    return null;
  }

  return `https://${GITHUB_HOST}/${owner}/${normalizedRepo}`;
}

export function normalizeGitHubRepoName(repo: string): string {
  return stripGitSuffix(repo);
}

function isValidGitHubOwner(owner: string): boolean {
  return OWNER_PATTERN.test(owner);
}

function isValidGitHubRepoName(repo: string): boolean {
  return REPO_PATTERN.test(repo);
}

function stripGitSuffix(repo: string): string {
  if (!repo.toLowerCase().endsWith(GIT_SUFFIX)) {
    return repo;
  }

  return repo.slice(0, -GIT_SUFFIX.length);
}
