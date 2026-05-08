import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type {
  Agent,
  AgentDetectionResult,
  AgentSkillsResult,
  Skill,
  SkillFile,
} from './types/models';
import { getFilePolicy, validateSkill } from './utils/skillUtils';
import { AGENT_CATALOG, AGENT_TOOL_IDS } from './config/agents';
import type { AgentId } from './config/agents';
import { DISCOVER_MOCK_PATH } from './config/discover';

export type ThemeMode = 'system' | 'light' | 'dark';

// --- Toolbar context: pages register their own toolbar actions ---

const ToolbarContext = createContext<ReactNode>(null);

export const ToolbarProvider = ({ children }: { children: ReactNode }) => {
  const [toolbar, setToolbar] = useState<ReactNode>(null);
  return (
    <ToolbarContext.Provider value={toolbar}>
      <ToolbarSetterContext.Provider value={setToolbar}>
        {children}
      </ToolbarSetterContext.Provider>
    </ToolbarContext.Provider>
  );
};

const ToolbarSetterContext = createContext<
  React.Dispatch<React.SetStateAction<ReactNode>>
>(() => {});

export const useToolbar = (content: ReactNode) => {
  const setToolbar = useContext(ToolbarSetterContext);
  useEffect(() => {
    setToolbar(content);
    return () => setToolbar(null);
  }, [content, setToolbar]);
};

export const useToolbarContent = () => useContext(ToolbarContext);

const THEME_STORAGE_KEY = 'skillpkg.theme';

const getDefaultSkillFilePath = (skill: Skill): string =>
  skill.files.find((file) => file.path === 'SKILL.md')?.path ||
  skill.files[0]?.path ||
  '';

const getInitialTheme = (): ThemeMode => {
  const saved = window?.localStorage?.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
};

