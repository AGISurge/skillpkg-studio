import { CodeRegular, EditRegular, SaveRegular } from '@fluentui/react-icons';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { SkillFile } from '../types/models';
import { getMarkdownContent } from '../utils/skillUtils';

/**
 * 技能内容查看器参数。
 */
type SkillViewerProps = {
  file: SkillFile | null;
  editing: boolean;
  draftValue: string | undefined;
  onToggleEdit: () => void;
  onSave: () => void;
  onChangeDraft: (value: string) => void;
};

/**
 * 技能文件内容查看与编辑。
 */
const SkillViewer = ({
  file,
  editing,
  draftValue,
  onToggleEdit,
  onSave,
  onChangeDraft,
}: SkillViewerProps) => {
  const displayedContent = file ? draftValue ?? file.content : '';
  const markdownContent = getMarkdownContent(
    file ? { ...file, content: displayedContent } : null
  );

  return (
    <>
      <div className="viewer-header">
        <div className="viewer-header-inner">
          <div className="viewer-title">
            <CodeRegular className="icon" />
            {file?.path || '未选择文件'}
          </div>
          <div className="viewer-actions">
            <button type="button" className="btn ghost" onClick={onToggleEdit}>
              <EditRegular className="icon" />
              {editing ? '预览' : '编辑'}
            </button>
            <button type="button" className="btn primary" onClick={onSave} disabled={!editing}>
              <SaveRegular className="icon" />
              保存
            </button>
          </div>
        </div>
      </div>
      <div className="viewer-content">
        {editing ? (
          <textarea
            value={displayedContent}
            onChange={(event) => onChangeDraft(event.target.value)}
          />
        ) : (
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{markdownContent}</ReactMarkdown>
        )}
      </div>
    </>
  );
};

export default SkillViewer;
