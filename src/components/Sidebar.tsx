import { NavLink } from 'react-router-dom';
import {
  PanelLeftContractRegular,
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
  isFloating?: boolean;
  onCollapse: () => void;
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
  isFloating = false,
  onCollapse,
}: SidebarProps) => {
  return (
    <aside className={`sidebar ${isFloating ? 'floating' : ''}`}>
      <div className="sidebar-head">
        <div className="flex justify-start gap-2 items-center">
          <img src="/logo.png" className="size-8" alt="SkillPKG Logo"/>
          <div>
            <div className="font-bold font-sans-serif">SkillPKG Studio</div>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label="收起侧栏"
          title="收起侧栏"
          onClick={onCollapse}
        >
          <PanelLeftContractRegular className="icon" />
        </button>
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
      <div className='flex-grow'/>
      <div className='flex justify-between items-center'>
          <div>&nbsp;</div>
          <NavLink
            to="/settings"
            className=""
            aria-label="设置"
          >
            <SettingsRegular className="icon" />
          </NavLink>
        </div>
    </aside>
  );
};

export default Sidebar;
