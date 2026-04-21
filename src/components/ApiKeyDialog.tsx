import { DismissCircleRegular, KeyRegular } from '@fluentui/react-icons';

type ApiKeyDialogProps = {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const ApiKeyDialog = ({ open, value, onChange, onConfirm, onCancel }: ApiKeyDialogProps) => {
  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">API Key</div>
            <div className="dialog-subtitle">用于访问 SkillPkg 市集</div>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <label className="dialog-option">
            <KeyRegular className="icon" />
            <input
              type="password"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="输入 API Key"
              className="settings-input"
            />
          </label>
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyDialog;
