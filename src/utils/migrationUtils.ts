import type { AgentSkillsResult } from '../types/models';

export type MigrationSkillEntry = {
  id: string;
  name: string;
  description: string;
  agents: Array<{ id: string; name: string }>;
};

/**
 * 将每个 Agent 的技能列表合并为去重后的技能列表。
 * @param results - 按 Agent 分组的技能列表。
 * @returns 去重且按名称排序的技能列表（包含来源 Agent）。
 */
export const mergeAgentSkills = (results: AgentSkillsResult[]): MigrationSkillEntry[] => {
  const map = new Map<string, MigrationSkillEntry>();
  results.forEach((result) => {
    result.skills.forEach((skill) => {
      const existing = map.get(skill.id);
      const agentRef = { id: result.agentId, name: result.agentName };
      if (existing) {
        if (!existing.agents.some((agent) => agent.id === agentRef.id)) {
          existing.agents.push(agentRef);
        }
      } else {
        map.set(skill.id, {
          id: skill.id,
          name: skill.name || skill.id,
          description: skill.description || '',
          agents: [agentRef],
        });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};
