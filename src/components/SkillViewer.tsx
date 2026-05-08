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
import { getMarkdownContent } from "../utils/skillUtils";
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
  const loadingContent = file?.contentLoaded === false;
  const displayedContent = file ? (draftValue ?? file.content) : "";
  const hasChanges = Boolean(
    file && draftValue !== undefined && draftValue !== file.content,
  );
  const markdownContent = useMemo(
    () =>
      getMarkdownContent(file ? { ...file, content: displayedContent } : null),
    [displayedContent, file],
  );

  return (
    <>
      <div className="viewer-header">
        <div className="viewer-header-inner">
          <div className="viewer-title">
            <CodeRegular className="icon" />
            {file?.path || "未选择文件"}
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
                disabled={loadingContent || !file}
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
        ) : editing ? (
          <textarea
            value={displayedContent}
            onChange={(event) => onChangeDraft(event.target.value)}
          />
        ) : (
          <ReactMarkdown
            remarkPlugins={markdownRemarkPlugins}
            rehypePlugins={markdownRehypePlugins}
            className="leading-relaxed"
          >
            {markdownContent}
          </ReactMarkdown>
        )}
      </div>
    </>
  );
};

export default memo(SkillViewer);
