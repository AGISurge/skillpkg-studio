import type { AgentDetectionResult, AgentSkillsResult, Skill } from './models';

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
        agents: Array<{
          id: string;
          name: string;
          pathMac: string;
          pathWindows: string;
        }>;
        overwrite?: boolean;
      }) => Promise<{ ok: boolean; reason?: string }>;
      /**
       * 打开指定技能的本地路径。
       */
      openSkillPath: (payload: {
        installPath: string;
        skillId: string;
      }) => Promise<boolean>;
      /**
       * 检测指定 Agent 是否已安装。
       */
      detectAgents: (
        names: string | readonly string[],
      ) => Promise<AgentDetectionResult[]>;
      /**
       * 扫描各 Agent 下的技能列表。
       */
      loadAgentSkills: (payload: {
        agents: Array<{
          id: string;
          name: string;
          pathMac: string;
          pathWindows: string;
        }>;
        installPath?: string;
      }) => Promise<AgentSkillsResult[]>;
      /**
       * 删除指定 Agent 下的 SkillPKG 托管软链接。
       */
      uninstallAgentSkill: (payload: {
        agentId: string;
        skillId: string;
        installPath?: string;
      }) => Promise<{ ok: boolean; reason?: string; removed?: boolean }>;
      /**
       * 将指定 Agent 下的托管软链接替换为本地副本。
       */
      unhostAgentSkill: (payload: {
        agentId: string;
        skillId: string;
        installPath?: string;
      }) => Promise<{ ok: boolean; reason?: string; removed?: boolean }>;
      /**
       * 将技能从 Agent 目录迁移到统一路径。
       */
      migrateSkills: (payload: {
        installPath: string;
        overwrite?: boolean;
        useExisting?: boolean;
        items: Array<{
          agentId: string;
          skillId: string;
          pathMac: string;
          pathWindows: string;
          rootPath?: string;
        }>;
      }) => Promise<
        Array<{
          agentId: string;
          skillId: string;
          ok: boolean;
          reason?: string;
        }>
      >;
      /**
       * 保存技能文件内容。
       */
      saveSkillFile: (payload: {
        installPath: string;
        skillId: string;
        filePath: string;
        content: string;
        rootPath?: string;
      }) => Promise<boolean>;
      /**
       * 按需读取技能文件内容。
       */
      loadSkillFile: (payload: {
        rootPath: string;
        filePath: string;
      }) => Promise<{ ok: boolean; content?: string; reason?: string }>;
      /**
       * 获取已安装技能记录。
       */
      loadSkillInstallRecords: (filters?: {
        skillId?: string;
        agentId?: string;
      }) => Promise<
        Array<{
          id: number;
          skillId: string;
          agentId: string;
          version: string | null;
          description: string | null;
        }>
      >;
      /**
       * 获取 SQLite 数据库状态。
       */
      getDbInfo: () => Promise<{
        path: string;
        ok: boolean;
        error: string | null;
      }>;

      /**
       * 获取每个 Agent 已安装技能数量统计。
       */
      getAgentSkillCounts: (payload?: {
        agents?: Array<{
          id: string;
          name: string;
          pathMac: string;
          pathWindows: string;
        }>;
        installPath?: string;
      }) => Promise<Record<string, number>>;
    };
  }
}

export {};
