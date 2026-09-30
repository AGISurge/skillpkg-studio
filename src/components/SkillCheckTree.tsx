import {
  ChevronDownRegular,
  ChevronRightRegular,
  DocumentRegular,
  FolderRegular,
} from "@fluentui/react-icons";
import { useMemo } from "react";
import { LevelBadge } from "../security/SecurityFindings";
import type { SkillCheckFile } from "../security/skillCheckTypes";

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file: SkillCheckFile | null;
};
type Props = {
  files: SkillCheckFile[];
  selectedPath: string;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
};

export const SkillCheckTree = ({
  files,
  selectedPath,
  collapsed,
  onToggle,
  onSelect,
}: Props) => {
  const tree = useMemo(() => {
    const root: TreeNode = {
      name: "",
      path: "",
      children: new Map(),
      file: null,
    };
    for (const file of files) {
      let node = root;
      for (const name of file.path.split("/")) {
        let child = node.children.get(name);
        if (!child) {
          child = {
            name,
            path: node.path ? `${node.path}/${name}` : name,
            children: new Map(),
            file: null,
          };
          node.children.set(name, child);
        }
        node = child;
      }
      node.file = file;
    }
    return root;
  }, [files]);
  const renderChildren = (node: TreeNode, depth: number): React.ReactNode =>
    [...node.children.values()]
      .sort(
        (a, b) =>
          Number(b.children.size > 0) - Number(a.children.size > 0) ||
          a.name.localeCompare(b.name),
      )
      .map((entry) => {
        const folder = entry.children.size > 0;
        const expanded = !collapsed.has(entry.path);
        const file = entry.file;
        return (
          <div
            key={entry.path}
            role="treeitem"
            aria-expanded={folder ? expanded : undefined}
            aria-selected={selectedPath === entry.path}
          >
            <button
              type="button"
              className={`skill-check-tree-row ${selectedPath === entry.path ? "active" : ""}`}
              style={{ paddingLeft: 12 + depth * 14 }}
              title={entry.path}
              onClick={() =>
                folder && !file ? onToggle(entry.path) : onSelect(entry.path)
              }
            >
              {folder ? (
                <>
                  <span
                    onClick={(event) => {
                      if (file) {
                        event.stopPropagation();
                        onToggle(entry.path);
                      }
                    }}
                  >
                    {expanded ? (
                      <ChevronDownRegular className="icon" />
                    ) : (
                      <ChevronRightRegular className="icon" />
                    )}
                  </span>
                  <FolderRegular className="icon" />
                </>
              ) : (
                <DocumentRegular className="icon" />
              )}
              <span className="skill-check-tree-name">{entry.name}</span>
              {file &&
              (file.status === "checked" || file.status === "complete") ? (
                <LevelBadge
                  level={file.level}
                  partial={
                    file.status === "complete" && file.coverage !== "complete"
                  }
                />
              ) : file ? (
                <span className="security-level security-level-pending">
                  {file.status === "pending" ? "待扫描" : "分析中"}
                </span>
              ) : null}
            </button>
            {folder && expanded ? (
              <div role="group">{renderChildren(entry, depth + 1)}</div>
            ) : null}
          </div>
        );
      });
  return (
    <div role="tree" aria-label="Skill 文件树">
      {renderChildren(tree, 0)}
    </div>
  );
};
