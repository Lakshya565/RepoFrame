// Rebuilds the canonical repository URL from the route's owner/repo segments.
// The analysis routes carry only owner and repo in the path; this mirrors the
// backend's normalization (repo_parser.py builds the same
// https://github.com/{owner}/{repo} string), so the reconstructed URL is the
// exact key every repo API call already expects — no need to thread the full URL
// through the URL bar.
export function repoUrlFromParams(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}
