"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRepoTree, type RepoTreeResponse } from "@/lib/repo-api";
import { buildRepoTree, type RepoTreeNode } from "@/lib/repo-tree";

type RepoTreeViewProps = {
  repoUrl: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function RepoTreeView({ repoUrl }: RepoTreeViewProps) {
  const [tree, setTree] = useState<RepoTreeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

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

  const treeRoot = useMemo(() => {
    if (!tree) {
      return null;
    }

    return buildRepoTree(tree.files);
  }, [tree]);

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
    return <RepoTreeLoadingCard />;
  }

  if (error) {
    return (
      <article className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
          File tree unavailable
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          RepoFrame could not fetch the repository structure.
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-600">{error}</p>
        <button
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={loadTree}
          type="button"
        >
          Try again
        </button>
      </article>
    );
  }

  if (!tree) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-base text-slate-600">
          No repository file tree was returned.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            File tree
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            Top-level structure
          </h2>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-500">Total files</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-950">
            {numberFormatter.format(tree.totalFiles)}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <dt className="text-sm font-medium text-slate-500">
            Default branch
          </dt>
          <dd className="mt-2 break-words font-mono text-slate-950">
            {tree.defaultBranch}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <dt className="text-sm font-medium text-slate-500">Directories</dt>
          <dd className="mt-2 font-mono text-slate-950">
            {numberFormatter.format(tree.totalDirectories)}
          </dd>
        </div>
      </dl>

      {tree.isTruncated ? (
        <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          GitHub marked this recursive tree response as truncated, so this
          structure may be partial.
        </p>
      ) : null}

      <div className="mt-6 max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100">
        <div className="text-slate-400">.</div>
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
    </article>
  );
}

type RepoTreeRowProps = {
  node: RepoTreeNode;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
};

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
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 transition hover:border-slate-500 hover:bg-slate-700 hover:text-white"
            onClick={() => onToggle(node.path)}
            type="button"
          >
            {isExpanded ? "v" : ">"}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}
        <span className={isDirectory ? "text-emerald-200" : "text-slate-100"}>
          {label}
        </span>
        {isDirectory ? (
          <span className="text-xs text-slate-500">
            {numberFormatter.format(node.fileCount)} files
          </span>
        ) : null}
      </div>

      {isDirectory && hasChildren && isExpanded ? (
        <ul className="ml-3 space-y-1 border-l border-slate-800 pl-4">
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

function RepoTreeLoadingCard() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Fetching file tree
      </p>
      <div className="mt-4 space-y-3">
        <div className="h-7 w-1/2 rounded-md bg-slate-200" />
        <div className="h-4 w-full rounded-md bg-slate-100" />
        <div className="h-4 w-5/6 rounded-md bg-slate-100" />
      </div>
      <div className="mt-6 h-52 rounded-md border border-slate-200 bg-slate-950" />
    </article>
  );
}
