import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
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

const SettingsPage = () => {
  const {
    theme,
    apiKey,
    installPath,
    setTheme,
    setApiKey,
    handleSelectInstallPath,
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
    </div>
  );
};

export default SettingsPage;
