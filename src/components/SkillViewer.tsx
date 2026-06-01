import {
  ChevronDownRegular,
  CodeRegular,
  DismissRegular,
  EditRegular,
  SaveRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { SkillFile } from "../types/models";
import {
  formatBytes,
  getFilePolicy,
  getFilePolicyMessage,
  getMarkdownContent,
} from "../utils/skillUtils";
import SkillTree from "./SkillTree";
import { Button } from "./ui/button";

const markdownRehypePlugins = [rehypeHighlight];
const markdownRemarkPlugins = [remarkGfm];

/**
 * 技能内容查看器参数。
 */
type SkillViewerProps = {
  file: SkillFile | null;
  files: SkillFile[];
  selectedFilePath: string;
  expandedFolders: Set<string>;
  editing: boolean;
  draftValue: string | undefined;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChangeDraft: (value: string) => void;
};

type FileSelectorDropdownProps = {
  file: SkillFile | null;
  files: SkillFile[];
  selectedFilePath: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
};

const FileSelectorDropdown = ({
  file,
  files,
  selectedFilePath,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: FileSelectorDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredFiles = useMemo(() => {
    if (!normalizedQuery) return files;
    return files.filter((entry) =>
      entry.path.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [files, normalizedQuery]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="file-selector" ref={rootRef}>
      <button
        type="button"
        className="file-selector-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CodeRegular className="icon" />
        <span className="file-selector-label">{file?.path || "未选择文件"}</span>
        {file?.size !== undefined && (
          <span className="viewer-file-meta">{formatBytes(file.size)}</span>
        )}
        <ChevronDownRegular className="icon file-selector-chevron" />
      </button>
      {open ? (
        <div className="file-selector-popover" role="dialog" aria-label="选择文件">
          <div className="file-selector-search">
            <SearchRegular className="icon" />
            <input
              type="search"
              value={query}
              aria-label="筛选文件"
              placeholder="按文件名或路径筛选"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="skill-search-clear"
                aria-label="清空筛选"
                onClick={() => setQuery("")}
              >
                <DismissRegular className="icon" />
              </button>
            )}
          </div>
          <div className="file-selector-tree">
            {filteredFiles.length ? (
              <SkillTree
                files={filteredFiles}
                selectedFilePath={selectedFilePath}
                expandedFolders={expandedFolders}
                forceExpandAll={Boolean(normalizedQuery)}
                onToggleFolder={onToggleFolder}
                onSelectFile={(path) => {
                  onSelectFile(path);
                  setOpen(false);
                }}
              />
            ) : (
              <div className="empty-state">未找到匹配的文件。</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * 技能文件内容查看与编辑。
 */
const SkillViewer = ({
  file,
  files,
  selectedFilePath,
  expandedFolders,
  editing,
  draftValue,
  onToggleFolder,
  onSelectFile,
  onStartEdit,
  onSave,
  onCancel,
  onChangeDraft,
}: SkillViewerProps) => {
  const filePolicy = useMemo(() => getFilePolicy(file), [file]);
  const loadingContent = file?.contentLoaded === false && filePolicy.canLoad;
  const displayedContent = file ? (draftValue ?? file.content) : "";
  const hasChanges = Boolean(
    file && draftValue !== undefined && draftValue !== file.content,
  );
  const markdownContent = useMemo(
    () =>
      getMarkdownContent(file ? { ...file, content: displayedContent } : null),
    [displayedContent, file],
  );
  const canEdit = Boolean(file && !loadingContent && filePolicy.canEdit);
  const isImagePreview = Boolean(
    file &&
      filePolicy.kind === "image" &&
      filePolicy.canPreview &&
      file.contentLoaded !== false &&
      displayedContent,
  );

  const renderPreview = () => {
    if (!file) return <div className="empty-state">未选择文件。</div>;
    if (!filePolicy.canPreview || file.loadReason) {
      return <div className="empty-state">{getFilePolicyMessage(file)}</div>;
    }
    if (isImagePreview) {
      return (
        <div className="image-preview">
          <img src={displayedContent} alt={file.path} />
        </div>
      );
    }
    return (
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        className="leading-relaxed text-sm"
      >
        {markdownContent}
      </ReactMarkdown>
    );
  };

  return (
    <>
      <div className="viewer-header">
        <div className="viewer-header-inner">
          <div className="viewer-title">
            <FileSelectorDropdown
              file={file}
              files={files}
              selectedFilePath={selectedFilePath}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          </div>
          <div className="viewer-actions">
            {editing ? (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onSave}
                  disabled={loadingContent || !hasChanges}
                >
                  <SaveRegular className="icon" />
                  保存
                </Button>
                <Button
                 variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  disabled={loadingContent}
                >
                  <DismissRegular className="icon" />
                  取消
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={onStartEdit}
                disabled={!canEdit}
                title={!canEdit && file ? "此文件不支持编辑" : undefined}
              >
                <EditRegular className="icon" />
                编辑
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="viewer-content">
        {loadingContent ? (
          <div className="empty-state">正在加载文件内容...</div>
        ) : editing && canEdit ? (
          <textarea
            value={displayedContent}
            onChange={(event) => onChangeDraft(event.target.value)}
          />
        ) : (
          renderPreview()
        )}
      </div>
    </>
  );
};

export default memo(SkillViewer);
