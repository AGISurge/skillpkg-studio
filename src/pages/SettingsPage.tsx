import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  ArrowUploadRegular,
  DesktopRegular,
  EyeOffRegular,
  EyeRegular,
  FolderOpenRegular,
  FolderRegular,
  KeyRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../components/ui/input-group";
import { useAppContext } from "../AppContext";
import { Button } from "@/components/ui/button";

type ThemeMode = "system" | "light" | "dark";
type DbInfo = {
  path: string;
  ok: boolean;
  error: string | null;
  exists?: boolean;
  size?: number;
};

const themeOptions: Array<{
  value: ThemeMode;
  title: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { value: "dark", title: "深色", icon: WeatherMoonRegular },
  { value: "light", title: "浅色", icon: WeatherSunnyRegular },
  { value: "system", title: "跟随系统", icon: DesktopRegular },
];

const formatBytes = (value?: number) => {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const getDisplayVersion = (version?: string | null) => {
  if (!version) return "";
  return version.startsWith("v") ? version : `v${version}`;
};

const SettingsPage = () => {
  const {
    theme,
    apiKey,
    installPath,
    appUpdateState,
    setTheme,
    setApiKey,
    handleSelectInstallPath,
    checkAppUpdate,
    downloadAppUpdate,
    installAppUpdateNow,
  } = useAppContext();
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [dbStatus, setDbStatus] = useState("");
  const [dbActionPending, setDbActionPending] = useState(false);

  const refreshDbInfo = useCallback(async () => {
    const info = await window.skillpkg?.getDbInfo?.();
    if (info) setDbInfo(info);
  }, []);

  useEffect(() => {
    refreshDbInfo();
  }, [refreshDbInfo]);

  const handleOpenDbLocation = async () => {
    setDbStatus("");
    const result = await window.skillpkg?.openDbLocation?.();
    if (!result?.ok) {
      setDbStatus("数据库位置打开失败。");
    }
  };

  const handleBackupDb = async () => {
    setDbActionPending(true);
    setDbStatus("");
    try {
      const result = await window.skillpkg?.backupDb?.();
      if (result?.canceled) return;
      setDbStatus(result?.ok ? "数据库备份已保存。" : "数据库备份失败。");
    } finally {
      setDbActionPending(false);
    }
  };

  const handleRestoreDb = async () => {
    const confirmed = window.confirm("恢复会覆盖当前数据库。继续前请确认已经备份。");
    if (!confirmed) return;
    setDbActionPending(true);
    setDbStatus("");
    try {
      const result = await window.skillpkg?.restoreDb?.();
      if (result?.canceled) return;
      if (result?.ok) {
        setDbStatus("数据库已恢复。");
        await refreshDbInfo();
      } else {
        setDbStatus(result?.reason === "invalid-database"
          ? "恢复失败：文件不是有效的 SQLite 数据库。"
          : "数据库恢复失败。");
      }
    } finally {
      setDbActionPending(false);
    }
  };

  const updateBridgeAvailable = Boolean(window.skillpkg?.checkAppUpdate);
  const updateStatus = appUpdateState?.status;
  const updatePending = updateStatus === "checking" || updateStatus === "downloading";
  const updateDisabled = !updateBridgeAvailable || !appUpdateState?.enabled || updatePending;
  const currentVersion = getDisplayVersion(appUpdateState?.currentVersion);
  const availableVersion = getDisplayVersion(appUpdateState?.version);

  const getUpdateButtonLabel = () => {
    if (!updateBridgeAvailable || appUpdateState?.enabled === false) {
      return "当前环境不支持更新";
    }
    if (!appUpdateState) return "正在读取版本";
    if (updateStatus === "checking") return "正在检测";
    if (updateStatus === "available") return "下载更新";
    if (updateStatus === "downloading") {
      const percent = Math.round(appUpdateState.percent || 0);
      return percent > 0 ? `下载中 ${percent}%` : "下载中";
    }
    if (updateStatus === "downloaded") {
      return `${availableVersion || "新版本"}已就绪，重启更新`;
    }
    if (updateStatus === "error") return "重新检测";
    return "检测新版本";
  };

  const getUpdateStatusMessage = () => {
    if (updateStatus === "not-available") return "当前已是最新版本。";
    if (updateStatus === "error") return "更新检测失败，请稍后重试。";
    if (updateStatus === "available" && appUpdateState?.error) {
      return "更新下载失败，请稍后重试。";
    }
    if (updateStatus === "available" && availableVersion) {
      return `发现新版本 ${availableVersion}。`;
    }
    if (updateStatus === "downloaded") {
      return "新版本已下载完成，可立即重启安装。";
    }
    return "";
  };

  const handleAppUpdate = async () => {
    if (updateStatus === "available") {
      await downloadAppUpdate("manual");
      return;
    }
    if (updateStatus === "downloaded") {
      await installAppUpdateNow();
      return;
    }
    await checkAppUpdate();
  };

  const updateStatusMessage = getUpdateStatusMessage();

  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2>Appearance</h2>
            <p>选择应用的显示外观。</p>
          </div>
        </div>
        <div
          className="theme-segment"
          role="radiogroup"
          aria-label="Appearance"
        >
          {themeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                type="button"
                key={option.value}
                className={`theme-choice ${theme === option.value ? "selected" : ""}`}
                onClick={() => setTheme(option.value)}
                role="radio"
                aria-checked={theme === option.value}
              >
                <Icon className="icon" />
                <span>{option.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2>SkillPKG API Key</h2>
            <p>用于访问 SkillPKG 服务。</p>
          </div>
        </div>
        <InputGroup className="settings-api-key-input">
          <InputGroupAddon>
            <KeyRegular className="icon" />
          </InputGroupAddon>
          <InputGroupInput
            type={apiKeyVisible ? "text" : "password"}
            value={apiKey}
            className="px-2 focus:outline-none focus:ring-0 focus-visible:ring-0 "
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="输入 API Key"
            autoComplete="off"
          />
          <InputGroupAddon align="inline-end">
            <Button
              variant="link"
              onClick={() => setApiKeyVisible((current) => !current)}
              aria-label={apiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
            >
             
              {apiKeyVisible ? (
                <EyeOffRegular className="icon" />
              ) : (
                <EyeRegular className="icon" />
              )}
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2>存放路径</h2>
            <p>本机 skills 的存放路径</p>
          </div>
          <Button
             size="xs"
            variant="outline"
            onClick={handleSelectInstallPath}
          >
            <FolderRegular className="icon" />
            选择文件夹
          </Button>
        </div>
        <div className="settings-path-row">
          <span>{installPath || "正在读取默认路径"}</span>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2>SQLite 数据库</h2>
            <div className="settings-db-meta">
              <span>
                <strong>状态</strong>
                {dbInfo?.ok ? "正常" : "不可用"}
              </span>
              <span>
                <strong>大小</strong>
                {dbInfo?.exists ? formatBytes(dbInfo.size) : "文件待创建"}
              </span>
            </div>
          </div>
          <div className="settings-db-actions">
            <Button
              variant="outline"
              size="xs"
              onClick={handleOpenDbLocation}
            >
              <FolderOpenRegular className="icon" />
              打开位置
            </Button>
            <Button
              variant="outline"
               size="xs"
              onClick={handleBackupDb}
              disabled={dbActionPending || !dbInfo?.ok}
            >
              <ArrowDownloadRegular className="icon" />
              备份
            </Button>
            <Button
             size="xs"
              variant="outline"
              onClick={handleRestoreDb}
              disabled={dbActionPending}
            >
              <ArrowUploadRegular className="icon" />
              恢复
            </Button>
          </div>
        </div>
        <div className="settings-path-row">
          <span>{dbInfo?.path || "正在读取数据库路径"}</span>
        </div>
        {dbInfo?.error && (
          <div className="settings-db-status error">{dbInfo.error}</div>
        )}
        {dbStatus && (
          <div className="settings-db-status">{dbStatus}</div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2>版本</h2>
            <p>当前版本 {currentVersion || "正在读取"}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className={updatePending ? "loading" : ""}
            disabled={updateDisabled}
            aria-busy={updatePending}
            onClick={() => {
              void handleAppUpdate();
            }}
          >
            {updatePending ? (
              <span className="mini-spinner" aria-hidden="true" />
            ) : updateStatus === "downloaded" ? (
              <ArrowClockwiseRegular className="icon" />
            ) : (
              <ArrowDownloadRegular className="icon" />
            )}
            {getUpdateButtonLabel()}
          </Button>
        </div>
        {updateStatusMessage && (
          <div
            className={`settings-update-status ${appUpdateState?.error ? "error" : ""}`}
            role={appUpdateState?.error ? "alert" : "status"}
          >
            {updateStatusMessage}
          </div>
        )}
      </section>
    </div>
  );
};

export default SettingsPage;
