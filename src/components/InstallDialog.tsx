import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import type { Agent, Skill } from '../types/models';

/**
 * 安装确认弹窗参数。
 */
type InstallDialogProps = {
  open: boolean;
  skill: Skill | null;
  agents: Agent[];
  selectedAgents: Set<string>;
  onToggleAgent: (id: string) => void;
  conflict: boolean;
  onOverwrite: () => void;
  onKeep: () => void;
  onOpenSkillPath: () => void;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * 安装到本机的确认弹窗。
 */
const InstallDialog = ({
  open,
  skill,
  agents,
  selectedAgents,
  onToggleAgent,
  conflict,
  onOverwrite,
  onKeep,
  onOpenSkillPath,
  onClose,
  onConfirm,
}: InstallDialogProps) => {
  if (!open || !skill) return null;
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">确认安装</div>
            <div className="dialog-subtitle">{skill.name} 将安装到以下 Agents</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          {agents.map((agent) => (
            <label key={agent.id} className="dialog-option">
              <input
                type="checkbox"
                checked={selectedAgents.has(agent.id)}
                onChange={() => onToggleAgent(agent.id)}
              />
              <div>
                <div className="option-title">{agent.name}</div>
                <div className="option-subtitle">
                  Mac: {agent.pathMac} · Windows: {agent.pathWindows}
                </div>
              </div>
            </label>
          ))}
          {conflict ? (
            <div className="notice">
              已存在同名 Skill。请选择覆盖或保留。
            </div>
          ) : null}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn ghost" onClick={onOpenSkillPath}>
            查看位置
          </button>
          {conflict ? (
            <button type="button" className="btn ghost" onClick={onKeep}>
              保留现有
            </button>
          ) : null}
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          {conflict ? (
            <button type="button" className="btn primary" onClick={onOverwrite}>
              <CheckmarkCircleRegular className="icon" />
              覆盖安装
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={onConfirm}>
              <CheckmarkCircleRegular className="icon" />
              确认安装
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallDialog;
