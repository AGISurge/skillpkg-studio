import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { ArrowDownloadRegular } from '@fluentui/react-icons';
import { getMarkdownContent } from '../utils/skillUtils';
import { useAppContext } from '../AppContext';

const getDefaultSkillFilePath = (skill: { files: Array<{ path: string }> }) =>
  skill.files.find((file) => file.path === 'SKILL.md')?.path ||
  skill.files[0]?.path ||
  '';

/**
 * 发现技能列表与详情预览。
 */
const DiscoverPage = () => {
  const {
    discoverSkills,
    selectedDiscoverSkillId,
    selectedFilePath,
    setSelectedDiscoverSkillId,
    setSelectedFilePath,
    openInstallDialog,
  } = useAppContext();

  const selectedSkill =
    discoverSkills.find((skill) => skill.id === selectedDiscoverSkillId) ||
    discoverSkills[0] ||
    null;
  const selectedFile =
    selectedSkill?.files.find((file) => file.path === selectedFilePath) ||
    selectedSkill?.files[0] ||
    null;
  const markdownContent = getMarkdownContent(selectedFile);

  return (
    <section className="panel-grid fade-in">
      <div className="panel list">
        <div className="panel-header">
          <div>
            <div className="panel-title">发现技能</div>
            <div className="panel-subtitle">连接 SkillPkg 市集</div>
          </div>
        </div>
        <div className="skill-list">
          {discoverSkills.map((skill) => (
            <button
              type="button"
              key={skill.id}
              className={`skill-card ${selectedSkill?.id === skill.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedDiscoverSkillId(skill.id);
                setSelectedFilePath(getDefaultSkillFilePath(skill));
              }}
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
              <button type="button" className="btn primary" onClick={() => openInstallDialog(selectedSkill)}>
                <ArrowDownloadRegular className="icon" />
                安装到本机
              </button>
            </div>
            <div className="detail-meta">
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
