import {
  ChevronDownRegular,
  ChevronRightRegular,
  DocumentRegular,
  FolderRegular,
} from '@fluentui/react-icons';
import type { SkillFile } from '../types/models';
import { buildTree } from '../utils/skillUtils';

type SkillTreeProps = {
  files: SkillFile[];
  selectedFilePath: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
};

const SkillTree = ({
  files,
  selectedFilePath,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: SkillTreeProps) => {
  const tree = buildTree(files);

  const renderTree = (node: ReturnType<typeof buildTree>, depth = 0) => {
    const entries = Object.values(node.children).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    return entries.map((entry) => {
      const isExpanded = expandedFolders.has(entry.path);
      const isActive = entry.path === selectedFilePath;
      if (entry.type === 'folder') {
        return (
          <div key={entry.path} className="tree-node" style={{ paddingLeft: depth * 12 }}>
            <button
              type="button"
              className="tree-item"
              onClick={() => onToggleFolder(entry.path)}
            >
              {isExpanded ? (
                <ChevronDownRegular className="icon" />
              ) : (
                <ChevronRightRegular className="icon" />
              )}
              <FolderRegular className="icon" />
              <span>{entry.name}</span>
            </button>
            {isExpanded && renderTree(entry, depth + 1)}
          </div>
        );
      }
      return (
        <div key={entry.path} className="tree-node" style={{ paddingLeft: depth * 12 }}>
          <button
            type="button"
            className={`tree-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelectFile(entry.path)}
          >
            <DocumentRegular className="icon" />
            <span>{entry.name}</span>
          </button>
        </div>
      );
    });
  };

  return <>{renderTree(tree)}</>;
};

export default SkillTree;
