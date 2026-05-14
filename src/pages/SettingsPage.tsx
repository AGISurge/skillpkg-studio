import { useState } from "react";
import type { ComponentType } from "react";
import {
  DesktopRegular,
  EyeOffRegular,
  EyeRegular,
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

const themeOptions: Array<{
  value: ThemeMode;
  title: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { value: "dark", title: "深色", icon: WeatherMoonRegular },
  { value: "light", title: "浅色", icon: WeatherSunnyRegular },
  { value: "system", title: "跟随系统", icon: DesktopRegular },
];

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
            className="px-2 focus:outline-none focus:ring-0 focus-visible:ring-0"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="输入 API Key"
            autoComplete="off"
          />
          <InputGroupAddon align="inline-end">
            <Button
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
            <p>本机 skills 的存放路径。</p>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={handleSelectInstallPath}
          >
            <FolderRegular className="icon" />
            选择文件夹
          </button>
        </div>
        <div className="settings-path-row">
          <span>{installPath || "正在读取默认路径"}</span>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
