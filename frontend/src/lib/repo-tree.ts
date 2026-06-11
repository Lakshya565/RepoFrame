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

function stripIndexes(node: MutableRepoTreeNode): RepoTreeNode {
  return {
    name: node.name,
    path: node.path,
    type: node.type,
    fileCount: node.fileCount,
    children: node.children.map(stripIndexes),
  };
}
