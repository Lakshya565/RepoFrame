"use client";

import { createContext, useContext, type ReactNode } from "react";

import { fetchTechStack, type TechStackResponse } from "@/lib/repo-api";
import { demoFetchTechStack } from "@/lib/demo-analysis";
import { useDemo } from "@/lib/demo-mode";
import { useRepoResource, type RepoResource } from "@/lib/use-repo-resource";

// Shared error copy for the single tech-stack fetch.
const TECH_STACK_ERROR = "RepoFrame could not detect the repository tech stack.";

const TechStackContext = createContext<RepoResource<TechStackResponse> | null>(
  null,
);

type TechStackProviderProps = {
  repoUrl: string;
  children: ReactNode;
};

// Fetches the detected tech stack exactly once and shares it with every consumer
// below (the overview card's icon cloud and the Tech stack section's tiles). Both
// previously fetched independently, which meant the GitHub-backed detection ran
// twice for the same repo; routing them through one provider keeps it to a single
// call and guarantees the cloud and tiles never disagree.
export function TechStackProvider({
  repoUrl,
  children,
}: TechStackProviderProps) {
  // In the signed-out demo, resolve from the frozen fixture instead of GitHub.
  const demo = useDemo();
  const techStack = useRepoResource(
    repoUrl,
    demo ? demoFetchTechStack : fetchTechStack,
    TECH_STACK_ERROR,
  );

  return (
    <TechStackContext.Provider value={techStack}>
      {children}
    </TechStackContext.Provider>
  );
}

// Reads the shared tech-stack resource. Throws if used outside the provider so a
// missing wrapper fails loudly instead of silently triggering its own fetch.
export function useTechStack(): RepoResource<TechStackResponse> {
  const context = useContext(TechStackContext);
  if (!context) {
    throw new Error("useTechStack must be used within a TechStackProvider");
  }
  return context;
}
