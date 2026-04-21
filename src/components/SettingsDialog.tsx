import { DismissCircleRegular } from '@fluentui/react-icons';

type ThemeMode = 'system' | 'light' | 'dark';

type SettingsDialogProps = {
  open: boolean;
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => void;
  onClose: () => void;
};

const SettingsDialog = ({ open, theme, onChangeTheme, onClose }: SettingsDialogProps) => {
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
            <div className="dialog-title">设置</div>
            <div className="dialog-subtitle">外观与主题偏好</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          {options.map((option) => (
            <label
              key={option.value}
              className={`dialog-option ${theme === option.value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                checked={theme === option.value}
                onChange={() => onChangeTheme(option.value)}
              />
              <div>
                <div className="option-title">{option.title}</div>
                <div className="option-subtitle">{option.subtitle}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
