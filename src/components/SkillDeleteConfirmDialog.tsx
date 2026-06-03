import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import type { SkillDeleteDialogState } from '../AppContext';
import { Button } from './ui/button';

type SkillDeleteConfirmDialogProps = {
  state: SkillDeleteDialogState | null;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const getDialogCopy = (state: SkillDeleteDialogState) => {
  if (state.action === 'agent-uninstall') {
    return {
      title: '确认卸载 Skill',
      body: `这会删除 ${state.agentName || '当前 Agent'} 中指向统一库的软链接，不会删除统一库中的 ${state.skill.name}。`,
      confirmLabel: '确认卸载',
    };
  }

  if (state.action === 'agent-delete') {
    return {
      title: '确认删除 Skill',
      body: `这会直接删除 ${state.agentName || '当前 Agent'} 本地目录中的 ${state.skill.name}，此操作不可撤销。`,
      confirmLabel: '确认删除',
    };
  }

  return {
    title: '确认删除本地 Skill',
    body: `这会删除统一库中的 ${state.skill.name}。`,
    confirmLabel: '确认删除',
  };
};

const SkillDeleteConfirmDialog = ({
  state,
  submitting = false,
  onClose,
  onConfirm,
}: SkillDeleteConfirmDialogProps) => {
  if (!state) return null;

  const copy = getDialogCopy(state);
  const hostedAgentNames = state.hostedAgentNames || [];

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">{copy.title}</div>
            <div className="dialog-subtitle">{state.skill.name}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={submitting}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <div>
            <p className='text-sm'>{copy.body}</p>
          </div>
          {state.action === 'library-delete' && (
            <div className="delete-usage">
              {hostedAgentNames.length ? (
                <>
                  <div className="option-title">同时会从以下 Agents 中卸载：</div>
                  <div className="delete-agent-list">
                    {hostedAgentNames.map((agentName) => (
                      <span className="skill-agent-tag" key={agentName}>
                        {agentName}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="option-title">当前没有 Agent 正在使用。</div>
              )}
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting ? <span className="mini-spinner" aria-hidden="true" /> : <CheckmarkCircleRegular className="icon" />}
            {copy.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SkillDeleteConfirmDialog;
