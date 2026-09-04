import { FolderOpenRegular } from '@fluentui/react-icons';
import { Button } from './ui/button';

type OpenDirectoryButtonProps = {
  disabled?: boolean;
  onClick: () => void;
};

const OpenDirectoryButton = ({ disabled = false, onClick }: OpenDirectoryButtonProps) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="rounded-full"
    disabled={disabled}
    aria-label="打开目录"
    title="打开目录"
    onClick={onClick}
  >
    <FolderOpenRegular className="icon" />
    打开目录
  </Button>
);

export default OpenDirectoryButton;
