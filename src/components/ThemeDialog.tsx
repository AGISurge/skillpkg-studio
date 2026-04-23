import { DismissCircleRegular } from '@fluentui/react-icons';

/**
 * 主题模式枚举。
 */
type ThemeMode = 'system' | 'light' | 'dark';

/**
 * 主题弹窗参数。
 */
type ThemeDialogProps = {
  open: boolean;
  value: ThemeMode;
  onChange: (theme: ThemeMode) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 主题选择弹窗。
 */
const ThemeDialog = ({ open, value, onChange, onConfirm, onCancel }: ThemeDialogProps) => {
  if (!open) return null;

  const options: Array<{ value: ThemeMode; title: string; subtitle: string }> = [
    {
      value: 'system',
      title: '跟随系统',
      subtitle: '根据系统外观自动切换',
    },
    {
      value: 'light',
      title: '浅色',
      subtitle: '清爽明亮的外观',
    },
    {
      value: 'dark',
      title: '深色',
      subtitle: '低亮度、适合夜间',
    },
  ];

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">主题设置</div>
            <div className="dialog-subtitle">选择应用外观模式</div>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          {options.map((option) => (
            <label
              key={option.value}
              className={`dialog-option ${value === option.value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <div>
                <div className="option-title">{option.title}</div>
                <div className="option-subtitle">{option.subtitle}</div>
              </div>
            </label>
          ))}
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

export default ThemeDialog;
