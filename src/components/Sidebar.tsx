import { NavLink } from 'react-router-dom';
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons';
import type { Agent } from '../types/models';
import type { RouteConfig } from '../routes';

type SidebarProps = {
  routes: RouteConfig[];
  activeSection: string;
  agentsExpanded: boolean;
  onToggleAgents: () => void;
  agents: Agent[];
  selectedAgentId: string;
  installedByAgent: Record<string, Set<string>>;
  onSelectAgent: (id: string) => void;
};

const Sidebar = ({
  routes,
  activeSection,
  agentsExpanded,
  onToggleAgents,
  agents,
  selectedAgentId,
  installedByAgent,
  onSelectAgent,
}: SidebarProps) => {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">SP</div>
        <div>
          <div className="brand-title">SkillPkg Studio</div>
          <div className="brand-subtitle">Electron + React</div>
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
        <div className="status-card">
          <div className="status-title">本地技能库</div>
          <div className="status-row">
            <span>{agents.length} Agents</span>
          </div>
          <div className="status-row muted">统一路径已准备</div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
