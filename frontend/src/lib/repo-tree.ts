import type { RepoFile } from "@/lib/repo-api";

export type RepoTreeNode = {
  name: string;
  path: string;
  type: RepoFile["type"];
  fileCount: number;
  children: RepoTreeNode[];
};

type MutableRepoTreeNode = Omit<RepoTreeNode, "children"> & {
  children: MutableRepoTreeNode[];
  childrenByName: Map<string, MutableRepoTreeNode>;
};

// Builds a nested tree from GitHub's flat path list for expandable UI rendering.
// Intermediate folder nodes are created as needed while leaf nodes preserve the
// normalized backend file type.
export function buildRepoTree(files: RepoFile[]): RepoTreeNode {
  const root = createNode(".", "", "directory");

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let currentNode = root;

    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      const type = isLeaf ? file.type : "directory";
      let childNode = currentNode.childrenByName.get(part);

      if (!childNode) {
        childNode = createNode(part, path, type);
        currentNode.childrenByName.set(part, childNode);
        currentNode.children.push(childNode);
      }

      if (isLeaf) {
        childNode.type = file.type;
      }

      currentNode = childNode;
    });
  }

  sortTree(root);
  updateFileCounts(root);

  return stripIndexes(root);
}

// Creates the mutable node shape used while building the tree. The Map gives
// efficient child lookup without exposing implementation details to the UI.
function createNode(
  name: string,
  path: string,
  type: RepoFile["type"],
): MutableRepoTreeNode {
  return {
    name,
    path,
    type,
    fileCount: 0,
    children: [],
    childrenByName: new Map(),
  };
}

// Sorts folders before files and then alphabetically so the display scans like a
// normal repository browser.
function sortTree(node: MutableRepoTreeNode) {
  node.children.sort((first, second) => {
    if (first.type === "directory" && second.type !== "directory") {
      return -1;
    }

    if (first.type !== "directory" && second.type === "directory") {
      return 1;
    }

    return first.name.localeCompare(second.name);
  });

  node.children.forEach(sortTree);
}

// Calculates file totals for each directory by walking children bottom-up. These
// counts are shown next to folder rows in the tree view.
function updateFileCounts(node: MutableRepoTreeNode): number {
  if (node.type === "file" || node.type === "submodule") {
    node.fileCount = 1;
    return 1;
  }

  node.fileCount = node.children.reduce(
    (total, child) => total + updateFileCounts(child),
    0,
  );

  return node.fileCount;
}

// Removes the build-only child index map before returning nodes to the frontend
// component, leaving a plain recursive structure.
function stripIndexes(node: MutableRepoTreeNode): RepoTreeNode {
  return {
    name: node.name,
    path: node.path,
    type: node.type,
    fileCount: node.fileCount,
    children: node.children.map(stripIndexes),
  };
}
