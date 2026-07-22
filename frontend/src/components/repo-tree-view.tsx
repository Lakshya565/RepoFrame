"use client";

import { useEffect, useMemo } from "react";
import { Star } from "lucide-react";

import { useRepoAnalysis } from "@/lib/analysis-context";
import { buildRepoTree, type RepoTreeNode } from "@/lib/repo-tree";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { File, Folder, Tree } from "@/components/ui/file-tree";

type RepoTreeViewProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

// Creates only the currently requested level. Folder descendants are supplied as
// a render function, so the file-tree primitive materializes them on expansion
// instead of building the entire repository DOM while every folder is collapsed.
function renderNodes(
  nodes: RepoTreeNode[],
  importantPaths: ReadonlySet<string>,
): React.ReactNode {
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
          {() => renderNodes(node.children, importantPaths)}
        </Folder>
      );
    }

    const isImportant = importantPaths.has(node.path);
    return (
      <File
        key={node.path}
        value={node.path}
        title={
          isImportant ? "RepoFrame read this file during analysis" : undefined
        }
      >
        <span className={isImportant ? "font-medium" : undefined}>
          {node.name}
        </span>
        {isImportant ? (
          <Star
            aria-hidden
            strokeWidth={0}
            className="size-3 shrink-0 fill-current"
          />
        ) : null}
      </File>
    );
  });
}

// Renders the structure and file highlights already delivered by the shared core
// analysis stream. This component performs no repository requests of its own.
export function RepoTreeView({ repoUrl }: RepoTreeViewProps) {
  const { tree: treeResource, ranking } = useRepoAnalysis();
  const { data: tree, error, isLoading, reload } = treeResource;
  const importantPaths = useMemo<ReadonlySet<string>>(
    () => new Set(ranking.data?.rankedFiles.map((file) => file.path) ?? []),
    [ranking.data],
  );

  const treeRoot = useMemo(
    () => (tree ? buildRepoTree(tree.files) : null),
    [tree],
  );

  useEffect(() => {
    if (tree) {
      performance.mark("repoframe-analysis-tree-interactive");
    }
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
        onRetry={reload}
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

      {importantPaths.size > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star
            aria-hidden
            strokeWidth={0}
            className="size-3 shrink-0 fill-foreground"
          />
          Starred files are the ones we read to understand your project.
        </p>
      ) : null}

      {tree.isTruncated ? (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-700 dark:text-amber-400">
          GitHub marked this recursive tree response as truncated, so this
          structure may be partial.
        </p>
      ) : null}

      <div className="mt-5 h-96 rounded-md border bg-muted/40 py-3">
        {treeRoot && treeRoot.children.length > 0 ? (
          <Tree key={repoUrl} className="text-foreground">
            {renderNodes(treeRoot.children, importantPaths)}
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
