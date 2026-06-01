import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
} from "@fluentui/react-icons";
import Sidebar from "./Sidebar";
import { menuRoutes, routePaths } from "../routes";
import { useAppContext, useToolbarContent } from "../AppContext";

const SIDEBAR_FLOATING_WIDTH = 900;

const getActiveSection = (path: string) => {
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/favorites")) return "favorites";
  if (path.startsWith("/local")) return "local";
  if (path.startsWith("/settings")) return "settings";
  return "discover";
};

const getDefaultSkillFilePath = (files: Array<{ path: string }>) =>
  files.find((file) => file.path === "SKILL.md")?.path || files[0]?.path || "";

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    agents,
    selectedAgentId,
    agentSkillCounts,
    installedByAgent,
    agentsExpanded,
    setAgentsExpanded,
    agentSkillsByAgent,
    notice,
    refreshingAgents,
    appUpdateState,
    refreshAgents,
    downloadAppUpdate,
    setSelectedAgentId,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
  } = useAppContext();

  const toolbarContent = useToolbarContent();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarFloating, setSidebarFloating] = useState(false);

  const isDarwinWindow = window.skillpkg?.platform === "darwin";
  const activeSection = getActiveSection(location.pathname);
  const isDiscoverDetail = /^\/discover\/[^/]+/.test(location.pathname);
  const isLocalOrganize = location.pathname === routePaths.localOrganize;
  const backTarget = isDiscoverDetail ? routePaths.discover : isLocalOrganize ? routePaths.local : '';
  const backLabel = isDiscoverDetail ? '返回发现列表' : '返回本机';
  const visibleNotice =
    notice && (notice.scope === "global" || notice.scope === activeSection)
      ? notice
      : null;
  const handleBack = useCallback(() => {
    if (!backTarget) return;
    if (isDiscoverDetail) {
      navigate(backTarget, { state: { fromDiscoverDetail: true } });
      return;
    }
    navigate(backTarget);
  }, [backTarget, isDiscoverDetail, navigate]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      const agentSkills = agentSkillsByAgent[agentId] || [];
      const firstSkill = agentSkills[0];
      if (firstSkill) {
        setSelectedLibrarySkillId(firstSkill.id);
        setSelectedFilePath(getDefaultSkillFilePath(firstSkill.files));
      }
      navigate(`/agents/${agentId}`);
    },
    [
      agentSkillsByAgent,
      navigate,
      setSelectedAgentId,
      setSelectedFilePath,
      setSelectedLibrarySkillId,
    ],
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia(
      `(max-width: ${SIDEBAR_FLOATING_WIDTH}px)`,
    );
    const syncSidebarMode = (matches: boolean) => {
      setSidebarFloating(matches);
      setSidebarOpen((current) => (matches ? false : current));
    };
    syncSidebarMode(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) =>
      syncSidebarMode(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <div
      className={`app-shell ${isDarwinWindow ? "app-shell-darwin" : ""} ${sidebarOpen ? "" : "sidebar-collapsed"} ${sidebarFloating ? "sidebar-floating-mode" : ""}`}
    >
      {isDarwinWindow ? <div className="window-drag-strip" aria-hidden="true" /> : null}
      {sidebarOpen ? (
        <>
          {sidebarFloating ? (
            <button
              type="button"
              className="sidebar-scrim"
              aria-label="关闭侧栏"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}
          <Sidebar
            routes={menuRoutes}
            activeSection={activeSection}
            agentsExpanded={agentsExpanded}
            onToggleAgents={() => setAgentsExpanded((prev) => !prev)}
            agents={agents}
            selectedAgentId={selectedAgentId}
            installedByAgent={installedByAgent}
            agentSkillCounts={agentSkillCounts}
            onSelectAgent={handleSelectAgent}
            onRefreshAgents={refreshAgents}
            refreshingAgents={refreshingAgents}
            appUpdateState={appUpdateState}
            onDownloadAppUpdate={downloadAppUpdate}
            isFloating={sidebarFloating}
          />
        </>
      ) : null}

      <main className="content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-icon-button"
              aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"}
              title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              {sidebarOpen ? (
                <PanelLeftContractRegular className="size-5" />
              ) : (
                <PanelLeftExpandRegular className="size-5" />
              )}
            </button>
            {backTarget ? (
              <button
                type="button"
                className="topbar-icon-button"
                aria-label={backLabel}
                title={backLabel}
                onClick={handleBack}
              >
                <ArrowLeftRegular className="size-4" />
              </button>
            ) : null}
          </div>
          {toolbarContent ? (
            <div className="topbar-right actions">{toolbarContent}</div>
          ) : null}
        </header>

        {visibleNotice ? (
          visibleNotice.action ? (
            <button
              type="button"
              className="notice page-notice notice-action"
              key={visibleNotice.id}
              onClick={() => {
                navigate(visibleNotice.action?.path || routePaths.localOrganize);
              }}
            >
              <span>{visibleNotice.text}</span>
              <span className="notice-action-label">{visibleNotice.action.label || '查看'}</span>
            </button>
          ) : (
            <div className="notice page-notice" key={visibleNotice.id}>
              {visibleNotice.text}
            </div>
          )
        ) : null}
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
