import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import {Button} from '@/components/ui/button'
import type { Skill } from '../types/models';

type HostConflictDialogProps = {
  skill: Skill | null;
  onUseManaged: () => void;
  onOverwrite: () => void;
  onClose: () => void;
};

const HostConflictDialog = ({
  skill,
  onUseManaged,
  onOverwrite,
  onClose,
}: HostConflictDialogProps) => {
  if (!skill) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">同名 Skill 已托管</div>
            <div className="dialog-subtitle">{skill.name} 在托管文件夹中已存在</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <div className="notice">
            请选择使用当前已托管的 Skill，或用当前 Agent 中的 Skill 覆盖托管版本。默认建议使用已托管版本。
          </div>
        </div>
        <div className="dialog-footer mt-4">
          <Button type="button" size="sm" variant="ghost" className='rounded-full'  onClick={onOverwrite}>
            覆盖托管
          </Button>
          <Button type="button" size="sm" className='rounded-full'  onClick={onUseManaged}>
            <CheckmarkCircleRegular className="icon" />
            使用已托管
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HostConflictDialog;