type AppContextValue = {
  agents: Agent[];
  discoverSkills: Skill[];
  localSkills: Skill[];
  favorites: Set<string>;
  selectedAgentId: string;
  selectedDiscoverSkillId: string;
  selectedLibrarySkillId: string;
  selectedFilePath: string;
  expandedFolders: Set<string>;
  agentsExpanded: boolean;
  apiKey: string;
  notice: string;
  installPath: string;
  dialogOpen: boolean;
  dialogSkill: Skill | null;
  dialogAgents: Set<string>;
  installConflict: boolean;
  hostingConflictSkill: Skill | null;
  editing: boolean;
  fileDrafts: Record<string, string>;
  theme: ThemeMode;
  refreshingAgents: boolean;
  agentSkillCounts: Record<string, number>;
  installedByAgent: Record<string, Set<string>>;
  agentSkillsByAgent: Record<string, Skill[]>;
  pendingSkillIds: Set<string>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setTheme: (theme: ThemeMode) => void;
  setApiKey: (apiKey: string) => void;
  setAgentsExpanded: (updater: (current: boolean) => boolean) => void;
  setSelectedAgentId: (agentId: string) => void;
  setSelectedDiscoverSkillId: (skillId: string) => void;
  setSelectedLibrarySkillId: (skillId: string) => void;
  setSelectedFilePath: (path: string) => void;
  setEditing: (updater: (current: boolean) => boolean) => void;
  toggleFavorite: (skillId: string) => void;
  openInstallDialog: (skill: Skill) => void;
  confirmInstall: (overwrite?: boolean) => Promise<void>;
  openSkillLocation: () => Promise<void>;
  handleImportZip: (event: ChangeEvent<HTMLInputElement>) => void;
  handleInstallToggle: (skill: Skill) => Promise<void>;
  resolveHostingConflict: (action: 'use-managed' | 'overwrite') => Promise<void>;
  cancelHostingConflict: () => void;
  handleFileSelect: (path: string) => void;
  loadSkillFileContent: (skill: Skill | null, filePath: string) => Promise<void>;
  updateDraft: (value: string) => void;
  handleSaveFile: (skill?: Skill | null, file?: SkillFile | null) => Promise<void>;
  handleCancelEdit: (skill?: Skill | null, file?: SkillFile | null) => void;
  handleSelectInstallPath: () => Promise<void>;
  handleToggleFolder: (path: string) => void;
  refreshAgents: () => Promise<void>;
  setDialogAgents: React.Dispatch<React.SetStateAction<Set<string>>>;
  setDialogOpen: (open: boolean) => void;
  setInstallConflict: (conflict: boolean) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [discoverSkills, setDiscoverSkills] = useState<Skill[]>([]);
  const [localSkills, setLocalSkills] = useState<Skill[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState('claude');
  const [selectedDiscoverSkillId, setSelectedDiscoverSkillId] = useState('');
  const [selectedLibrarySkillId, setSelectedLibrarySkillId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('README.md');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [notice, setNotice] = useState('');
  const [installPath, setInstallPath] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSkill, setDialogSkill] = useState<Skill | null>(null);
  const [dialogAgents, setDialogAgents] = useState<Set<string>>(new Set());
  const [installConflict, setInstallConflict] = useState(false);
  const [hostingConflictSkill, setHostingConflictSkill] = useState<Skill | null>(null);
  const [editing, setEditing] = useState(false);
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [refreshingAgents, setRefreshingAgents] = useState(false);
  const [agentSkillCounts, setAgentSkillCounts] = useState<
    Record<string, number>
  >({});
  const [agentSkillsByAgent, setAgentSkillsByAgent] = useState<
    Record<string, Skill[]>
  >({});
  const [pendingSkillIds, setPendingSkillIds] = useState<Set<string>>(new Set());

  const [installedByAgent, setInstalledByAgent] = useState<
    Record<string, Set<string>>
  >(() => ({
    claude: new Set(),
    codex: new Set(),
    cursor: new Set(),
  }));

  const selectAgentId = useCallback((agentId: string) => {
    setSelectedAgentId((current) => (current === agentId ? current : agentId));
  }, []);

  const selectedSkill = useMemo(() => {
    const skills = [...discoverSkills, ...localSkills];
    return (
      skills.find((skill) => skill.id === selectedLibrarySkillId) ||
      skills.find((skill) => skill.id === selectedDiscoverSkillId) ||
      null
    );
  }, [
    discoverSkills,
    localSkills,
    selectedDiscoverSkillId,
    selectedLibrarySkillId,
  ]);

  const selectedFile = useMemo<SkillFile | null>(() => {
    if (!selectedSkill) return null;
    return (
      selectedSkill.files.find((file) => file.path === selectedFilePath) ||
      selectedSkill.files[0] ||
      null
    );
  }, [selectedFilePath, selectedSkill]);

  const resolveInstalledAgents = useCallback(async (): Promise<Agent[]> => {
    if (!window?.skillpkg?.detectAgents) return [];
    const results = (await window.skillpkg.detectAgents(
      AGENT_TOOL_IDS,
    )) as AgentDetectionResult[];
    return results
      .filter((result) => result.installed)
      .filter((result): result is AgentDetectionResult & { id: AgentId } =>
        AGENT_TOOL_IDS.includes(result.id as AgentId),
      )
      .map((result) => ({
        ...AGENT_CATALOG[result.id],
        installed: result.installed,
        reason: result.reason,
        skillPath: result.skillPath,
      }));
  }, []);

  const syncInstalledByAgent = useCallback(async (agentList: Agent[], path: string) => {
    if (!window?.skillpkg?.loadAgentSkills) return;
    const results = (await window.skillpkg.loadAgentSkills(
      { agents: agentList, installPath: path },
    )) as AgentSkillsResult[];
    setInstalledByAgent((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      agentList.forEach((agent) => {
        next[agent.id] = new Set();
      });
      results.forEach((result) => {
        next[result.agentId] = new Set(
          result.skills
            .filter((skill) => skill.managed)
            .map((skill) => skill.id),
        );
      });
      return next;
    });
    setAgentSkillsByAgent((prev) => {
      const next: Record<string, Skill[]> = { ...prev };
      agentList.forEach((agent) => {
        next[agent.id] = [];
      });
      results.forEach((result) => {
        next[result.agentId] = result.skills;
      });
      return next;
    });
    setAgentSkillCounts(
      results.reduce<Record<string, number>>((acc, result) => {
        acc[result.agentId] = result.skills.length;
        return acc;
      }, {}),
    );
  }, []);

  const refreshAgents = useCallback(async () => {
    setRefreshingAgents(true);
    const start = Date.now();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    try {
      const nextAgents = await resolveInstalledAgents();
      setAgents(nextAgents);
      setSelectedAgentId((current) => (
        nextAgents.length && !nextAgents.some((agent) => agent.id === current)
          ? nextAgents[0].id
          : current
      ));
      await syncInstalledByAgent(nextAgents, installPath);
    } finally {
      const elapsed = Date.now() - start;
      const minDuration = 400;
      if (elapsed < minDuration) {
        await new Promise((resolve) =>
          setTimeout(resolve, minDuration - elapsed),
        );
      }
      setRefreshingAgents(false);
    }
  }, [installPath, resolveInstalledAgents, syncInstalledByAgent]);

  const loadLocalSkills = useCallback(async (path: string) => {
    if (!path) return;
    if (!window?.skillpkg?.loadSkills) {
      setNotice('当前环境不支持读取本地路径。');
      return;
    }
    const skills = await window.skillpkg.loadSkills(path);
    setLocalSkills(skills);
  }, []);

  const loadDiscoverSkills = useCallback(async () => {
    if (!window?.skillpkg?.loadSkills) {
      setNotice('当前环境不支持读取发现页数据。');
      return;
    }
    const skills = await window.skillpkg.loadSkills(DISCOVER_MOCK_PATH);
    setDiscoverSkills(skills);
    if (
      skills[0] &&
      !skills.some((skill) => skill.id === selectedDiscoverSkillId)
    ) {
      setSelectedDiscoverSkillId(skills[0].id);
      setSelectedFilePath(getDefaultSkillFilePath(skills[0]));
    }
  }, [selectedDiscoverSkillId]);

  useEffect(() => {
    let active = true;
    const loadInitialPath = async () => {
      const savedPath = window?.localStorage?.getItem('skillpkg.installPath');
      if (savedPath) {
        setInstallPath(savedPath);
        return;
      }
      const defaultPath = await window?.skillpkg?.getDefaultInstallPath?.();
      if (active && defaultPath) {
        setInstallPath(defaultPath);
      }
    };
    loadInitialPath();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    loadDiscoverSkills();
  }, [loadDiscoverSkills]);

  useEffect(() => {
    if (!installPath) return;
    let active = true;
    const loadAgents = async () => {
      const nextAgents = await resolveInstalledAgents();
      if (!active) return;
      setAgents(nextAgents);
      setSelectedAgentId((current) => (
        nextAgents.length && !nextAgents.some((agent) => agent.id === current)
          ? nextAgents[0].id
          : current
      ));
      await syncInstalledByAgent(nextAgents, installPath);
    };
    loadAgents();
    return () => {
      active = false;
    };
  }, [installPath, resolveInstalledAgents, syncInstalledByAgent]);

  useEffect(() => {
    if (!document?.body) return;
    document.body.dataset.theme = theme;
    window?.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (installPath) {
      window?.localStorage?.setItem('skillpkg.installPath', installPath);
      loadLocalSkills(installPath);
    }
  }, [installPath, loadLocalSkills]);
  const toggleFavorite = (skillId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const openInstallDialog = (skill: Skill) => {
    if (!validateSkill(skill)) {
      setNotice('Skill 校验失败：缺少必要字段或文件。');
      return;
    }
    setDialogAgents(new Set(agents.map((agent) => agent.id)));
    setDialogSkill(skill);
    setInstallConflict(false);
    setDialogOpen(true);
  };

  const confirmInstall = async (overwrite = false) => {
    if (!dialogSkill) return;
    if (!installPath) {
      setNotice('请先设置统一路径。');
      return;
    }
    if (!window?.skillpkg?.installSkill) {
      setNotice('当前环境不支持安装 Skill。');
      return;
    }
    if (!dialogAgents.size) {
      setNotice('请至少选择一个 Agent。');
      return;
    }
    const selectedAgents = agents.filter((agent) => dialogAgents.has(agent.id));
    const result = await window.skillpkg.installSkill({
      installPath,
      skill: dialogSkill,
      agents: selectedAgents,
      overwrite,
    });
    if (!result.ok && result.reason === 'exists') {
      setInstallConflict(true);
      return;
    }
    if (!result.ok && result.reason === 'agent-skill-conflict') {
      setNotice('目标 Agent 已存在同名自有 Skill，未覆盖。');
      return;
    }
    if (!result.ok) {
      setNotice('安装失败，请检查 Agent 技能目录权限。');
      return;
    }
    await loadLocalSkills(installPath);
    await syncInstalledByAgent(selectedAgents, installPath);
    setNotice(`已为 ${dialogAgents.size} 个 Agent 安装 ${dialogSkill.name}。`);
    setDialogOpen(false);
  };

  const openSkillLocation = async () => {
    if (!dialogSkill || !installPath) {
      setNotice('请先设置统一路径。');
      return;
    }
    if (!window?.skillpkg?.openSkillPath) {
      setNotice('当前环境不支持打开路径。');
      return;
    }
    const ok = await window.skillpkg.openSkillPath({
      installPath,
      skillId: dialogSkill.id,
    });
    if (!ok) {
      setNotice('未找到该 Skill 的本地路径。');
    }
  };

  const handleImportZip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = file.name
      .replace(/\.zip$/i, '')
      .toLowerCase()
      .replace(/\s+/g, '-');
    const importedSkill: Skill = {
      id,
      name: file.name.replace(/\.zip$/i, ''),
      version: '0.1.0',
      description: '导入的 SkillPkg，等待完善描述。',
      author: '',
      tags: ['imported'],
      files: [
        {
          path: 'SKILL.md',
          content: `---\nname: ${file.name.replace(/\.zip$/i, '')}\ndescription: 这是从 zip 导入的 skill。\nversion: 0.1.0\n---\n\n# ${file.name.replace(/\.zip$/i, '')}\n\n这是从 zip 导入的 skill。`,
        },
      ],
    };
    openInstallDialog(importedSkill);
    event.target.value = '';
  };

  const hostAgentSkill = async (
    skill: Skill,
    options: { overwrite?: boolean; useExisting?: boolean } = {},
  ) => {
    if (skill.managed) return;
    if (!installPath) {
      setNotice('请先设置统一路径。');
      return;
    }
    if (!window?.skillpkg?.migrateSkills) {
      setNotice('当前环境不支持托管 Agent Skill。');
      return;
    }
    const targetAgentId = skill.agentId || selectedAgentId;
    const targetAgent = agents.find((agent) => agent.id === targetAgentId);
    if (!targetAgent) {
      setNotice('未找到当前 Agent 配置。');
      return;
    }
    setPendingSkillIds((prev) => new Set(prev).add(skill.id));
    try {
      const [result] = await window.skillpkg.migrateSkills({
        installPath,
        overwrite: Boolean(options.overwrite),
        useExisting: Boolean(options.useExisting),
        items: [
          {
            agentId: targetAgent.id,
            skillId: skill.id,
            pathMac: targetAgent.pathMac,
            pathWindows: targetAgent.pathWindows,
            rootPath: skill.rootPath,
          },
        ],
      });
      if (!result?.ok && result?.reason === 'exists') {
        setHostingConflictSkill(skill);
        return;
      }
      if (!result?.ok) {
        setNotice('托管失败，请检查 Agent 技能目录和统一路径权限。');
        return;
      }
      setHostingConflictSkill(null);
      await loadLocalSkills(installPath);
      await syncInstalledByAgent(agents, installPath);
      setNotice(options.useExisting ? '已改用当前托管 Skill。' : '已托管当前 Skill。');
    } finally {
      setPendingSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const handleInstallToggle = async (skill: Skill) => {
    if (skill.managed) {
      await unhostAgentSkill(skill);
      return;
    }
    await hostAgentSkill(skill);
  };

  const unhostAgentSkill = async (skill: Skill) => {
    if (!installPath) {
      setNotice('请先设置统一路径。');
      return;
    }
    if (!window?.skillpkg?.unhostAgentSkill) {
      setNotice('当前环境不支持取消托管。');
      return;
    }
    const targetAgentId = skill.agentId || selectedAgentId;
    setPendingSkillIds((prev) => new Set(prev).add(skill.id));
    try {
      const result = await window.skillpkg.unhostAgentSkill({
        agentId: targetAgentId,
        skillId: skill.id,
        installPath,
      });
      if (!result.ok) {
        setNotice('取消托管失败：该 Skill 不是有效的托管链接。');
        return;
      }
      await syncInstalledByAgent(agents, installPath);
      setNotice('已取消托管，并复制到当前 Agent 的 Skill 目录。');
    } finally {
      setPendingSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const resolveHostingConflict = async (action: 'use-managed' | 'overwrite') => {
    if (!hostingConflictSkill) return;
    await hostAgentSkill(hostingConflictSkill, {
      overwrite: action === 'overwrite',
      useExisting: action === 'use-managed',
    });
  };

  const cancelHostingConflict = () => {
    setHostingConflictSkill(null);
  };

  const handleFileSelect = (path: string) => {
    setSelectedFilePath(path);
    setEditing(false);
  };

  const loadSkillFileContent = useCallback(async (skill: Skill | null, filePath: string) => {
    if (!skill?.rootPath || !filePath || !window?.skillpkg?.loadSkillFile) return;
    const currentFile = skill.files.find((file) => file.path === filePath);
    if (!currentFile || currentFile.contentLoaded !== false) return;
    const result = await window.skillpkg.loadSkillFile({
      rootPath: skill.rootPath,
      filePath,
    });
    const updateSkill = (target: Skill) => {
      if (target.id !== skill.id || target.rootPath !== skill.rootPath) return target;
      return {
        ...target,
        files: target.files.map((file) =>
          file.path === filePath
            ? {
                ...file,
                content: result.ok ? result.content || '' : '',
                contentLoaded: true,
                size: result.size ?? file.size,
                kind: result.kind ?? file.kind,
                mimeType: result.mimeType ?? file.mimeType,
                loadReason: result.ok ? null : result.reason || 'read-failed',
              }
            : file,
        ),
      };
    };
    if (skill.agentId) {
      setAgentSkillsByAgent((prev) => ({
        ...prev,
        [skill.agentId as string]: (prev[skill.agentId as string] || []).map(updateSkill),
      }));
      return;
    }
    setLocalSkills((prev) => prev.map(updateSkill));
    setDiscoverSkills((prev) => prev.map(updateSkill));
    if (!result.ok) {
      setNotice('此文件无法加载预览。');
    }
  }, []);

  const updateDraft = (value: string) => {
    if (!selectedLibrarySkillId || !selectedFilePath) return;
    const key = `${selectedLibrarySkillId}::${selectedFilePath}`;
    setFileDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancelEdit = (
    targetSkill: Skill | null = selectedSkill,
    targetFile: SkillFile | null = selectedFile,
  ) => {
    if (!targetSkill || !targetFile) {
      setEditing(false);
      return;
    }
    const key = `${targetSkill.id}::${targetFile.path}`;
    const draft = fileDrafts[key];
    const hasChanges = draft !== undefined && draft !== targetFile.content;
    if (hasChanges && !window.confirm('当前文件有未保存修改，确定要取消编辑吗？')) {
      return;
    }
    setFileDrafts((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditing(false);
  };

  const handleSaveFile = async (
    targetSkill: Skill | null = selectedSkill,
    targetFile: SkillFile | null = selectedFile,
  ) => {
    if (!targetSkill || !targetFile) return;
    const key = `${targetSkill.id}::${targetFile.path}`;
    const draft = fileDrafts[key];
    if (draft === undefined) return;
    const draftFile = {
      ...targetFile,
      content: draft,
      size: new Blob([draft]).size,
    };
    if (!getFilePolicy(draftFile).canEdit) {
      setNotice('此文件类型或大小不支持编辑。');
      return;
    }
    if (!installPath || !window?.skillpkg?.saveSkillFile) {
      setNotice('请先设置统一路径。');
      return;
    }
    const saved = await window.skillpkg.saveSkillFile({
      installPath,
      skillId: targetSkill.id,
      filePath: targetFile.path,
      content: draft,
      rootPath: targetSkill.rootPath,
    });
    if (!saved) {
      setNotice('保存失败：此文件类型或大小不支持编辑。');
      return;
    }
    setLocalSkills((prev) =>
      prev.map((skill) => {
        if (skill.id !== targetSkill.id) return skill;
        return {
          ...skill,
          files: skill.files.map((file) =>
            file.path === targetFile.path
              ? {
                  ...file,
                  content: draft,
                  contentLoaded: true,
                  size: new Blob([draft]).size,
                  kind: 'text',
                  loadReason: null,
                }
              : file,
          ),
        };
      }),
    );
    if (targetSkill.agentId) {
      setAgentSkillsByAgent((prev) => ({
        ...prev,
        [targetSkill.agentId as string]: (prev[targetSkill.agentId as string] || []).map((skill) => {
          if (skill.id !== targetSkill.id) return skill;
          return {
            ...skill,
            files: skill.files.map((file) =>
              file.path === targetFile.path
                ? {
                    ...file,
                    content: draft,
                    contentLoaded: true,
                    size: new Blob([draft]).size,
                    kind: 'text',
                    loadReason: null,
                  }
                : file,
            ),
          };
        }),
      }));
    }
    setFileDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNotice('已保存修改。');
    setEditing(false);
  };

  const handleSelectInstallPath = async () => {
    try {
      if (!window?.skillpkg?.selectInstallPath) {
        setNotice('当前环境不支持选择本地路径。');
        return;
      }
      const selectedPath = await window.skillpkg.selectInstallPath();
      if (selectedPath) {
        setInstallPath(selectedPath);
        setNotice('已更新统一路径。');
      }
    } catch (error) {
      setNotice('选择路径失败，请重试。');
    }
  };

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const value: AppContextValue = {
    agents,
    discoverSkills,
    localSkills,
    favorites,
    selectedAgentId,
    selectedDiscoverSkillId,
    selectedLibrarySkillId,
    selectedFilePath,
    expandedFolders,
    agentsExpanded,
    apiKey,
    notice,
    installPath,
    dialogOpen,
    dialogSkill,
    dialogAgents,
    installConflict,
    hostingConflictSkill,
    editing,
    fileDrafts,
    theme,
    refreshingAgents,
    agentSkillCounts,
    installedByAgent,
    agentSkillsByAgent,
    pendingSkillIds,
    fileInputRef,
    setTheme,
    setApiKey,
    setAgentsExpanded,
    setSelectedAgentId: selectAgentId,
    setSelectedDiscoverSkillId,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    openInstallDialog,
    confirmInstall,
    openSkillLocation,
    handleImportZip,
    handleInstallToggle,
    resolveHostingConflict,
    cancelHostingConflict,
    handleFileSelect,
    loadSkillFileContent,
    updateDraft,
    handleSaveFile,
    handleCancelEdit,
    handleSelectInstallPath,
    handleToggleFolder,
    refreshAgents,
    setDialogAgents,
    setDialogOpen,
    setInstallConflict,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};
