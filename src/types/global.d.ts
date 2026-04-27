import type { Skill } from './models';

declare global {
  interface Window {
    /**
     * 预加载脚本暴露的本地能力桥接。
     */
    skillpkg?: {
      /**
       * 获取默认统一安装路径。
       */
      getDefaultInstallPath: () => Promise<string>;
      /**
       * 选择统一安装路径。
       */
      selectInstallPath: () => Promise<string | null>;
      /**
       * 从指定路径加载技能列表。
       */
      loadSkills: (installPath: string) => Promise<Skill[]>;
      /**
       * 安装技能到统一路径并为所选 Agent 建立链接。
       */
      installSkill: (payload: {
        installPath: string;
        skill: Skill;
        agents: Array<{ id: string; name: string; pathMac: string; pathWindows: string }>;
        overwrite?: boolean;
      }) => Promise<{ ok: boolean; reason?: string }>;
      /**
       * 打开指定技能的本地路径。
       */
      openSkillPath: (payload: { installPath: string; skillId: string }) => Promise<boolean>;
      /**
       * 检测指定 Agent 是否已安装。
       */
      detectAgents: (
        names: string | readonly string[]
      ) => Promise<{ name: string; installed: boolean }[]>;
      /**
       * 扫描各 Agent 下的技能列表。
       */
      loadAgentSkills: (
        agents: Array<{ id: string; name: string; pathMac: string; pathWindows: string }>
      ) => Promise<Array<{ agentId: string; agentName: string; skills: Skill[] }>>;
      /**
       * 将技能从 Agent 目录迁移到统一路径。
       */
      migrateSkills: (payload: {
        installPath: string;
        items: Array<{
          agentId: string;
          skillId: string;
          pathMac: string;
          pathWindows: string;
        }>;
      }) => Promise<Array<{ agentId: string; skillId: string; ok: boolean; reason?: string }>>;
      /**
       * 保存技能文件内容。
       */
      saveSkillFile: (payload: {
        installPath: string;
        skillId: string;
        filePath: string;
        content: string;
      }) => Promise<boolean>;
    };
  }
}

export {};
