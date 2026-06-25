import { ProjectWriteupSection } from "@/components/project-writeup-section";
import { repoUrlFromParams } from "@/lib/repo-url";

type GenerateTabPageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

// The Generate tab: the writeup workspace the visitor actually came to use. All
// of its state lives in the shared GenerationProvider (in the analysis layout),
// so a generated writeup survives switching to the Analysis or History tab and
// back. This page only needs to hand it the repo URL rebuilt from the route.
export default async function GenerateTabPage({
  params,
}: GenerateTabPageProps) {
  const { owner, repo } = await params;
  const repoUrl = repoUrlFromParams(owner, repo);

  return <ProjectWriteupSection repoUrl={repoUrl} />;
}
