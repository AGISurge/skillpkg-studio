import {
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  SettingsRegular,
  StarFilled,
  StarRegular,
} from '@fluentui/react-icons';
import type { Skill, SkillFile } from '../types/models';
import SkillTree from '../components/SkillTree';
import SkillViewer from '../components/SkillViewer';

/**
 * 技能列表与详情页参数。
 */
type SkillsPageProps = {
  skills: Skill[];
  selectedSkillId: string;
  selectedSkill: Skill | null;
  selectedFile: SkillFile | null;
  selectedFilePath: string;
  favorites: Set<string>;
  mode: 'local' | 'favorites' | 'agents';
  installedSkillIds?: Set<string>;
  onSelectSkill: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onInstallToggle?: (skill: Skill) => void;
  onReinstall?: (skill: Skill) => void;
  onSelectFile: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  editing: boolean;
  draftValue: string | undefined;
  onToggleEdit: () => void;
  onSave: () => void;
  onChangeDraft: (value: string) => void;
};

/**
 * 通用技能页面（本机/收藏/Agents 复用）。
 */
const SkillsPage = ({
  skills,
  selectedSkillId,
  selectedSkill,
  selectedFile,
  selectedFilePath,
  favorites,
  mode,
  installedSkillIds,
  onSelectSkill,
  onToggleFavorite,
  onInstallToggle,
  onReinstall,
  onSelectFile,
  expandedFolders,
  onToggleFolder,
  editing,
  draftValue,
  onToggleEdit,
  onSave,
  onChangeDraft,
}: SkillsPageProps) => {
  return (
    <section className="panel-grid fade-in">
      <div className="list">
        <div className="skill-list">
          {skills.map((skill) => {
            const isInstalled = installedSkillIds?.has(skill.id);
            const isAgentOwned = mode === 'agents' && skill.source === 'agent';
            return (
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
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(skill.id);
                    }}
                  >
                    {favorites.has(skill.id) ? (
                      <StarFilled className="icon" />
                    ) : (
                      <StarRegular className="icon" />
                    )}
                  </button>
                </div>
                <p>{skill.description}</p>
                <div className="skill-meta">
                  {mode === 'agents' && (
                    <>
                      <span className={`source-tag ${skill.source === 'managed' ? 'managed' : 'agent'}`}>
                        {skill.source === 'managed' ? 'SkillPKG 托管' : 'Agent 自有'}
                      </span>
                      <span className={`status ${isInstalled ? 'on' : 'off'}`}>
                        {isInstalled ? (
                          <>
                            <CheckmarkCircleRegular className="icon" /> 托管
                          </>
                        ) : (
                          <>
                            <DismissCircleRegular className="icon" /> 自有
                          </>
                        )}
                      </span>
                    </>
                  )}
                </div>
                {mode === 'agents' && onInstallToggle && (
                  <button
                    type="button"
                    className={`btn ${isInstalled ? 'ghost' : 'primary'}`}
                    disabled={isAgentOwned}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInstallToggle(skill);
                    }}
                  >
                    <SettingsRegular className="icon" />
                    {isAgentOwned ? '自有 Skill' : '卸载托管链接'}
                  </button>
                )}
              </button>
            );
          })}
          {skills.length === 0 && <div className="empty-state">当前列表为空。</div>}
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
              <div className="detail-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onToggleFavorite(selectedSkill.id)}
                >
                  {favorites.has(selectedSkill.id) ? (
                    <StarFilled className="icon" />
                  ) : (
                    <StarRegular className="icon" />
                  )}
                  收藏
                </button>
                {onReinstall && mode !== 'favorites' && (
                  <button type="button" className="btn ghost" onClick={() => onReinstall(selectedSkill)}>
                    <ArrowDownloadRegular className="icon" />
                    重新安装
                  </button>
                )}
              </div>
            </div>
            <div className="detail-body">
              <div className="tree">
                <div className="section-title">目录</div>
                <SkillTree
                  files={selectedSkill.files}
                  selectedFilePath={selectedFilePath}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                />
              </div>
              <div className="viewer">
                <SkillViewer
                  file={selectedFile}
                  editing={editing}
                  draftValue={draftValue}
                  onToggleEdit={onToggleEdit}
                  onSave={onSave}
                  onChangeDraft={onChangeDraft}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">请选择一个 Skill 查看详情。</div>
        )}
      </div>
    </section>
  );
};

export default SkillsPage;
