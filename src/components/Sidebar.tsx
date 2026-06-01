import { NavLink } from 'react-router-dom';
import {
  ArrowDownloadRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  SettingsRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import type { Agent } from '../types/models';
import type { RouteConfig } from '../routes';
import type { AppUpdateState } from '../types/global';

/**
 * 侧边栏参数。
 */
type SidebarProps = {
  routes: RouteConfig[];
  activeSection: string;
  agentsExpanded: boolean;
  onToggleAgents: () => void;
  agents: Agent[];
  agentSkillCounts: Record<string, number>;
  selectedAgentId: string;
  installedByAgent: Record<string, Set<string>>;
  onSelectAgent: (id: string) => void;
  onRefreshAgents: () => void;
  refreshingAgents: boolean;
  appUpdateState: AppUpdateState | null;
  onDownloadAppUpdate: () => void;
  isFloating?: boolean;
};

const getDisplayVersion = (version: string | null | undefined) => {
  if (!version) return '';
  return version.startsWith('v') ? version : `v${version}`;
};

const getUpdateButtonLabel = (state: AppUpdateState) => {
  const version = getDisplayVersion(state.version);
  if (state.status === 'downloading') {
    const percent = Math.round(state.percent || 0);
    return percent > 0 ? `下载中 ${percent}%` : '下载中';
  }
  if (state.status === 'downloaded') {
    return version ? `已下载 ${version}` : '已下载';
  }
  return version ? `更新 ${version}` : '更新';
};

/**
 * 左侧导航与设置区域。
 */
const Sidebar = ({
  routes,
  activeSection,
  agentsExpanded,
  onToggleAgents,
  agents,
  selectedAgentId,
  agentSkillCounts,
  installedByAgent,
  onSelectAgent,
  onRefreshAgents,
  refreshingAgents,
  appUpdateState,
  onDownloadAppUpdate,
  isFloating = false,
}: SidebarProps) => {
  const showUpdateButton =
    appUpdateState?.status === 'available' ||
    appUpdateState?.status === 'downloading' ||
    appUpdateState?.status === 'downloaded';
  const updateButtonDisabled =
    appUpdateState?.status === 'downloading' ||
    appUpdateState?.status === 'downloaded';

  return (
    <aside className={`sidebar ${isFloating ? 'floating' : ''}`}>
      <div className="sidebar-head">
        <div className="flex justify-start gap-2 items-center">
          <img src="/logo.png" className="size-8" alt="SkillPKG Logo" />
          <div>
            <div className="font-bold font-sans-serif">SkillPKG Studio</div>
          </div>
        </div>
      </div>
      <nav className="menu">
        {routes
          .filter((route) => route.showInMenu && !route.isAgentsRoot)
          .map((route) => {
            const Icon = route.icon;
            return (
              <NavLink
                to={route.path}
                key={route.id}
                className={({ isActive }: { isActive: boolean }) =>
                  `menu-item ${isActive ? 'active' : ''}`
                }
              >
                <Icon className="icon" />
                <span>{route.label}</span>
              </NavLink>
            );
          })}
        {routes
          .filter((route) => route.isAgentsRoot)
          .map((route) => {
            const Icon = route.icon;
            return (
              <button
                type="button"
                key={route.id}
                className={`menu-item ${activeSection === 'agents' ? 'active' : ''}`}
                onClick={onToggleAgents}
              >
                {agentsExpanded ? (
                  <ChevronDownRegular className="icon" />
                ) : (
                  <ChevronRightRegular className="icon" />
                )}
                <Icon className="icon" />
                <span>{route.label}</span>
                <span
                  className="menu-refresh"
                  role="button"
                  tabIndex={0}
                  aria-label="刷新 Agents"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRefreshAgents();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onRefreshAgents();
                    }
                  }}
                >
                  <ArrowClockwiseRegular
                    className={`icon ${refreshingAgents ? 'spin' : ''}`}
                  />
                </span>
              </button>
            );
          })}
        {agentsExpanded && (
          <div className="submenu">
            {agents.map((agent) => (
              <NavLink
                to={`/agents/${agent.id}`}
                key={agent.id}
                className={({ isActive }: { isActive: boolean }) =>
                  `menu-subitem ${
                    isActive ||
                    (activeSection === 'agents' && selectedAgentId === agent.id)
                      ? 'active'
                      : ''
                  }`
                }
                onClick={() => onSelectAgent(agent.id)}
              >
                <span className="dot" />
                <span>{agent.name}</span>
                <span className="count">{agentSkillCounts[agent.id] || 0}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>
      <div className="grow" />
      <div className="sidebar-footer">
        {showUpdateButton && appUpdateState ? (
          <button
            type="button"
            className="sidebar-update-button"
            aria-label={getUpdateButtonLabel(appUpdateState)}
            title={getUpdateButtonLabel(appUpdateState)}
            onClick={onDownloadAppUpdate}
            disabled={updateButtonDisabled}
          >
            <ArrowDownloadRegular className="icon" />
            <span>{getUpdateButtonLabel(appUpdateState)}</span>
          </button>
        ) : (
          <div />
        )}
        <NavLink to="/settings" className="sidebar-settings-link" aria-label="设置">
          <SettingsRegular className="icon" />
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
