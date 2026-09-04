import { DismissCircleRegular } from "@fluentui/react-icons";
import type { AppUpdateState } from "../types/global";
import { Button } from "@/components/ui/button";

type UpdateReadyDialogProps = {
  open: boolean;
  state: AppUpdateState | null;
  onInstallNow: () => void;
  onLater: () => void;
};

const getDisplayVersion = (version: string | null | undefined) => {
  if (!version) return "";
  return version.startsWith("v") ? version : `v${version}`;
};

const UpdateReadyDialog = ({
  open,
  state,
  onInstallNow,
  onLater,
}: UpdateReadyDialogProps) => {
  if (!open || !state) return null;

  const version = getDisplayVersion(state.version);

  return (
    <div className="dialog-backdrop">
      <div className="dialog update-ready-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-title">更新应用</div>
            <div className="dialog-subtitle">
              {version
                ? `SkillPKG Studio ${version} 已准备好安装`
                : "SkillPKG Studio 新版本已准备好安装"}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onLater}>
            <DismissCircleRegular className="icon" />
          </button>
        </div>
        <div className="dialog-body">
          <div className="text-sm  mb-6">
            关闭应用后会立即安装更新。也可以暂不关闭，更新会在之后退出应用时安装，并在下次启动生效。
          </div>
        </div>
        <div className="dialog-footer">
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full bg-secondary px-4"
            onClick={onLater}
          >
            稍后，下次启动更新
          </Button>
          <Button
            className="rounded-full px-4"
            size="sm"
            onClick={onInstallNow}
          >
            关闭并更新
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UpdateReadyDialog;
