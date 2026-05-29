import type {
  AgentDetectionResult,
  AgentSkillsResult,
  Skill,
  SkillpkgCategory,
  SkillpkgSkillDetail,
  SkillpkgListMeta,
  SkillpkgSkillSummary,
} from './models';

declare global {
  interface Window {
    /**
     * 预加载脚本暴露的本地能力桥接。
     */
    skillpkg?: {
      /**
       * Electron 主进程平台标识。
       */
      platform?: NodeJS.Platform;
      /**
       * 获取默认统一安装路径。
       */
      getDefaultInstallPath: () => Promise<string>;
      /**
       * 选择统一安装路径。
       */
      selectInstallPath: () => Promise<string | null>;
      /**
       * 选择用于导入的 zip 文件。
       */
      selectImportZip: () => Promise<string | null>;
      /**
       * 从外部来源导入 Skill 到统一库。
       */
      importSkillSource: (payload: {
        kind: 'zip' | 'git' | 'session';
        installPath?: string;
        zipPath?: string;
        url?: string;
        sessionId?: string;
        candidateId?: string;
        candidateIds?: string[];
      }) => Promise<{
        ok: boolean;
        reason?: string;
        sessionId?: string;
        reused?: boolean;
        reusedSkillIds?: string[];
        failedCandidates?: Array<{
          candidateId: string;
          skillId?: string;
          reason: string;
        }>;
        candidates?: Array<{
          id: string;
          skillId: string;
          name: string;
          description: string;
          version: string;
          relativePath: string;
          idConflict?: boolean;
          nameConflict?: boolean;
          existingSkillId?: string | null;
        }>;
        skill?: Skill | null;
        skills?: Skill[];
      }>;
      /**
       * 扫描导入目录中的候选 Skill。
       */
      scanImportCandidates: (payload: {
        rootPath: string;
        preferredId?: string;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        candidates: Array<{
          id: string;
          skillId: string;
          name: string;
          description: string;
          version: string;
          relativePath: string;
          idConflict?: boolean;
          nameConflict?: boolean;
          existingSkillId?: string | null;
        }>;
      }>;
      /**
       * 获取 SkillPkg 远程分类列表。
       */
      listSkillpkgCategories: (payload: {
        apiKey: string;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        status?: number;
        categories?: SkillpkgCategory[];
      }>;
      /**
       * 获取 SkillPkg 远程 Skill 列表。
       */
      listSkillpkgSkills: (payload: {
        apiKey: string;
        categoryPublicIds?: string[];
        q?: string;
        isFeatured?: boolean;
        page?: number;
        pageSize?: number;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        status?: number;
        docs?: SkillpkgSkillSummary[];
        meta?: SkillpkgListMeta;
      }>;
      /**
       * 获取 SkillPkg 远程 Skill 详情。
       */
      getSkillpkgSkillDetail: (payload: {
        apiKey: string;
        publicId: string;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        status?: number;
        detail?: SkillpkgSkillDetail | null;
      }>;
      /**
       * 从 SkillPkg 云端下载并导入 Skill 到统一库。
       */
      downloadSkillpkgSkill: (payload: {
        apiKey: string;
        publicId: string;
        installPath: string;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        status?: number;
        sessionId?: string;
        candidates?: Array<{
          id: string;
          skillId: string;
          name: string;
          description: string;
          version: string;
          relativePath: string;
          idConflict?: boolean;
          nameConflict?: boolean;
          existingSkillId?: string | null;
        }>;
        skill?: Skill | null;
        skills?: Skill[];
      }>;
      /**
       * 使用系统默认浏览器打开第三方链接。
       */
      openExternalUrl: (url: string) => Promise<{
        ok: boolean;
        reason?: string;
      }>;
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
          pathLinux?: string;
          pathWindows: string;
        }>;
        overwrite?: boolean;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        results?: Array<{
          agentId?: string;
          ok: boolean;
          reason?: string;
        }>;
      }>;
      /**
       * 将统一库中已有的多个 Skill 批量安装到 Agents。
       */
      installLibrarySkills: (payload: {
        installPath: string;
        skillIds: string[];
        agents: Array<{
          id: string;
          name: string;
          pathMac: string;
          pathLinux?: string;
          pathWindows: string;
        }>;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        results: Array<{
          skillId: string;
          agentId?: string;
          ok: boolean;
          reason?: string;
        }>;
      }>;
      /**
       * 打开指定技能的本地路径。
       */
      openSkillPath: (payload: {
        installPath?: string;
        skillId?: string;
        rootPath?: string;
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
          pathLinux?: string;
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
       * 删除指定 Agent 下的 Skill 条目。
       */
      deleteAgentSkill: (payload: {
        agentId: string;
        skillId: string;
      }) => Promise<{ ok: boolean; reason?: string; removed?: boolean }>;
      /**
       * 删除统一库中的 Skill，并卸载指定 Agents 下的托管链接。
       */
      deleteLibrarySkill: (payload: {
        installPath: string;
        skillId: string;
        agents: Array<{
          id: string;
          name: string;
          pathMac: string;
          pathLinux?: string;
          pathWindows: string;
        }>;
      }) => Promise<{
        ok: boolean;
        reason?: string;
        removed?: boolean;
        results?: Array<{
          agentId?: string;
          ok: boolean;
          reason?: string;
          removed?: boolean;
        }>;
      }>;
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
          pathLinux?: string;
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
      }) => Promise<{
        ok: boolean;
        content?: string;
        reason?: string;
        size?: number;
        kind?: 'text' | 'image' | 'binary';
        mimeType?: string;
      }>;
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
       * 读取收藏的技能 ID。
       */
      loadFavoriteSkillIds: () => Promise<string[]>;
      /**
       * 用当前收藏列表覆盖 SQLite 中的收藏记录。
       */
      replaceFavoriteSkillIds: (
        skillIds: string[],
      ) => Promise<{ ok: boolean; reason?: string }>;
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
          pathLinux?: string;
          pathWindows: string;
        }>;
        installPath?: string;
      }) => Promise<Record<string, number>>;
    };
  }
}

export {};
