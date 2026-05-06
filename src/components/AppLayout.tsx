import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
} from "@fluentui/react-icons";
import Sidebar from "./Sidebar";
import { menuRoutes } from "../routes";
import { useAppContext, useToolbarContent } from "../AppContext";

const SIDEBAR_FLOATING_WIDTH = 900;

const getActiveSection = (path: string) => {
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/favorites")) return "favorites";
  if (path.startsWith("/local")) return "local";
  if (path.startsWith("/settings")) return "settings";
  return "discover";
};

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
    localSkills,
    notice,
    installPath,
    refreshingAgents,
    refreshAgents,
    setSelectedAgentId,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
  } = useAppContext();

  const toolbarContent = useToolbarContent();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarFloating, setSidebarFloating] = useState(false);

  const activeSection = getActiveSection(location.pathname);
  const isSettingsPage = activeSection === "settings";
  const currentRoute = menuRoutes.find((item) => item.id === activeSection);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    const installed = installedByAgent[agentId] || new Set();
    const agentSkills = localSkills.filter((skill) => installed.has(skill.id));
    if (agentSkills[0]) {
      setSelectedLibrarySkillId(agentSkills[0].id);
      setSelectedFilePath(agentSkills[0].files[0]?.path || "");
    }
    navigate(`/agents/${agentId}`);
  };

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
      className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"} ${sidebarFloating ? "sidebar-floating-mode" : ""}`}
    >
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
            isFloating={sidebarFloating}
          />
        </>
      ) : null}

      <main className="content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="opacity-50 hover:opacity-100 transition-opacity rounded focus-visible:ring focus-visible:ring-primary"
              aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"}
              title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              {sidebarOpen ? (
                <PanelLeftContractRegular className="icon" />
              ) : (
                <PanelLeftExpandRegular className="icon" />
              )}
            </button>
            <div className="page-title">{currentRoute?.label}</div>
          </div>
          {toolbarContent ? (
            <div className="topbar-right actions">{toolbarContent}</div>
          ) : null}
        </header>

        {notice ? <div className="notice">{notice}</div> : null}
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
