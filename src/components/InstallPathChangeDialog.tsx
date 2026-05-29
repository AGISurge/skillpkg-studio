import { DismissCircleRegular } from '@fluentui/react-icons';
import type { InstallPathChangePreview } from '../AppContext';

type InstallPathChangeDialogProps = {
  preview: InstallPathChangePreview | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const InstallPathChangeDialog = ({
  preview,
  submitting,
  onClose,
  onConfirm,
}: InstallPathChangeDialogProps) => {
  if (!preview) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog install-path-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">确认切换存放路径</div>
            <div className="dialog-subtitle">将迁移本地 Skills 并更新 Agent 软链接</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={submitting}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <div className="path-change-summary">
            <div>
              <span className="label">当前路径</span>
              <span className="value">{preview.fromInstallPath || '未设置'}</span>
            </div>
            <div>
              <span className="label">新路径</span>
              <span className="value">{preview.toInstallPath}</span>
            </div>
          </div>
          <div className="path-change-stats">
            <div>
              <span className="stat-value">{preview.migratedCount}</span>
              <span className="stat-label">Skills</span>
            </div>
            <div>
              <span className="stat-value">{preview.relinkedCount}</span>
              <span className="stat-label">Agent 链接</span>
            </div>
          </div>
          <div className="notice">
            确认后会复制当前统一路径下的 Skills 到新路径，并把已托管的 Agent 软链接指向新路径。旧路径中的文件会保留。
          </div>
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn ghost" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? '迁移中...' : '确认迁移'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPathChangeDialog;
