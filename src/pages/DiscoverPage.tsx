import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { ArrowDownloadRegular, KeyRegular } from '@fluentui/react-icons';
import type { Skill, SkillFile } from '../types/models';
import { getMarkdownContent } from '../utils/skillUtils';

type DiscoverPageProps = {
  skills: Skill[];
  selectedSkillId: string;
  selectedSkill: Skill | null;
  selectedFile: SkillFile | null;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onSelectSkill: (skill: Skill) => void;
  onInstall: (skill: Skill) => void;
};

const DiscoverPage = ({
  skills,
  selectedSkillId,
  selectedSkill,
  selectedFile,
  apiKey,
  onApiKeyChange,
  onSelectSkill,
  onInstall,
}: DiscoverPageProps) => {
  const markdownContent = getMarkdownContent(selectedFile);

  return (
    <section className="panel-grid fade-in">
      <div className="panel list">
        <div className="panel-header">
          <div>
            <div className="panel-title">发现技能</div>
            <div className="panel-subtitle">连接 SkillPkg 市集</div>
          </div>
          <div className="panel-actions">
            <div className="field">
              <KeyRegular className="icon" />
              <input
                type="password"
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                placeholder="输入 API Key"
              />
            </div>
          </div>
        </div>
        <div className="skill-list">
          {skills.map((skill) => (
            <button
              type="button"
              key={skill.id}
              className={`skill-card ${selectedSkillId === skill.id ? 'active' : ''}`}
              onClick={() => onSelectSkill(skill)}
            >
              <div className="skill-card-header">
                <div>
                  <div className="skill-title">{skill.name}</div>
                  <div className="skill-version">v{skill.version}</div>
                </div>
                <div className="pill">远程</div>
              </div>
              <p>{skill.description}</p>
              <div className="skill-meta">
                <span>{skill.author}</span>
                <span>{skill.tags.join(' · ')}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="panel detail">
        {selectedSkill ? (
          <>
            <div className="detail-header">
              <div>
                <div className="detail-title">{selectedSkill.name}</div>
                <div className="detail-subtitle">{selectedSkill.description}</div>
              </div>
              <button type="button" className="btn primary" onClick={() => onInstall(selectedSkill)}>
                <ArrowDownloadRegular className="icon" />
                安装到本机
              </button>
            </div>
            <div className="detail-meta">
              <div>
                <span className="label">作者</span>
                <span>{selectedSkill.author}</span>
              </div>
              <div>
                <span className="label">标签</span>
                <span>{selectedSkill.tags.join(', ')}</span>
              </div>
              <div>
                <span className="label">版本</span>
                <span>{selectedSkill.version}</span>
              </div>
            </div>
            <div className="detail-section">
              <div className="section-title">内容预览</div>
              <div className="preview">
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{markdownContent}</ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">暂无可展示的 Skill。</div>
        )}
      </div>
    </section>
  );
};

export default DiscoverPage;
