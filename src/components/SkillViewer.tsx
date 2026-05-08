import {
  CodeRegular,
  DismissRegular,
  EditRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { memo } from "react";
import { useMemo } from "react";
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
import { Button } from "./ui/button";

const markdownRehypePlugins = [rehypeHighlight];
const markdownRemarkPlugins = [remarkGfm];

/**
 * 技能内容查看器参数。
 */
type SkillViewerProps = {
  file: SkillFile | null;
  editing: boolean;
  draftValue: string | undefined;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChangeDraft: (value: string) => void;
};

/**
 * 技能文件内容查看与编辑。
 */
const SkillViewer = ({
  file,
  editing,
  draftValue,
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
            <CodeRegular className="icon" />
            <span>{file?.path || "未选择文件"}</span>
            {file?.size !== undefined && (
              <span className="viewer-file-meta">{formatBytes(file.size)}</span>
            )}
          </div>
          <div className="viewer-actions">
            {editing ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={loadingContent || !hasChanges}
                >
                  <SaveRegular className="icon" />
                  保存
                </Button>
                <Button
                  type="button"
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
                type="button"
                size="sm"
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
