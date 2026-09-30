import { Tooltip } from 'radix-ui';
import type { Agent } from '../types/models';
import { Button } from './ui/button';

type InstallAgentSelectorProps = {
  agents: Agent[];
  selectedAgents: Set<string>;
  submitting: boolean;
  onToggleAgent: (id: string) => void;
  onInvertSelection: () => void;
};

const InstallAgentSelector = ({
  agents,
  selectedAgents,
  submitting,
  onToggleAgent,
  onInvertSelection,
}: InstallAgentSelectorProps) => (
  <div className="install-agent-selector">
    <div className="install-agent-toolbar">
      <span>已选 {agents.filter((agent) => selectedAgents.has(agent.id)).length} / {agents.length}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onInvertSelection} disabled={submitting || !agents.length}>
        反选
      </Button>
    </div>
    <Tooltip.Provider delayDuration={250}>
      <div className="install-agent-grid">
        {agents.map((agent) => (
          <Tooltip.Root key={agent.id}>
            <Tooltip.Trigger asChild>
              <label className="dialog-option install-agent-option">
                <input
                  type="checkbox"
                  checked={selectedAgents.has(agent.id)}
                  onChange={() => onToggleAgent(agent.id)}
                  disabled={submitting}
                />
                <span className="option-title">{agent.name}</span>
              </label>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="install-agent-path-popover" sideOffset={6}>
                {agent.skillPath ? `技能目录: ${agent.skillPath}` : (
                  <>
                    <div>Mac: {agent.pathMac}</div>
                    <div>Linux: {agent.pathLinux || agent.pathMac}</div>
                    <div>Windows: {agent.pathWindows}</div>
                  </>
                )}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
    </Tooltip.Provider>
    {!agents.length ? <div className="notice">未检测到可安装的 Agent。</div> : null}
  </div>
);

export default InstallAgentSelector;
