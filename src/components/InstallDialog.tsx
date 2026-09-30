import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import type { Agent, Skill } from '../types/models';
import { Button } from './ui/button';
import InstallAgentSelector from './InstallAgentSelector';

/**
 * 安装确认弹窗参数。
 */
type InstallDialogProps = {
  open: boolean;
  skill: Skill | null;
  agents: Agent[];
  selectedAgents: Set<string>;
  onToggleAgent: (id: string) => void;
  onInvertSelection: () => void;
  conflict: boolean;
  onOverwrite: () => void;
  onKeep: () => void;
  onOpenSkillPath: () => void;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
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
  onInvertSelection,
  conflict,
  onOverwrite,
  onKeep,
  onOpenSkillPath,
  onClose,
  onConfirm,
  submitting = false,
}: InstallDialogProps) => {
  if (!open || !skill) return null;
  return (
    <div className="dialog-backdrop">
      <div className="dialog install-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">确认安装</div>
            <div className="dialog-subtitle">{skill.name} 将安装到以下 Agents</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={submitting}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <InstallAgentSelector
            agents={agents}
            selectedAgents={selectedAgents}
            submitting={submitting}
            onToggleAgent={onToggleAgent}
            onInvertSelection={onInvertSelection}
          />
          {conflict ? (
            <div className="notice">
              已存在同名 Skill。请选择覆盖或保留。
            </div>
          ) : null}
        </div>
        <div className="dialog-footer">
          <Button type="button" variant="ghost" size="sm" onClick={onOpenSkillPath} disabled={submitting}>
            打开技能所在目录
          </Button>
          {conflict ? (
            <Button type="button" variant="ghost" size="sm" onClick={onKeep} disabled={submitting}>
              保留现有
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          {conflict ? (
            <Button type="button" className="rounded-full" size="sm" onClick={onOverwrite} disabled={submitting}>
              {submitting ? <span className="mini-spinner" aria-hidden="true" /> : <CheckmarkCircleRegular className="icon" />}
              覆盖安装
            </Button>
          ) : (
            <Button type="button" className="rounded-full" size="sm" onClick={onConfirm} disabled={submitting || !selectedAgents.size}>
              {submitting ? <span className="mini-spinner" aria-hidden="true" /> : <CheckmarkCircleRegular className="icon" />}
              确认安装
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallDialog;
