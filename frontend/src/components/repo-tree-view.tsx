"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchRepoTree, type RepoTreeResponse } from "@/lib/repo-api";
import { buildRepoTree, type RepoTreeNode } from "@/lib/repo-tree";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { File, Folder, Tree } from "@/components/ui/file-tree";

type RepoTreeViewProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

// Renders our backend tree nodes as Magic UI Folder/File rows. Folders are
// tinted brand green (the trigger's `text-brand` flows into the icon + label via
// currentColor) and carry a muted file-count badge; files keep the default
// treatment. buildRepoTree already sorts folders-first then alphabetically.
function renderNodes(nodes: RepoTreeNode[]): React.ReactNode {
  return nodes.map((node) => {
    if (node.type === "directory") {
      return (
        <Folder
          key={node.path}
          value={node.path}
          className="text-brand"
          element={
            <span className="inline-flex items-center gap-2">
              {node.name}
              <span className="text-xs font-normal text-muted-foreground">
                {numberFormatter.format(node.fileCount)} files
              </span>
            </span>
          }
        >
          {renderNodes(node.children)}
        </Folder>
      );
    }

    return (
      <File key={node.path} value={node.path}>
        <span>{node.name}</span>
      </File>
    );
  });
}

// Fetches GitHub's repository structure and renders it as a Magic UI file tree:
// an accordion-style browser with folder/file icons and a vertical guide line.
// It intentionally works only with paths/types from the tree API, not file
// contents, so Phase 4 stays focused on structure. Expansion state is owned by
// the Tree component itself; we only feed it the converted elements.
export function RepoTreeView({ repoUrl }: RepoTreeViewProps) {
  const [tree, setTree] = useState<RepoTreeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reloads the file tree for the retry button.
  const loadTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const repoTree = await fetchRepoTree(repoUrl);
      setTree(repoTree);
    } catch (error) {
      setTree(null);
      setError(
        error instanceof Error
          ? error.message
          : "RepoFrame could not fetch the repository file tree.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl]);

  // Runs the initial tree fetch for the current repo URL and ignores stale
  // responses if the page changes before GitHub responds.
  useEffect(() => {
    let isCurrentRequest = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const repoTree = await fetchRepoTree(repoUrl);
        if (isCurrentRequest) {
          setTree(repoTree);
        }
      } catch (error) {
        if (isCurrentRequest) {
          setTree(null);
          setError(
            error instanceof Error
              ? error.message
              : "RepoFrame could not fetch the repository file tree.",
          );
        }
      } finally {
        if (isCurrentRequest) {
          setIsLoading(false);
        }
      }
    }

    run();

    return () => {
      isCurrentRequest = false;
    };
  }, [repoUrl]);

  // Converts GitHub's flat list of file paths into nested nodes only when the
  // backend response changes, so render stays cheap.
  const treeRoot = useMemo(() => {
    if (!tree) {
      return null;
    }

    return buildRepoTree(tree.files);
  }, [tree]);

  if (isLoading) {
    return (
      <Card className="space-y-3 p-6">
        <Skeleton className="h-5 w-1/3" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-[68px]" />
          <Skeleton className="h-[68px]" />
        </div>
        <Skeleton className="h-52" />
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="File tree unavailable"
        message={error}
        onRetry={loadTree}
      />
    );
  }

  if (!tree) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          No repository file tree was returned.
        </p>
      </Card>
    );
  }

  return (
    <Card beam className="p-6">
      <p className="text-sm text-muted-foreground">
        Branch{" "}
        <span className="font-mono text-foreground">{tree.defaultBranch}</span>
        {" · "}
        {numberFormatter.format(tree.totalDirectories)} directories
        {" · "}
        {numberFormatter.format(tree.totalFiles)} files
      </p>

      {tree.isTruncated ? (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-700 dark:text-amber-400">
          GitHub marked this recursive tree response as truncated, so this
          structure may be partial.
        </p>
      ) : null}

      <div className="mt-5 h-96 rounded-md border bg-muted/40 py-3">
        {treeRoot && treeRoot.children.length > 0 ? (
          // No initialExpandedItems → the tree opens fully collapsed.
          // Re-key on the repo URL so a fresh repo resets expansion state.
          <Tree key={repoUrl} className="text-foreground">
            {renderNodes(treeRoot.children)}
          </Tree>
        ) : (
          <p className="px-4 text-sm text-muted-foreground">
            This repository has no files to display.
          </p>
        )}
      </div>
    </Card>
  );
}
