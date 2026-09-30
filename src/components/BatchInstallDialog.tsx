import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import type { Agent, Skill } from '../types/models';
import { Button } from './ui/button';
import InstallAgentSelector from './InstallAgentSelector';

type BatchInstallDialogProps = {
  open: boolean;
  skills: Skill[];
  agents: Agent[];
  selectedAgents: Set<string>;
  submitting?: boolean;
  onToggleAgent: (id: string) => void;
  onInvertSelection: () => void;
  onClose: () => void;
  onConfirm: () => void;
};

const BatchInstallDialog = ({
  open,
  skills,
  agents,
  selectedAgents,
  submitting = false,
  onToggleAgent,
  onInvertSelection,
  onClose,
  onConfirm,
}: BatchInstallDialogProps) => {
  if (!open || !skills.length) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog batch-install-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">安装导入的 Skills</div>
            <div className="dialog-subtitle">
              {skills.length} 个 Skill 将安装到选中的 Agents
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={submitting}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>

        <div className="dialog-body">
          <div className="batch-skill-list">
            {skills.map((skill) => (
              <span className="batch-skill-chip" key={skill.id}>
                {skill.name}
              </span>
            ))}
          </div>

          <InstallAgentSelector
            agents={agents}
            selectedAgents={selectedAgents}
            submitting={submitting}
            onToggleAgent={onToggleAgent}
            onInvertSelection={onInvertSelection}
          />
        </div>

        <div className="dialog-footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            稍后安装
          </Button>
          <Button
            type="button"
            className="btn primary"
            onClick={onConfirm}
            disabled={submitting || !selectedAgents.size}
          >
            {submitting ? <span className="mini-spinner" aria-hidden="true" /> : <CheckmarkCircleRegular className="icon" />}
            确认安装
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BatchInstallDialog;
