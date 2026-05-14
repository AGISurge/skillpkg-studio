import { CheckmarkCircleRegular, DismissCircleRegular, KeyRegular } from '@fluentui/react-icons';
import type {
  ImportSkillCandidate,
  ImportSkillSourceKind,
  ImportSkillStatus,
} from '../AppContext';

type ImportSourceDialogProps = {
  open: boolean;
  kind: ImportSkillSourceKind | null;
  status: ImportSkillStatus;
  value: string;
  candidates: ImportSkillCandidate[];
  selectedCandidateId: string;
  apiKeyRequired: boolean;
  onChangeValue: (value: string) => void;
  onSelectCandidate: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

const sourceMeta: Record<Exclude<ImportSkillSourceKind, 'zip'>, {
  title: string;
  subtitle: string;
  placeholder: string;
}> = {
  git: {
    title: 'Git 仓库地址',
    subtitle: '从仓库中扫描包含 SKILL.md 的目录',
    placeholder: 'https://github.com/owner/repo.git',
  },
  skillpkg: {
    title: 'skillpkg.com URL',
    subtitle: '通过 SkillPkg 服务解析 Skill',
    placeholder: 'https://skillpkg.com/packages/...',
  },
};

const busyStatuses: ImportSkillStatus[] = ['resolving', 'downloading', 'scanning'];

const ImportSourceDialog = ({
  open,
  kind,
  status,
  value,
  candidates,
  selectedCandidateId,
  apiKeyRequired,
  onChangeValue,
  onSelectCandidate,
  onConfirm,
  onClose,
}: ImportSourceDialogProps) => {
  if (!open || !kind) return null;

  const busy = busyStatuses.includes(status);
  const selectingCandidate = candidates.length > 0;
  const meta = kind === 'zip'
    ? {
        title: '选择 Skill',
        subtitle: '请选择本次要导入的 Skill',
        placeholder: '',
      }
    : sourceMeta[kind];

  return (
    <div className="dialog-backdrop">
      <div className="dialog import-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">{selectingCandidate ? '选择 Skill' : meta.title}</div>
            <div className="dialog-subtitle">
              {selectingCandidate ? '检测到多个 Skill，本次只能导入一个' : meta.subtitle}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>

        <div className="dialog-body">
          {apiKeyRequired ? (
            <div className="notice import-api-key-notice">
              <KeyRegular className="icon" />
              请先在设置页配置 SkillPKG API Key，再导入 skillpkg.com URL。
            </div>
          ) : selectingCandidate ? (
            <div className="import-candidate-list">
              {candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className={`dialog-option ${selectedCandidateId === candidate.id ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="import-candidate"
                    checked={selectedCandidateId === candidate.id}
                    onChange={() => onSelectCandidate(candidate.id)}
                    disabled={busy}
                  />
                  <span>
                    <span className="option-title">{candidate.name}</span>
                    <span className="option-subtitle">
                      {candidate.skillId}
                      {candidate.relativePath ? ` · ${candidate.relativePath}` : ''}
                    </span>
                    <span className="option-subtitle">{candidate.description}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <label className="dialog-option import-url-field">
              <input
                type="url"
                value={value}
                onChange={(event) => onChangeValue(event.target.value)}
                placeholder={meta.placeholder}
                className="settings-input"
                disabled={busy}
                autoFocus
              />
            </label>
          )}
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          {!apiKeyRequired ? (
            <button
              type="button"
              className="btn primary"
              onClick={onConfirm}
              disabled={busy || (selectingCandidate ? !selectedCandidateId : !value.trim())}
            >
              {busy ? <span className="mini-spinner" aria-hidden="true" /> : <CheckmarkCircleRegular className="icon" />}
              {selectingCandidate ? '导入所选 Skill' : '开始导入'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ImportSourceDialog;
