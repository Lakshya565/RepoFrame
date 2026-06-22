"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { fetchRepoTree, type RepoTreeResponse } from "@/lib/repo-api";
import { buildRepoTree, type RepoTreeNode } from "@/lib/repo-tree";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";

type RepoTreeViewProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

// Fetches GitHub's repository structure and renders it as a compact expandable
// tree. It intentionally works only with paths/types from the tree API, not file
// contents, so Phase 4 stays focused on structure.
export function RepoTreeView({ repoUrl }: RepoTreeViewProps) {
  const [tree, setTree] = useState<RepoTreeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Reloads the file tree for the retry button. It also collapses the tree so a
  // fresh response starts from the same top-level view every time.
  const loadTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setExpandedPaths(new Set());

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
      setExpandedPaths(new Set());

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
  // backend response changes. The render path can then stay recursive and simple.
  const treeRoot = useMemo(() => {
    if (!tree) {
      return null;
    }

    return buildRepoTree(tree.files);
  }, [tree]);

  // Tracks expanded folders by normalized path. Child rows receive this state
  // rather than owning their own expansion state, which keeps recursion stable.
  const toggleNode = useCallback((path: string) => {
    setExpandedPaths((currentPaths) => {
      const nextPaths = new Set(currentPaths);

      if (nextPaths.has(path)) {
        nextPaths.delete(path);
      } else {
        nextPaths.add(path);
      }

      return nextPaths;
    });
  }, []);

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
    <Card className="p-6">
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

      <div className="mt-5 max-h-96 overflow-auto rounded-md border bg-muted/40 p-4 font-mono text-sm leading-6">
        <div className="text-muted-foreground">.</div>
        {treeRoot && treeRoot.children.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {treeRoot.children.map((node) => (
              <RepoTreeRow
                expandedPaths={expandedPaths}
                key={node.path}
                node={node}
                onToggle={toggleNode}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

type RepoTreeRowProps = {
  node: RepoTreeNode;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
};

// Renders one file-tree node. Folder nodes expose a caret button and recursively
// render children only when their path is marked as expanded.
function RepoTreeRow({ node, expandedPaths, onToggle }: RepoTreeRowProps) {
  const isDirectory = node.type === "directory";
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedPaths.has(node.path);
  const label = isDirectory ? `${node.name}/` : node.name;

  return (
    <li>
      <div className="flex min-h-7 items-center gap-2">
        {isDirectory && hasChildren ? (
          <button
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.path}`}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => onToggle(node.path)}
            type="button"
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <span className={isDirectory ? "font-medium text-brand" : "text-foreground"}>
          {label}
        </span>
        {isDirectory ? (
          <span className="text-xs text-muted-foreground">
            {numberFormatter.format(node.fileCount)} files
          </span>
        ) : null}
      </div>

      {isDirectory && hasChildren && isExpanded ? (
        <ul className="ml-2.5 space-y-1 border-l pl-4">
          {node.children.map((childNode) => (
            <RepoTreeRow
              expandedPaths={expandedPaths}
              key={childNode.path}
              node={childNode}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
