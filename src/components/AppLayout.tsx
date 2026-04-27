import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FolderOpenRegular, LinkRegular } from '@fluentui/react-icons';
import Sidebar from './Sidebar';
import { menuRoutes } from '../routes';
import { useAppContext } from '../AppContext';

const getActiveSection = (path: string) => {
  if (path.startsWith('/agents')) return 'agents';
  if (path.startsWith('/favorites')) return 'favorites';
  if (path.startsWith('/local')) return 'local';
  if (path.startsWith('/settings')) return 'settings';
  return 'discover';
};

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    agents,
    selectedAgentId,
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
    fileInputRef,
    handleImportZip,
    handleSelectInstallPath,
  } = useAppContext();

  const activeSection = getActiveSection(location.pathname);
  const isSettingsPage = activeSection === 'settings';
  const currentRoute = menuRoutes.find((item) => item.id === activeSection);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    const installed = installedByAgent[agentId] || new Set();
    const agentSkills = localSkills.filter((skill) => installed.has(skill.id));
    if (agentSkills[0]) {
      setSelectedLibrarySkillId(agentSkills[0].id);
      setSelectedFilePath(agentSkills[0].files[0]?.path || '');
    }
    navigate(`/agents/${agentId}`);
  };

  return (
    <div className="app-shell">
      <Sidebar
        routes={menuRoutes}
        activeSection={activeSection}
        agentsExpanded={agentsExpanded}
        onToggleAgents={() => setAgentsExpanded((prev) => !prev)}
        agents={agents}
        selectedAgentId={selectedAgentId}
        installedByAgent={installedByAgent}
        onSelectAgent={handleSelectAgent}
        onRefreshAgents={refreshAgents}
        refreshingAgents={refreshingAgents}
      />

      <main className="content">
        <header className="topbar">
          <div>
            <div className="page-title">{currentRoute?.label}</div>
            <div className="page-subtitle">SkillPkg 管理与分发中心</div>
          </div>
          {!isSettingsPage ? (
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => fileInputRef.current?.click()}>
                <FolderOpenRegular className="icon" />
                导入 Zip
              </button>
              <button type="button" className="btn primary" onClick={handleSelectInstallPath}>
                <LinkRegular className="icon" />
                统一路径
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleImportZip}
              />
            </div>
          ) : null}
        </header>

        {notice ? <div className="notice">{notice}</div> : null}
        {installPath && !isSettingsPage ? (
          <div className="path-info">
            <span className="label">统一路径</span>
            <span className="value">{installPath}</span>
          </div>
        ) : null}

        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
