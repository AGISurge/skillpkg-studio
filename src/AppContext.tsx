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
import { DISCOVER_MOCK_PATH } from './config/discover';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ImportSkillSourceKind = 'zip' | 'git' | 'skillpkg';
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
};

export type NoticeScope = 'discover' | 'local' | 'favorites' | 'agents' | 'settings' | 'global';

export type PageNotice = {
  id: number;
  text: string;
  scope: NoticeScope;
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
    return () => setToolbar(null);
  }, [content, setToolbar]);
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
  selectedImportCandidateId: string;
  importSessionId: string;
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
  closeImportDialog: () => void;
  setImportDialogValue: (value: string) => void;
  setSelectedImportCandidateId: (id: string) => void;
  confirmImportSkill: () => Promise<void>;
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
  const [selectedImportCandidateId, setSelectedImportCandidateId] = useState('');
  const [importSessionId, setImportSessionId] = useState('');
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
    if (!path) return;
    if (!window?.skillpkg?.loadSkills) {
      showNotice('当前环境不支持读取本地路径。', 'local');
      return;
    }
    const skills = await window.skillpkg.loadSkills(path);
    setLocalSkills(skills);
  }, [showNotice]);

  const loadDiscoverSkills = useCallback(async () => {
    if (!window?.skillpkg?.loadSkills) {
      showNotice('当前环境不支持读取发现页数据。', 'discover');
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
  }, [selectedDiscoverSkillId, showNotice]);

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
      await loadLocalSkills(installPath);
      await syncInstalledByAgent(selectedAgents, installPath);
      showNotice(`已为 ${dialogAgents.size} 个 Agent 安装 ${dialogSkill.name}。`, noticeScope);
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
      'api-not-configured': 'skillpkg.com API 尚未接入，接口提供后即可启用。',
      'candidate-missing': '未找到选择的 Skill 候选。',
      'exists': '统一路径中已存在同名无效目录，请先处理后再导入。',
      'extract-failed': 'Zip 解压失败，请确认文件完整。',
      'git-clone-failed': 'Git 仓库拉取失败，请检查地址或网络。',
      'install-path-missing': '请先设置统一路径。',
      'invalid-git-url': '请输入有效的 Git 仓库地址。',
      'invalid-path': '导入路径无效。',
      'invalid-skill': '候选目录不是有效 Skill。',
      'no-skill-found': '未找到有效 SKILL.md。',
      'session-expired': '导入候选已过期，请重新导入。',
      'source-missing': '未找到导入来源。',
      'unsupported-source': '暂不支持该导入方式。',
    };
    return messages[reason || ''] || '导入失败，请检查来源。';
  };

  const resetImportSelection = () => {
    setImportCandidates([]);
    setSelectedImportCandidateId('');
    setImportSessionId('');
  };

  const completeImportedSkill = async (skill: Skill | null | undefined, reused?: boolean) => {
    if (!skill) {
      showNotice('导入失败：未返回有效 Skill。', 'local');
      setImportStatus('error');
      return;
    }
    await loadLocalSkills(installPath);
    setSelectedLibrarySkillId(skill.id);
    setSelectedFilePath(getDefaultSkillFilePath(skill));
    setImportDialogOpen(false);
    resetImportSelection();
    setImportStatus('ready');
    showNotice(reused ? `已使用统一库中现有 ${skill.name}。` : `已导入 ${skill.name}，请确认安装到 Agents。`, 'local');
    openInstallDialog(skill, 'local');
  };

  const runImportSkillSource = async (payload: {
    kind: 'zip' | 'git' | 'skillpkg' | 'session';
    installPath?: string;
    zipPath?: string;
    url?: string;
    apiKey?: string;
    sessionId?: string;
    candidateId?: string;
  }) => {
    if (!window?.skillpkg?.importSkillSource) {
      showNotice('当前环境不支持导入 Skill。', 'local');
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
    if (result.ok) {
      await completeImportedSkill(result.skill, result.reused);
      return;
    }
    if (result.reason === 'multiple-candidates' && result.candidates?.length && result.sessionId) {
      setImportCandidates(result.candidates);
      setSelectedImportCandidateId(result.candidates[0].id);
      setImportSessionId(result.sessionId);
      setImportDialogValue('');
      setImportDialogOpen(true);
      setImportStatus('ready');
      return;
    }
    showNotice(mapImportReason(result.reason), 'local');
    setImportStatus('error');
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
    if (!installPath && kind !== 'skillpkg') {
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

    if (kind === 'skillpkg' && !apiKey.trim()) {
      setImportDialogOpen(true);
      setImportStatus('idle');
      return;
    }

    setImportDialogOpen(true);
    setImportStatus('idle');
  };

  const confirmImportSkill = async () => {
    if (importCandidates.length) {
      if (!selectedImportCandidateId) {
        showNotice('请选择一个 Skill。', 'local');
        return;
      }
      await runImportSkillSource({
        kind: 'session',
        installPath,
        candidateId: selectedImportCandidateId,
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
      return;
    }
    if (importDialogKind === 'skillpkg') {
      await runImportSkillSource({ kind: 'skillpkg', installPath, url: value, apiKey });
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
      await unhostAgentSkill(skill);
      return;
    }
    await hostAgentSkill(skill);
  };

  const unhostAgentSkill = async (skill: Skill) => {
    if (!installPath) {
      showNotice('请先设置统一路径。', 'agents');
      return;
    }
    if (!window?.skillpkg?.unhostAgentSkill) {
      showNotice('当前环境不支持取消托管。', 'agents');
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
        showNotice('取消托管失败：该 Skill 不是有效的托管链接。', 'agents');
        return;
      }
      await syncInstalledByAgent(agents, installPath);
      showNotice('已取消托管，并复制到当前 Agent 的 Skill 目录。', 'agents');
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
    selectedImportCandidateId,
    importSessionId,
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
    closeImportDialog,
    setImportDialogValue,
    setSelectedImportCandidateId,
    confirmImportSkill,
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
