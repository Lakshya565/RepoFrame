"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function TreeSkeleton() {
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

const RepoTreeView = dynamic(
  () =>
    import("@/components/repo-tree-view").then(
      (module) => module.RepoTreeView,
    ),
  { loading: TreeSkeleton },
);

// Defers the large tree conversion and client bundle until the section approaches
// the viewport. The core stream can still fetch structure once for other cards.
export function LazyRepoTreeView({ repoUrl }: { repoUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {nearViewport ? <RepoTreeView repoUrl={repoUrl} /> : <TreeSkeleton />}
    </div>
  );
}
