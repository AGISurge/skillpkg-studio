import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { ReactNode } from 'react';
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

export type ThemeMode = 'system' | 'light' | 'dark';
export type ImportSkillSourceKind = 'zip' | 'git';
export type ImportSkillStatus =
  | 'idle'
  | 'picking'
  | 'resolving'
  | 'downloading'
  | 'scanning'
  | 'ready'
  | 'installing'
  | 'error';

export type ImportSkillCandidate = {
  id: string;
  skillId: string;
  name: string;
  description: string;
  version: string;
  relativePath: string;
  idConflict?: boolean;
  nameConflict?: boolean;
  existingSkillId?: string | null;
};

export type NoticeScope = 'discover' | 'local' | 'favorites' | 'agents' | 'settings' | 'global';

export type PageNotice = {
  id: number;
  text: string;
  scope: NoticeScope;
};

export type SkillDeleteAction = 'agent-uninstall' | 'agent-delete' | 'library-delete';

export type SkillDeleteDialogState = {
  action: SkillDeleteAction;
  skill: Skill;
  agentId?: string;
  agentName?: string;
  hostedAgentNames?: string[];
};

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
  }, [content, setToolbar]);

  useEffect(() => () => setToolbar(null), [setToolbar]);
};

export const useToolbarContent = () => useContext(ToolbarContext);

const THEME_STORAGE_KEY = 'skillpkg.theme';
const API_KEY_STORAGE_KEY = 'skillpkg.apiKey';
const NOTICE_DURATION_MS = 3000;

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

