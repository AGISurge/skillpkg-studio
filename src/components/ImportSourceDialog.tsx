import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import type {
  ImportSkillCandidate,
  ImportSkillSourceKind,
  ImportSkillStatus,
} from '../AppContext';
import { Button } from './ui/button';

type ImportSourceDialogProps = {
  open: boolean;
  kind: ImportSkillSourceKind | null;
  status: ImportSkillStatus;
  value: string;
  candidates: ImportSkillCandidate[];
  selectedCandidateIds: Set<string>;
  onChangeValue: (value: string) => void;
  onToggleCandidate: (id: string) => void;
  onSelectAllCandidates: (selected: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
};

const sourceMeta: Record<Exclude<ImportSkillSourceKind, 'zip'>, {
  title: string;
  placeholder: string;
}> = {
  git: {
    title: 'Git 仓库地址',
    placeholder: 'https://github.com/owner/repo.git',
  },
};

const busyStatuses: ImportSkillStatus[] = ['resolving', 'downloading', 'scanning'];

const ImportSourceDialog = ({
  open,
  kind,
  status,
  value,
  candidates,
  selectedCandidateIds,
  onChangeValue,
  onToggleCandidate,
  onSelectAllCandidates,
  onConfirm,
  onClose,
}: ImportSourceDialogProps) => {
  if (!open || !kind) return null;

  const busy = busyStatuses.includes(status);
  const selectingCandidate = candidates.length > 0;
  const selectedCount = selectedCandidateIds.size;
  const allSelected = selectingCandidate && selectedCount === candidates.length;
  const meta = kind === 'zip'
    ? {
        title: '选择 Skill',
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
              {selectingCandidate && `检测到 ${candidates.length} 个 Skill，默认全部导入`}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>

        <div className="dialog-body">
          {selectingCandidate ? (
            <>
              <div className="import-candidate-toolbar">
                <span>{selectedCount} / {candidates.length} 已选</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onSelectAllCandidates(!allSelected)}
                  disabled={busy}
                >
                  {allSelected ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="import-candidate-list">
                {candidates.map((candidate) => {
                  const selected = selectedCandidateIds.has(candidate.id);
                  return (
                    <label
                      key={candidate.id}
                      className={`dialog-option ${selected ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleCandidate(candidate.id)}
                        disabled={busy}
                      />
                      <span>
                        <span className="option-title import-candidate-title">
                          {candidate.name}
                          {candidate.idConflict ? <span className="status-pill warning">ID 已存在</span> : null}
                          {candidate.nameConflict ? <span className="status-pill">同名已存在</span> : null}
                        </span>
                        <span className="option-subtitle">
                          {candidate.skillId}
                          {candidate.relativePath ? ` · ${candidate.relativePath}` : ''}
                          {candidate.version ? ` · v${candidate.version}` : ''}
                        </span>
                        <span className="option-subtitle">{candidate.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <label className="dialog-option import-url-field">
              <input
                type="url"
                value={value}
                onChange={(event) => onChangeValue(event.target.value)}
                placeholder={meta.placeholder}
                className="settings-input focus:outline-none focus:ring-0 focus-visible:ring-0"
                disabled={busy}
                autoFocus
              />
            </label>
          )}
        </div>

        <div className="dialog-footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            type="button"
            className="btn primary"
            onClick={onConfirm}
            disabled={busy || (selectingCandidate ? selectedCount === 0 : !value.trim())}
          >
            {busy ? <span className="mini-spinner" aria-hidden="true" /> : <CheckmarkCircleRegular className="icon" />}
            {selectingCandidate ? '导入已选 Skill' : '开始导入'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImportSourceDialog;
