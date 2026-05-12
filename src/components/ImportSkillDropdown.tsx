import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  ArrowImportRegular,
  BranchForkRegular,
  ChevronDownRegular,
  CloudRegular,
  FolderZipRegular,
  GlobeRegular,
} from '@fluentui/react-icons';
import type { ImportSkillSourceKind, ImportSkillStatus } from '../AppContext';

type ImportSourceOption = {
  id: ImportSkillSourceKind;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const IMPORT_SOURCE_OPTIONS: ImportSourceOption[] = [
  {
    id: 'zip',
    label: '本地 zip 文件',
    description: '选择本机 .zip 包',
    icon: FolderZipRegular,
  },
  {
    id: 'git',
    label: 'Git 仓库地址',
    description: '从远端仓库拉取',
    icon: BranchForkRegular,
  },
  {
    id: 'skillpkg',
    label: 'skillpkg.com URL',
    description: '需要 API Key',
    icon: CloudRegular,
  },
  {
    id: 'skills-sh',
    label: 'skills.sh URL',
    description: '解析 Installation',
    icon: GlobeRegular,
  },
];

type ImportSkillDropdownProps = {
  status: ImportSkillStatus;
  onSelect: (kind: ImportSkillSourceKind) => void;
};

const busyStatuses: ImportSkillStatus[] = ['picking', 'resolving', 'downloading', 'scanning'];

const statusLabel: Partial<Record<ImportSkillStatus, string>> = {
  picking: '选择中',
  resolving: '解析中',
  downloading: '拉取中',
  scanning: '扫描中',
  installing: '安装中',
};

const ImportSkillDropdown = ({ status, onSelect }: ImportSkillDropdownProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const busy = busyStatuses.includes(status);
  const label = statusLabel[status] || '导入 Skill';

  const options = useMemo(() => IMPORT_SOURCE_OPTIONS, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className="import-menu" ref={rootRef}>
      <button
        type="button"
        className={`btn ghost import-trigger ${busy ? 'loading' : ''}`}
        onClick={() => setOpen((current) => !current)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <span className="mini-spinner" aria-hidden="true" /> : <ArrowImportRegular className="icon" />}
        {label}
        <ChevronDownRegular className="icon" />
      </button>
      {open ? (
        <div className="import-menu-popover" role="menu">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                type="button"
                className="import-menu-item"
                key={option.id}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect(option.id);
                }}
              >
                <Icon className="icon" />
                <span>
                  <span className="import-menu-title">{option.label}</span>
                  <span className="import-menu-subtitle">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default ImportSkillDropdown;