const getInitialApiKey = (): string =>
  window?.localStorage?.getItem(API_KEY_STORAGE_KEY) || '';

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });

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
  notice: PageNotice | null;
  installPath: string;
  dialogOpen: boolean;
  dialogSkill: Skill | null;
  dialogAgents: Set<string>;
  installConflict: boolean;
  installSubmitting: boolean;
  hostingConflictSkill: Skill | null;
  importStatus: ImportSkillStatus;
  importDialogOpen: boolean;
  importDialogKind: ImportSkillSourceKind | null;
  importDialogValue: string;
  importCandidates: ImportSkillCandidate[];
  selectedImportCandidateIds: Set<string>;
  importSessionId: string;
  batchInstallOpen: boolean;
  batchInstallSkills: Skill[];
  batchInstallAgents: Set<string>;
  batchInstallSubmitting: boolean;
  skillDeleteDialog: SkillDeleteDialogState | null;
  skillDeleteSubmitting: boolean;
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
  openInstallDialog: (skill: Skill, noticeScope?: NoticeScope) => void;
  confirmInstall: (overwrite?: boolean) => Promise<void>;
  openSkillLocation: () => Promise<void>;
  openImportSkill: (kind: ImportSkillSourceKind) => Promise<void> | void;
  importSkillpkgSkill: (publicId: string) => Promise<void>;
  closeImportDialog: () => void;
  setImportDialogValue: (value: string) => void;
  toggleImportCandidate: (id: string) => void;
  setAllImportCandidatesSelected: (selected: boolean) => void;
  confirmImportSkill: () => Promise<void>;
  closeBatchInstallDialog: () => void;
  setBatchInstallAgents: React.Dispatch<React.SetStateAction<Set<string>>>;
  confirmBatchInstall: () => Promise<void>;
  handleInstallToggle: (skill: Skill) => Promise<void>;
  openAgentSkillDeleteDialog: (skill: Skill) => void;
  openLocalSkillDeleteDialog: (skill: Skill) => void;
  closeSkillDeleteDialog: () => void;
  confirmSkillDelete: () => Promise<void>;
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
  const refreshRequestRef = useRef(0);
  const noticeIdRef = useRef(0);
  const [, startAgentTransition] = useTransition();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [discoverSkills, setDiscoverSkills] = useState<Skill[]>([]);
  const [localSkills, setLocalSkills] = useState<Skill[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('claude');
  const [selectedDiscoverSkillId, setSelectedDiscoverSkillId] = useState('');
  const [selectedLibrarySkillId, setSelectedLibrarySkillId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('README.md');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [apiKey, setApiKeyState] = useState(getInitialApiKey);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [installPath, setInstallPath] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSkill, setDialogSkill] = useState<Skill | null>(null);
  const [dialogNoticeScope, setDialogNoticeScope] = useState<NoticeScope>('local');
  const [dialogAgents, setDialogAgents] = useState<Set<string>>(new Set());
  const [installConflict, setInstallConflict] = useState(false);
  const [installSubmitting, setInstallSubmitting] = useState(false);
  const [hostingConflictSkill, setHostingConflictSkill] = useState<Skill | null>(null);
  const [importStatus, setImportStatus] = useState<ImportSkillStatus>('idle');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDialogKind, setImportDialogKind] = useState<ImportSkillSourceKind | null>(null);
  const [importDialogValue, setImportDialogValue] = useState('');
  const [importCandidates, setImportCandidates] = useState<ImportSkillCandidate[]>([]);
  const [selectedImportCandidateIds, setSelectedImportCandidateIds] = useState<Set<string>>(new Set());
  const [importSessionId, setImportSessionId] = useState('');
  const [batchInstallOpen, setBatchInstallOpen] = useState(false);
  const [batchInstallSkills, setBatchInstallSkills] = useState<Skill[]>([]);
  const [batchInstallAgents, setBatchInstallAgents] = useState<Set<string>>(new Set());
  const [batchInstallSubmitting, setBatchInstallSubmitting] = useState(false);
  const [batchInstallNoticeScope, setBatchInstallNoticeScope] = useState<NoticeScope>('local');
  const [skillDeleteDialog, setSkillDeleteDialog] = useState<SkillDeleteDialogState | null>(null);
  const [skillDeleteSubmitting, setSkillDeleteSubmitting] = useState(false);
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

  const setApiKey = useCallback((nextApiKey: string) => {
    setApiKeyState(nextApiKey);
    window?.localStorage?.setItem(API_KEY_STORAGE_KEY, nextApiKey);
  }, []);

  const showNotice = useCallback((text: string, scope: NoticeScope = 'global') => {
    noticeIdRef.current += 1;
    setNotice({
      id: noticeIdRef.current,
      text,
      scope,
    });
  }, []);

  const getSkillNoticeScope = useCallback((skill?: Skill | null): NoticeScope => {
    if (skill?.agentId) return 'agents';
    if (skill && discoverSkills.some((item) => item.id === skill.id)) return 'discover';
    return 'local';
  }, [discoverSkills]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  const syncInstalledByAgent = useCallback(async (
    agentList: Agent[],
    path: string,
    options: {
      replace?: boolean;
      isCurrent?: () => boolean;
    } = {},
  ) => {
    if (!window?.skillpkg?.loadAgentSkills) return;
    const results = (await window.skillpkg.loadAgentSkills(
      { agents: agentList, installPath: path },
    )) as AgentSkillsResult[];
    if (options.isCurrent && !options.isCurrent()) return;

    const nextInstalledByAgent: Record<string, Set<string>> = {};
    const nextAgentSkillsByAgent: Record<string, Skill[]> = {};
    const nextAgentSkillCounts = results.reduce<Record<string, number>>((acc, result) => {
      acc[result.agentId] = result.skills.length;
      return acc;
    }, {});

    agentList.forEach((agent) => {
      nextInstalledByAgent[agent.id] = new Set();
      nextAgentSkillsByAgent[agent.id] = [];
    });
    results.forEach((result) => {
      nextInstalledByAgent[result.agentId] = new Set(
        result.skills
          .filter((skill) => skill.managed)
          .map((skill) => skill.id),
      );
      nextAgentSkillsByAgent[result.agentId] = result.skills;
    });

    startAgentTransition(() => {
      setInstalledByAgent((prev) => (
        options.replace
          ? nextInstalledByAgent
          : { ...prev, ...nextInstalledByAgent }
      ));
      setAgentSkillsByAgent((prev) => (
        options.replace
          ? nextAgentSkillsByAgent
          : { ...prev, ...nextAgentSkillsByAgent }
      ));
      setAgentSkillCounts((prev) => {
        if (options.replace) return nextAgentSkillCounts;
        const next = { ...prev };
        agentList.forEach((agent) => {
          next[agent.id] = nextAgentSkillCounts[agent.id] || 0;
        });
        results.forEach((result) => {
          next[result.agentId] = result.skills.length;
        });
        return next;
      });
    });
  }, [startAgentTransition]);

  const refreshAgents = useCallback(async () => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    setRefreshingAgents(true);
    const start = Date.now();
    await waitForNextPaint();

    try {
      const nextAgents = await resolveInstalledAgents();
      if (refreshRequestRef.current !== requestId) return;

      const nextAgentIds = new Set(nextAgents.map((agent) => agent.id));
      startAgentTransition(() => {
        setAgents(nextAgents);
        setDialogAgents((current) => {
          const next = new Set(
            [...current].filter((agentId) => nextAgentIds.has(agentId)),
          );
          return next.size === current.size ? current : next;
        });
        setSelectedAgentId((current) => {
          if (current && nextAgentIds.has(current)) return current;
          return nextAgents[0]?.id || '';
        });
      });

      await syncInstalledByAgent(nextAgents, installPath, {
        replace: true,
        isCurrent: () => refreshRequestRef.current === requestId,
      });
    } finally {
      if (refreshRequestRef.current !== requestId) return;

      const elapsed = Date.now() - start;
      const minDuration = 400;
      if (elapsed < minDuration) {
        await new Promise((resolve) =>
          setTimeout(resolve, minDuration - elapsed),
        );
      }
      if (refreshRequestRef.current === requestId) {
        setRefreshingAgents(false);
      }
    }
  }, [
    installPath,
    resolveInstalledAgents,
    startAgentTransition,
    syncInstalledByAgent,
  ]);

  const loadLocalSkills = useCallback(async (path: string) => {
    if (!path) return [];
    if (!window?.skillpkg?.loadSkills) {
      showNotice('当前环境不支持读取本地路径。', 'local');
      return [];
    }
    const skills = await window.skillpkg.loadSkills(path);
    setLocalSkills(skills);
    return skills;
  }, [showNotice]);

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
    let active = true;
    const loadFavorites = async () => {
      try {
        if (!window?.skillpkg?.loadFavoriteSkillIds) return;
        const skillIds = await window.skillpkg.loadFavoriteSkillIds();
        if (active) {
          setFavorites(new Set(skillIds));
        }
      } catch (error) {
        if (active) {
          showNotice('读取收藏失败。', 'favorites');
        }
      } finally {
        if (active) {
          setFavoritesHydrated(true);
        }
      }
    };
    loadFavorites();
    return () => {
      active = false;
    };
  }, [showNotice]);

  useEffect(() => {
    if (!favoritesHydrated) return;
    if (!window?.skillpkg?.replaceFavoriteSkillIds) return;
    const skillIds = [...favorites];
    void window.skillpkg.replaceFavoriteSkillIds(skillIds).then((result) => {
      if (!result.ok) {
        showNotice('收藏保存失败，重启后可能丢失。', 'favorites');
      }
    }).catch(() => {
      showNotice('收藏保存失败，重启后可能丢失。', 'favorites');
    });
  }, [favorites, favoritesHydrated, showNotice]);

  useEffect(() => {
    if (!installPath) return;
    void refreshAgents();
  }, [installPath, refreshAgents]);

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

  const openInstallDialog = (skill: Skill, noticeScope: NoticeScope = getSkillNoticeScope(skill)) => {
    if (!validateSkill(skill)) {
      showNotice('Skill 校验失败：缺少必要字段或文件。', noticeScope);
      return;
    }
    setDialogAgents(new Set(agents.map((agent) => agent.id)));
    setDialogSkill(skill);
    setDialogNoticeScope(noticeScope);
    setInstallConflict(false);
    setDialogOpen(true);
  };

  const confirmInstall = async (overwrite = false) => {
    if (!dialogSkill) return;
    if (installSubmitting) return;
    const noticeScope = dialogNoticeScope;
    if (!installPath) {
      showNotice('请先设置统一路径。', noticeScope);
      return;
    }
    if (!window?.skillpkg?.installSkill) {
      showNotice('当前环境不支持安装 Skill。', noticeScope);
      return;
    }
    if (!dialogAgents.size) {
      showNotice('请至少选择一个 Agent。', noticeScope);
      return;
    }
    const selectedAgents = agents.filter((agent) => dialogAgents.has(agent.id));
    setInstallSubmitting(true);
    setImportStatus('installing');
    try {
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
        showNotice('目标 Agent 已存在同名自有 Skill，未覆盖。', noticeScope);
        return;
      }
      if (!result.ok) {
        showNotice('安装失败，请检查 Agent 技能目录权限。', noticeScope);
        return;
      }
      const installResults = result.results || [];
      const successfulAgentIds = new Set(
        installResults
          .filter((item) => item.ok && item.agentId)
          .map((item) => item.agentId as string),
      );
      const failedCount = installResults.filter((item) => !item.ok).length;
      const syncedAgents = successfulAgentIds.size
        ? selectedAgents.filter((agent) => successfulAgentIds.has(agent.id))
        : selectedAgents;
      await loadLocalSkills(installPath);
      await syncInstalledByAgent(syncedAgents, installPath);
      showNotice(
        failedCount
          ? `已为 ${syncedAgents.length} 个 Agent 安装 ${dialogSkill.name}，${failedCount} 个失败。`
          : `已为 ${syncedAgents.length} 个 Agent 安装 ${dialogSkill.name}。`,
        noticeScope,
      );
      setDialogOpen(false);
      setImportStatus('idle');
    } finally {
      setInstallSubmitting(false);
      setImportStatus((current) => (current === 'installing' ? 'idle' : current));
    }
  };

  const openSkillLocation = async () => {
    const noticeScope = dialogNoticeScope;
    if (!dialogSkill || !installPath) {
      showNotice('请先设置统一路径。', noticeScope);
      return;
    }
    if (!window?.skillpkg?.openSkillPath) {
      showNotice('当前环境不支持打开路径。', noticeScope);
      return;
    }
    const ok = await window.skillpkg.openSkillPath({
      installPath,
      skillId: dialogSkill.id,
    });
    if (!ok) {
      showNotice('未找到该 Skill 的本地路径。', noticeScope);
    }
  };

  const mapImportReason = (reason?: string) => {
    const messages: Record<string, string> = {
      'api-key-required': '请先在设置页配置 SkillPKG API Key。',
      'candidate-missing': '未找到选择的 Skill 候选。',
      'download-failed': '云端 Skill 下载失败，请检查网络后重试。',
      'download-url-missing': '云端未返回可下载的 Skill 包。',
      'exists': '统一路径中已存在同名无效目录，请先处理后再导入。',
      'extract-failed': 'Zip 解压失败，请确认文件完整。',
      'git-clone-failed': 'Git 仓库拉取失败，请检查地址或网络。',
      'install-path-missing': '请先设置统一路径。',
      'invalid-git-url': '请输入有效的 Git 仓库地址。',
      'invalid-path': '导入路径无效。',
      'invalid-public-id': 'SkillPkg Skill ID 无效。',
      'invalid-skill-id': 'Skill ID 无效。',
      'invalid-skill': '候选目录不是有效 Skill。',
      'no-skill-found': '未找到有效 SKILL.md。',
      'session-expired': '导入候选已过期，请重新导入。',
      'source-missing': '未找到导入来源。',
      'unsupported-source': '暂不支持该导入方式。',
    };
    if (reason?.startsWith('download-failed')) {
      return messages['download-failed'];
    }
    return messages[reason || ''] || '导入失败，请检查来源。';
  };

  const resetImportSelection = () => {
    setImportCandidates([]);
    setSelectedImportCandidateIds(new Set());
    setImportSessionId('');
  };

  const startBatchInstall = (skills: Skill[], noticeScope: NoticeScope = 'local') => {
    setBatchInstallSkills(skills);
    setBatchInstallAgents(new Set(agents.map((agent) => agent.id)));
    setBatchInstallNoticeScope(noticeScope);
    setBatchInstallOpen(true);
  };

  const completeImportedSkill = async (
    skill: Skill | null | undefined,
    reused?: boolean,
    noticeScope: NoticeScope = 'local',
  ) => {
    if (!skill) {
      showNotice('导入失败：未返回有效 Skill。', noticeScope);
      setImportStatus('error');
      return;
    }
    await loadLocalSkills(installPath);
    setSelectedLibrarySkillId(skill.id);
    setSelectedFilePath(getDefaultSkillFilePath(skill));
    setImportDialogOpen(false);
    resetImportSelection();
    setImportStatus('ready');
    showNotice(reused ? `已使用统一库中现有 ${skill.name}。` : `已导入 ${skill.name}，请确认安装到 Agents。`, noticeScope);
    openInstallDialog(skill, noticeScope);
  };

  const completeImportedSkills = async (
    skills: Skill[],
    reusedSkillIds: string[] = [],
    failedCount = 0,
    noticeScope: NoticeScope = 'local',
  ) => {
    if (!skills.length) {
      showNotice('导入失败：未返回有效 Skill。', noticeScope);
      setImportStatus('error');
      return;
    }
    await loadLocalSkills(installPath);
    setSelectedLibrarySkillId(skills[0].id);
    setSelectedFilePath(getDefaultSkillFilePath(skills[0]));
    setImportDialogOpen(false);
    resetImportSelection();
    setImportStatus('ready');
    const reusedCount = reusedSkillIds.length;
    const failureText = failedCount ? `，${failedCount} 个导入失败` : '';
    const reusedText = reusedCount ? `，其中 ${reusedCount} 个复用现有 Skill` : '';
    showNotice(`已导入 ${skills.length} 个 Skill${reusedText}${failureText}，请确认安装到 Agents。`, noticeScope);
    startBatchInstall(skills, noticeScope);
  };

  const handleImportResult = async (
    result: Awaited<ReturnType<NonNullable<typeof window.skillpkg>['importSkillSource']>>,
    payload: {
      kind: 'zip' | 'git' | 'session' | 'skillpkg-download';
      candidateIds?: string[];
    },
    noticeScope: NoticeScope,
  ) => {
    if (result.ok) {
      const requestedMultipleCandidates =
        payload.kind === 'session' && (payload.candidateIds?.length || 0) > 1;
      if (result.skills?.length && (result.skills.length > 1 || requestedMultipleCandidates)) {
        await completeImportedSkills(
          result.skills,
          result.reusedSkillIds || [],
          result.failedCandidates?.length || 0,
          noticeScope,
        );
        return;
      }
      await completeImportedSkill(result.skill, result.reused, noticeScope);
      return;
    }
    if (result.reason === 'multiple-candidates' && result.candidates?.length && result.sessionId) {
      setImportCandidates(result.candidates);
      setSelectedImportCandidateIds(new Set(result.candidates.map((candidate) => candidate.id)));
      setImportSessionId(result.sessionId);
      setImportDialogValue('');
      setImportDialogOpen(true);
      setImportStatus('ready');
      return;
    }
    showNotice(mapImportReason(result.reason), noticeScope);
    setImportStatus('error');
  };

  const runImportSkillSource = async (payload: {
    kind: 'zip' | 'git' | 'session';
    installPath?: string;
    zipPath?: string;
    url?: string;
    sessionId?: string;
    candidateId?: string;
    candidateIds?: string[];
  }, noticeScope: NoticeScope = 'local') => {
    if (!window?.skillpkg?.importSkillSource) {
      showNotice('当前环境不支持导入 Skill。', noticeScope);
      setImportStatus('error');
      return;
    }
    setImportStatus(
      payload.kind === 'zip'
        ? 'scanning'
        : payload.kind === 'session'
          ? 'resolving'
          : 'downloading',
    );
    await waitForNextPaint();
    const result = await window.skillpkg.importSkillSource(payload);
    await handleImportResult(result, payload, noticeScope);
  };

  const closeImportDialog = () => {
    if (importStatus === 'downloading' || importStatus === 'scanning' || importStatus === 'resolving') {
      return;
    }
    setImportDialogOpen(false);
    setImportDialogValue('');
    resetImportSelection();
  };

  const openImportSkill = async (kind: ImportSkillSourceKind) => {
    if (importStatus === 'downloading' || importStatus === 'scanning' || importStatus === 'resolving') {
      return;
    }
    if (!installPath) {
      showNotice('请先设置统一路径。', 'local');
      return;
    }

    setImportDialogKind(kind);
    setImportDialogValue('');
    resetImportSelection();

    if (kind === 'zip') {
      if (!window?.skillpkg?.selectImportZip) {
        showNotice('当前环境不支持选择 Zip 文件。', 'local');
        return;
      }
      setImportStatus('picking');
      const zipPath = await window.skillpkg.selectImportZip();
      if (!zipPath) {
        setImportStatus('idle');
        return;
      }
      await runImportSkillSource({ kind: 'zip', installPath, zipPath });
      return;
    }

    setImportDialogOpen(true);
    setImportStatus('idle');
  };

  const confirmImportSkill = async () => {
    if (importCandidates.length) {
      const candidateIds = [...selectedImportCandidateIds];
      if (!candidateIds.length) {
        showNotice('请至少选择一个 Skill。', 'local');
        return;
      }
      await runImportSkillSource({
        kind: 'session',
        installPath,
        candidateIds,
        sessionId: importSessionId,
      });
      return;
    }
    const value = importDialogValue.trim();
    if (!value) {
      showNotice('请输入导入地址。', 'local');
      return;
    }
    if (importDialogKind === 'git') {
      await runImportSkillSource({ kind: 'git', installPath, url: value });
    }
  };

  const importSkillpkgSkill = async (publicId: string) => {
    if (
      importStatus === 'downloading' ||
      importStatus === 'scanning' ||
      importStatus === 'resolving' ||
      importStatus === 'installing'
    ) {
      return;
    }
    if (!installPath) {
      showNotice('请先设置统一路径。', 'discover');
      return;
    }
    if (!apiKey.trim()) {
      showNotice('请先在设置页配置 SkillPKG API Key。', 'discover');
      return;
    }
    if (!window?.skillpkg?.downloadSkillpkgSkill) {
      showNotice('当前环境不支持下载 SkillPKG Skill。', 'discover');
      setImportStatus('error');
      return;
    }
    setImportDialogValue('');
    resetImportSelection();
    setImportStatus('downloading');
    await waitForNextPaint();
    const result = await window.skillpkg.downloadSkillpkgSkill({
      installPath,
      publicId,
      apiKey,
    });
    await handleImportResult(result, { kind: 'skillpkg-download' }, 'discover');
  };

  const toggleImportCandidate = (id: string) => {
    setSelectedImportCandidateIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllImportCandidatesSelected = (selected: boolean) => {
    setSelectedImportCandidateIds(
      selected ? new Set(importCandidates.map((candidate) => candidate.id)) : new Set(),
    );
  };

  const closeBatchInstallDialog = () => {
    if (batchInstallSubmitting) return;
    setBatchInstallOpen(false);
    setBatchInstallSkills([]);
    setBatchInstallAgents(new Set());
    setBatchInstallNoticeScope('local');
  };

  const confirmBatchInstall = async () => {
    if (!batchInstallSkills.length || batchInstallSubmitting) return;
    if (!window?.skillpkg?.installLibrarySkills) {
      showNotice('当前环境不支持批量安装 Skill。', batchInstallNoticeScope);
      return;
    }
    if (!batchInstallAgents.size) {
      showNotice('请至少选择一个 Agent。', batchInstallNoticeScope);
      return;
    }
    const selectedAgents = agents.filter((agent) => batchInstallAgents.has(agent.id));
    setBatchInstallSubmitting(true);
    setImportStatus('installing');
    try {
      const result = await window.skillpkg.installLibrarySkills({
        installPath,
        skillIds: batchInstallSkills.map((skill) => skill.id),
        agents: selectedAgents,
      });
      const successCount = result.results.filter((item) => item.ok).length;
      const failedCount = result.results.length - successCount;
      if (!result.ok) {
        showNotice('批量安装失败，请检查 Agent 技能目录权限。', batchInstallNoticeScope);
        return;
      }
      await syncInstalledByAgent(selectedAgents, installPath);
      showNotice(
        failedCount
          ? `已完成 ${successCount} 项安装，${failedCount} 项因冲突或权限失败。`
          : `已将 ${batchInstallSkills.length} 个 Skill 安装到 ${selectedAgents.length} 个 Agent。`,
        batchInstallNoticeScope,
      );
      setBatchInstallOpen(false);
      setBatchInstallSkills([]);
      setBatchInstallAgents(new Set());
      setBatchInstallNoticeScope('local');
    } finally {
      setBatchInstallSubmitting(false);
      setImportStatus((current) => (current === 'installing' ? 'idle' : current));
    }
  };

  const hostAgentSkill = async (
    skill: Skill,
    options: { overwrite?: boolean; useExisting?: boolean } = {},
  ) => {
    if (skill.managed) return;
    if (!installPath) {
      showNotice('请先设置统一路径。', 'agents');
      return;
    }
    if (!window?.skillpkg?.migrateSkills) {
      showNotice('当前环境不支持托管 Agent Skill。', 'agents');
      return;
    }
    const targetAgentId = skill.agentId || selectedAgentId;
    const targetAgent = agents.find((agent) => agent.id === targetAgentId);
    if (!targetAgent) {
      showNotice('未找到当前 Agent 配置。', 'agents');
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
        showNotice('托管失败，请检查 Agent 技能目录和统一路径权限。', 'agents');
        return;
      }
      setHostingConflictSkill(null);
      await loadLocalSkills(installPath);
      await syncInstalledByAgent(agents, installPath);
      showNotice(options.useExisting ? '已改用当前托管 Skill。' : '已托管当前 Skill。', 'agents');
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
      openAgentSkillDeleteDialog(skill);
      return;
    }
    await hostAgentSkill(skill);
  };

  const openAgentSkillDeleteDialog = (skill: Skill) => {
    const targetAgentId = skill.agentId || selectedAgentId;
    const isManaged = Boolean(skill.managed || installedByAgent[targetAgentId]?.has(skill.id));
    const agentName =
      agents.find((agent) => agent.id === targetAgentId)?.name ||
      AGENT_CATALOG[targetAgentId as AgentId]?.name ||
      targetAgentId ||
      '当前 Agent';

    setSkillDeleteDialog({
      action: isManaged ? 'agent-uninstall' : 'agent-delete',
      skill,
      agentId: targetAgentId,
      agentName,
    });
  };

  const openLocalSkillDeleteDialog = (skill: Skill) => {
    const hostedAgentNames = Object.entries(installedByAgent)
      .filter(([, skillIds]) => skillIds.has(skill.id))
      .map(([agentId]) =>
        agents.find((agent) => agent.id === agentId)?.name ||
        AGENT_CATALOG[agentId as AgentId]?.name ||
        agentId,
      );

    setSkillDeleteDialog({
      action: 'library-delete',
      skill,
      hostedAgentNames,
    });
  };

  const closeSkillDeleteDialog = () => {
    if (skillDeleteSubmitting) return;
    setSkillDeleteDialog(null);
  };

  const confirmAgentSkillDelete = async (dialog: SkillDeleteDialogState) => {
    const targetAgentId = dialog.agentId || dialog.skill.agentId || selectedAgentId;
    if (!targetAgentId) {
      showNotice('未找到当前 Agent 配置。', 'agents');
      return;
    }
    setPendingSkillIds((prev) => new Set(prev).add(dialog.skill.id));
    try {
      const result = dialog.action === 'agent-uninstall'
        ? await window.skillpkg?.uninstallAgentSkill?.({
            agentId: targetAgentId,
            skillId: dialog.skill.id,
            installPath,
          })
        : await window.skillpkg?.deleteAgentSkill?.({
            agentId: targetAgentId,
            skillId: dialog.skill.id,
          });

      if (!result?.ok) {
        showNotice(
          dialog.action === 'agent-uninstall'
            ? '卸载失败：该 Skill 不是有效的托管链接。'
            : '删除失败，请检查 Agent 技能目录权限。',
          'agents',
        );
        return;
      }
      await syncInstalledByAgent(agents, installPath);
      showNotice(
        dialog.action === 'agent-uninstall'
          ? '已从当前 Agent 卸载托管 Skill。'
          : '已删除当前 Agent 的 Skill。',
        'agents',
      );
      setSkillDeleteDialog(null);
    } finally {
      setPendingSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(dialog.skill.id);
        return next;
      });
    }
  };

  const confirmLocalSkillDelete = async (dialog: SkillDeleteDialogState) => {
    if (!installPath) {
      showNotice('请先设置统一路径。', 'local');
      return;
    }
    if (!window?.skillpkg?.deleteLibrarySkill || !window?.skillpkg?.loadSkills) {
      showNotice('当前环境不支持删除本地 Skill。', 'local');
      return;
    }
    const hostedAgentIds = Object.entries(installedByAgent)
      .filter(([, skillIds]) => skillIds.has(dialog.skill.id))
      .map(([agentId]) => agentId);
    const hostedAgents = agents.filter((agent) => hostedAgentIds.includes(agent.id));
    setPendingSkillIds((prev) => new Set(prev).add(dialog.skill.id));
    try {
      const result = await window.skillpkg.deleteLibrarySkill({
        installPath,
        skillId: dialog.skill.id,
        agents: hostedAgents,
      });
      if (!result.ok) {
        showNotice('删除失败，请检查统一路径和 Agent 技能目录权限。', 'local');
        return;
      }
      const nextSkills = await loadLocalSkills(installPath);
      await syncInstalledByAgent(agents, installPath);
      setFavorites((prev) => {
        if (!prev.has(dialog.skill.id)) return prev;
        const next = new Set(prev);
        next.delete(dialog.skill.id);
        return next;
      });
      setFileDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${dialog.skill.id}::`)) delete next[key];
        });
        return next;
      });
      const nextSelectedSkill = nextSkills.find((skill) => skill.id !== dialog.skill.id) || null;
      setSelectedLibrarySkillId(nextSelectedSkill?.id || '');
      setSelectedFilePath(nextSelectedSkill ? getDefaultSkillFilePath(nextSelectedSkill) : '');
      showNotice(
        hostedAgents.length
          ? '已删除本地 Skill，并从使用它的 Agents 中卸载。'
          : '已删除本地 Skill。',
        'local',
      );
      setSkillDeleteDialog(null);
    } finally {
      setPendingSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(dialog.skill.id);
        return next;
      });
    }
  };

  const confirmSkillDelete = async () => {
    if (!skillDeleteDialog || skillDeleteSubmitting) return;
    setSkillDeleteSubmitting(true);
    try {
      if (skillDeleteDialog.action === 'library-delete') {
        await confirmLocalSkillDelete(skillDeleteDialog);
        return;
      }
      await confirmAgentSkillDelete(skillDeleteDialog);
    } finally {
      setSkillDeleteSubmitting(false);
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
      showNotice('此文件无法加载预览。', getSkillNoticeScope(skill));
    }
  }, [getSkillNoticeScope, showNotice]);

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
    const noticeScope = getSkillNoticeScope(targetSkill);
    if (!getFilePolicy(draftFile).canEdit) {
      showNotice('此文件类型或大小不支持编辑。', noticeScope);
      return;
    }
    if (!installPath || !window?.skillpkg?.saveSkillFile) {
      showNotice('请先设置统一路径。', noticeScope);
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
      showNotice('保存失败：此文件类型或大小不支持编辑。', noticeScope);
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
    showNotice('已保存修改。', noticeScope);
    setEditing(false);
  };

  const handleSelectInstallPath = async () => {
    try {
      if (!window?.skillpkg?.selectInstallPath) {
        showNotice('当前环境不支持选择本地路径。', 'settings');
        return;
      }
      const selectedPath = await window.skillpkg.selectInstallPath();
      if (selectedPath) {
        setInstallPath(selectedPath);
        showNotice('已更新统一路径。', 'settings');
      }
    } catch (error) {
      showNotice('选择路径失败，请重试。', 'settings');
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
    installSubmitting,
    hostingConflictSkill,
    importStatus,
    importDialogOpen,
    importDialogKind,
    importDialogValue,
    importCandidates,
    selectedImportCandidateIds,
    importSessionId,
    batchInstallOpen,
    batchInstallSkills,
    batchInstallAgents,
    batchInstallSubmitting,
    skillDeleteDialog,
    skillDeleteSubmitting,
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
    openImportSkill,
    importSkillpkgSkill,
    closeImportDialog,
    setImportDialogValue,
    toggleImportCandidate,
    setAllImportCandidatesSelected,
    confirmImportSkill,
    closeBatchInstallDialog,
    setBatchInstallAgents,
    confirmBatchInstall,
    handleInstallToggle,
    openAgentSkillDeleteDialog,
    openLocalSkillDeleteDialog,
    closeSkillDeleteDialog,
    confirmSkillDelete,
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
