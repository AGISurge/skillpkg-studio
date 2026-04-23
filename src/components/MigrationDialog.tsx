import { DismissCircleRegular } from '@fluentui/react-icons';

/**
 * 迁移来源的 Agent 信息。
 */
type MigrationAgent = {
  id: string;
  name: string;
};

/**
 * 迁移弹窗中展示的技能条目。
 */
type MigrationSkill = {
  id: string;
  name: string;
  description: string;
  agents: MigrationAgent[];
};

/**
 * 迁移弹窗参数。
 */
type MigrationDialogProps = {
  open: boolean;
  loading: boolean;
  migrating: boolean;
  installPath: string;
  skills: MigrationSkill[];
  selectedIds: Set<string>;
  selectedSources: Record<string, string>;
  notice: string;
  onToggleAll: () => void;
  onToggleSkill: (skillId: string) => void;
  onSelectSource: (skillId: string, agentId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 数据迁移弹窗。
 */
const MigrationDialog = ({
  open,
  loading,
  migrating,
  installPath,
  skills,
  selectedIds,
  selectedSources,
  notice,
  onToggleAll,
  onToggleSkill,
  onSelectSource,
  onConfirm,
  onCancel,
}: MigrationDialogProps) => {
  if (!open) return null;

  const allSelected = skills.length > 0 && selectedIds.size === skills.length;

  return (
    <div className="dialog-backdrop">
      <div className="dialog migration-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">数据迁移</div>
            <div className="dialog-subtitle">扫描已安装 Agents，迁移技能到统一路径</div>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <div className="migration-meta">
            <div>
              <span className="label">统一路径</span>
              <span className="value">{installPath || '未设置'}</span>
            </div>
            <div className="migration-actions">
              <label className="migration-select-all">
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                全选
              </label>
              <span className="muted">已选 {selectedIds.size} 项</span>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">正在扫描已安装的 Agents...</div>
          ) : skills.length === 0 ? (
            <div className="empty-state">未发现可迁移的技能。</div>
          ) : (
            <div className="migration-list">
              {skills.map((skill) => {
                const isChecked = selectedIds.has(skill.id);
                const hasMultiple = skill.agents.length > 1;
                const selectedSource = selectedSources[skill.id] || '';
                return (
                  <div key={skill.id} className={`migration-item ${isChecked ? 'active' : ''}`}>
                    <label className="migration-main">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleSkill(skill.id)}
                      />
                      <div>
                        <div className="migration-title">{skill.name}</div>
                        {skill.description ? (
                          <div className="migration-subtitle">{skill.description}</div>
                        ) : null}
                      </div>
                    </label>
                    <div className="migration-tags">
                      {skill.agents.map((agent) => (
                        <span key={agent.id} className="migration-tag">
                          {agent.name}
                        </span>
                      ))}
                    </div>
                    {hasMultiple ? (
                      <div className="migration-sources">
                        <div className="migration-hint">选择来源</div>
                        <div className="migration-source-options">
                          {skill.agents.map((agent) => (
                            <label key={agent.id} className="migration-source">
                              <input
                                type="radio"
                                name={`source-${skill.id}`}
                                checked={selectedSource === agent.id}
                                onChange={() => onSelectSource(skill.id, agent.id)}
                              />
                              {agent.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {notice ? <div className="notice">{notice}</div> : null}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onConfirm}
            disabled={migrating || !installPath}
          >
            {migrating ? '迁移中...' : '开始迁移'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MigrationDialog;
