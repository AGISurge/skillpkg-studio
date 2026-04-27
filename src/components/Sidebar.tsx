import { NavLink } from 'react-router-dom';
import {
  ChevronDownRegular,
  ChevronRightRegular,
  SettingsRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import type { Agent } from '../types/models';
import type { RouteConfig } from '../routes';

/**
 * 侧边栏参数。
 */
type SidebarProps = {
  routes: RouteConfig[];
  activeSection: string;
  agentsExpanded: boolean;
  onToggleAgents: () => void;
  agents: Agent[];
  selectedAgentId: string;
  installedByAgent: Record<string, Set<string>>;
  onSelectAgent: (id: string) => void;
  onRefreshAgents: () => void;
  refreshingAgents: boolean;
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
  installedByAgent,
  onSelectAgent,
  onRefreshAgents,
  refreshingAgents,
}: SidebarProps) => {
  return (
    <aside className="sidebar">
      <div className="flex justify-start gap-2 items-center">
        <img src="/logo.png" className="size-8" alt="SkillPKG Logo"/>
        <div>
          <div className="font-bold font-sans-serif">SkillPKG Studio</div>
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
                    isActive || (activeSection === 'agents' && selectedAgentId === agent.id)
                      ? 'active'
                      : ''
                  }`
                }
                onClick={() => onSelectAgent(agent.id)}
              >
                <span className="dot" />
                <span>{agent.name}</span>
                <span className="count">{installedByAgent[agent.id]?.size || 0}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="settings-area">
          <NavLink
            to="/settings"
            className={({ isActive }: { isActive: boolean }) =>
              `menu-item settings-item ${isActive ? 'active' : ''}`
            }
            aria-label="设置"
          >
            <SettingsRegular className="icon" />
          </NavLink>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
