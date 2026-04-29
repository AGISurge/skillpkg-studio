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
import type { Agent, Skill, SkillFile } from './types/models';
import { validateSkill } from './utils/skillUtils';
import { AGENT_CATALOG, AGENT_TOOL_IDS } from './config/agents';
import type { AgentId } from './config/agents';
import { DISCOVER_MOCK_PATH } from './config/discover';
import type { AgentSkillsResult } from './utils/migrationUtils';

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
  editing: boolean;
  fileDrafts: Record<string, string>;
  theme: ThemeMode;
  refreshingAgents: boolean;
  agentSkillCounts: Record<string, number>;
  installedByAgent: Record<string, Set<string>>;
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
  handleInstallToggle: (skillId: string) => void;
  handleFileSelect: (path: string) => void;
  updateDraft: (value: string) => void;
  handleSaveFile: () => Promise<void>;
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
  const [editing, setEditing] = useState(false);
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [refreshingAgents, setRefreshingAgents] = useState(false);
  const [agentSkillCounts, setAgentSkillCounts] = useState<
    Record<string, number>
  >({});

  const [installedByAgent, setInstalledByAgent] = useState<
    Record<string, Set<string>>
  >(() => ({
    claude: new Set(),
    codex: new Set(),
    cursor: new Set(),
  }));

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

  /**
   * 检查指定的 Agent 工具 ID 列表
   */
  const checkInstalledAgents = useCallback(
    async (names: string | readonly string[]) => {
      const list = Array.isArray(names) ? [...names] : [names];
      if (!window?.skillpkg?.detectAgents) return [];
      const results = await window.skillpkg.detectAgents(list);
      return results
        .filter((result) => result.installed)
        .map((result) => result.name);
    },
    [],
  );

  const resolveInstalledAgents = useCallback(async (): Promise<Agent[]> => {
    // 检查当前环境中安装了哪些agent
    const installedIds = await checkInstalledAgents(AGENT_TOOL_IDS);
    return installedIds
      .filter((agentId): agentId is AgentId =>
        AGENT_TOOL_IDS.includes(agentId as AgentId),
      )
      .map((agentId) => AGENT_CATALOG[agentId]);
  }, [checkInstalledAgents]);

  const syncInstalledByAgent = useCallback(async (agentList: Agent[]) => {
    if (!window?.skillpkg?.loadAgentSkills) return;
    // 读取每个 Agent 已安装的技能 ID 列表，并更新状态。SkillPkg 主进程会根据实际情况返回数据，可能包含部分或全部 Agent 的安装信息。
    const results = (await window.skillpkg.loadAgentSkills(
      agentList,
    )) as AgentSkillsResult[];
    setInstalledByAgent((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      agentList.forEach((agent) => {
        next[agent.id] = new Set();
      });
      results.forEach((result) => {
        next[result.agentId] = new Set(result.skills.map((skill) => skill.id));
      });
      return next;
    });
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
      if (
        nextAgents.length &&
        !nextAgents.some((agent) => agent.id === selectedAgentId)
      ) {
        setSelectedAgentId(nextAgents[0].id);
      }
      await syncInstalledByAgent(nextAgents);
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
  }, [resolveInstalledAgents, selectedAgentId, syncInstalledByAgent]);

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
    console.log('skills ========>>>>>>>>>', skills);
    setDiscoverSkills(skills);
    if (
      skills[0] &&
      !skills.some((skill) => skill.id === selectedDiscoverSkillId)
    ) {
      setSelectedDiscoverSkillId(skills[0].id);
      setSelectedFilePath(skills[0].files[0]?.path || '');
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
    let active = true;
    const loadAgents = async () => {
      const nextAgents = await resolveInstalledAgents();
      if (!active) return;
      setAgents(nextAgents);
      if (
        nextAgents.length &&
        !nextAgents.some((agent) => agent.id === selectedAgentId)
      ) {
        setSelectedAgentId(nextAgents[0].id);
      }
      await syncInstalledByAgent(nextAgents);
    };
    loadAgents();
    return () => {
      active = false;
    };
  }, [resolveInstalledAgents, selectedAgentId, syncInstalledByAgent]);

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
  useEffect(() => {
    window?.skillpkg?.getAgentSkillCounts().then(setAgentSkillCounts);
  }, []);

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
    await loadLocalSkills(installPath);
    setInstalledByAgent((prev) => {
      const next = { ...prev };
      dialogAgents.forEach((agentId) => {
        const current = new Set(next[agentId] || []);
        current.add(dialogSkill.id);
        next[agentId] = current;
      });
      return next;
    });
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
      author: 'Local Import',
      tags: ['imported'],
      files: [
        {
          path: 'README.md',
          content: `# ${file.name.replace(/\.zip$/i, '')}\n\n这是从 zip 导入的 skill。`,
        },
      ],
    };
    openInstallDialog(importedSkill);
    event.target.value = '';
  };

  const handleInstallToggle = (skillId: string) => {
    setInstalledByAgent((prev) => {
      const next = { ...prev };
      const current = new Set(next[selectedAgentId] || []);
      if (current.has(skillId)) {
        current.delete(skillId);
        setNotice('已卸载当前 Agent 的 Skill。');
      } else {
        current.add(skillId);
        setNotice('已安装到当前 Agent。');
      }
      next[selectedAgentId] = current;
      return next;
    });
  };

  const handleFileSelect = (path: string) => {
    setSelectedFilePath(path);
    setEditing(false);
  };

  const updateDraft = (value: string) => {
    if (!selectedSkill || !selectedFile) return;
    const key = `${selectedSkill.id}::${selectedFile.path}`;
    setFileDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveFile = async () => {
    if (!selectedSkill || !selectedFile) return;
    const key = `${selectedSkill.id}::${selectedFile.path}`;
    const draft = fileDrafts[key];
    if (draft === undefined) return;
    if (!installPath || !window?.skillpkg?.saveSkillFile) {
      setNotice('请先设置统一路径。');
      return;
    }
    await window.skillpkg.saveSkillFile({
      installPath,
      skillId: selectedSkill.id,
      filePath: selectedFile.path,
      content: draft,
    });
    setLocalSkills((prev) =>
      prev.map((skill) => {
        if (skill.id !== selectedSkill.id) return skill;
        return {
          ...skill,
          files: skill.files.map((file) =>
            file.path === selectedFile.path
              ? { ...file, content: draft }
              : file,
          ),
        };
      }),
    );
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
    editing,
    fileDrafts,
    theme,
    refreshingAgents,
    agentSkillCounts,
    installedByAgent,
    fileInputRef,
    setTheme,
    setApiKey,
    setAgentsExpanded,
    setSelectedAgentId,
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
    handleFileSelect,
    updateDraft,
    handleSaveFile,
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
