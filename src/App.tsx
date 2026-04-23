import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FolderOpenRegular, LinkRegular } from '@fluentui/react-icons';
import './App.css';
import type { Agent, Skill, SkillFile } from './types/models';
import { menuRoutes, routePaths } from './routes';
import { validateSkill } from './utils/skillUtils';
import { AGENT_CATALOG, AGENT_TOOL_IDS } from './config/agents';
import type { AgentId } from './config/agents';
import { DISCOVER_MOCK_PATH } from './config/discover';
import { mergeAgentSkills } from './utils/migrationUtils';
import type { AgentSkillsResult, MigrationSkillEntry } from './utils/migrationUtils';
import Sidebar from './components/Sidebar';
import InstallDialog from './components/InstallDialog';
import ThemeDialog from './components/ThemeDialog';
import ApiKeyDialog from './components/ApiKeyDialog';
import MigrationDialog from './components/MigrationDialog';
import DiscoverPage from './pages/DiscoverPage';
import LocalPage from './pages/LocalPage';
import FavoritesPage from './pages/FavoritesPage';
import AgentsPage from './pages/AgentsPage';

type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'skillpkg.theme';

/**
 * 读取本地主题设置，未设置则回落到跟随系统。
 */
const getInitialTheme = (): ThemeMode => {
  const saved = window?.localStorage?.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
};

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSection, setActiveSection] = useState('discover');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [discoverSkills, setDiscoverSkills] = useState<Skill[]>([]);
  const [localSkills, setLocalSkills] = useState<Skill[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState('claude');
  const [selectedDiscoverSkillId, setSelectedDiscoverSkillId] = useState('');
  const [selectedLibrarySkillId, setSelectedLibrarySkillId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('README.md');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState<ThemeMode>(theme);
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey);
  const [refreshingAgents, setRefreshingAgents] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationSubmitting, setMigrationSubmitting] = useState(false);
  const [migrationSkills, setMigrationSkills] = useState<MigrationSkillEntry[]>([]);
  const [migrationSelected, setMigrationSelected] = useState<Set<string>>(new Set());
  const [migrationSources, setMigrationSources] = useState<Record<string, string>>({});
  const [migrationNotice, setMigrationNotice] = useState('');

  const [installedByAgent, setInstalledByAgent] = useState<Record<string, Set<string>>>(
    () => ({
      claude: new Set(),
      codex: new Set(),
      cursor: new Set(),
    })
  );

  const currentSkillList = useMemo(() => {
    if (activeSection === 'discover') return discoverSkills;
    if (activeSection === 'favorites')
      return localSkills.filter((skill) => favorites.has(skill.id));
    if (activeSection === 'agents') {
      const installed = installedByAgent[selectedAgentId] || new Set();
      return localSkills.filter((skill) => installed.has(skill.id));
    }
    return localSkills;
  }, [activeSection, discoverSkills, favorites, installedByAgent, localSkills, selectedAgentId]);

  const selectedSkillId =
    activeSection === 'discover' ? selectedDiscoverSkillId : selectedLibrarySkillId;

  const selectedSkill = useMemo(() => {
    return currentSkillList.find((skill) => skill.id === selectedSkillId) ||
      currentSkillList[0] ||
      null;
  }, [currentSkillList, selectedSkillId]);

  const selectedFile = useMemo<SkillFile | null>(() => {
    if (!selectedSkill) return null;
    return (
      selectedSkill.files.find((file) => file.path === selectedFilePath) ||
      selectedSkill.files[0] ||
      null
    );
  }, [selectedFilePath, selectedSkill]);

  /**
   * 通过桥接接口探测已安装的 Agent。
   * @param names - 需要检测的 Agent 标识或标识列表。
   */
  const checkInstalledAgents = useCallback(
    async (names: string | readonly string[]): Promise<string[]> => {
      const list = Array.isArray(names) ? [...names] : [names];
      if (!window?.skillpkg?.detectAgents) return [];
      const results = await window.skillpkg.detectAgents(list);
      return results.filter((result) => result.installed).map((result) => result.name);
    },
    []
  );

  /**
   * 根据已安装的 Agent 标识构建 Agent 列表。
   */
  const resolveInstalledAgents = useCallback(async (): Promise<Agent[]> => {
    const installedIds = await checkInstalledAgents(AGENT_TOOL_IDS);
    return installedIds
      .filter((agentId): agentId is AgentId => AGENT_TOOL_IDS.includes(agentId as AgentId))
      .map((agentId) => AGENT_CATALOG[agentId]);
  }, [checkInstalledAgents]);

  /**
   * 扫描指定 Agent 的技能并合并为去重列表。
   * @param agentList - 需要扫描的 Agent 列表。
   */
  const loadMigrationSkills = useCallback(async (agentList: Agent[]) => {
    if (!window?.skillpkg?.loadAgentSkills) return [] as MigrationSkillEntry[];
    const results = (await window.skillpkg.loadAgentSkills(agentList)) as AgentSkillsResult[];
    return mergeAgentSkills(results);
  }, []);

  /**
   * 同步每个 Agent 已安装的技能列表。
   * @param agentList - 当前可用的 Agent 列表。
   */
  const syncInstalledByAgent = useCallback(async (agentList: Agent[]) => {
    if (!window?.skillpkg?.loadAgentSkills) return;
    const results = (await window.skillpkg.loadAgentSkills(agentList)) as AgentSkillsResult[];
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

  /**
   * 刷新已安装 Agent 列表，并让刷新图标至少旋转一小段时间。
   */
  const refreshAgents = useCallback(async () => {
    setRefreshingAgents(true);
    const start = Date.now();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const nextAgents = await resolveInstalledAgents();
      setAgents(nextAgents);
      if (nextAgents.length && !nextAgents.some((agent) => agent.id === selectedAgentId)) {
        setSelectedAgentId(nextAgents[0].id);
      }
      await syncInstalledByAgent(nextAgents);
    } finally {
      const elapsed = Date.now() - start;
      const minDuration = 400;
      if (elapsed < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
      }
      setRefreshingAgents(false);
    }
  }, [resolveInstalledAgents, selectedAgentId, syncInstalledByAgent]);

  /**
   * 打开迁移弹窗并填充数据。
   */
  const openMigrationDialog = useCallback(async () => {
    setSettingsOpen(false);
    setMigrationOpen(true);
    setMigrationNotice('');
    setMigrationLoading(true);
    setMigrationSelected(new Set());
    setMigrationSources({});
    const agentList = await resolveInstalledAgents();
    setAgents(agentList);
    if (agentList.length && !agentList.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(agentList[0].id);
    }
    const entries = await loadMigrationSkills(agentList);
    setMigrationSkills(entries);
    setMigrationLoading(false);
  }, [loadMigrationSkills, resolveInstalledAgents, selectedAgentId]);

  /**
   * 勾选或取消迁移列表中的技能。
   * @param skillId - 技能唯一标识。
   */
  const toggleMigrationSkill = useCallback((skillId: string) => {
    setMigrationSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }, []);

  /**
   * 迁移列表全选/取消全选。
   */
  const toggleMigrationAll = useCallback(() => {
    setMigrationSelected((prev) => {
      if (migrationSkills.length && prev.size === migrationSkills.length) {
        return new Set();
      }
      return new Set(migrationSkills.map((skill) => skill.id));
    });
  }, [migrationSkills]);

  /**
   * 为多来源技能选择来源 Agent。
   * @param skillId - 需要选择来源的技能标识。
   * @param agentId - 作为来源的 Agent 标识。
   */
  const selectMigrationSource = useCallback((skillId: string, agentId: string) => {
    setMigrationSources((prev) => ({ ...prev, [skillId]: agentId }));
  }, []);

  /**
   * 按当前选择执行迁移。
   */
  const confirmMigration = useCallback(async () => {
    if (!installPath) {
      setMigrationNotice('请先设置统一路径。');
      return;
    }
    if (!migrationSelected.size) {
      setMigrationNotice('请选择要迁移的技能。');
      return;
    }
    const skipped: string[] = [];
    const items = migrationSkills
      .filter((skill) => migrationSelected.has(skill.id))
      .map((skill) => {
        const sourceId =
          skill.agents.length === 1 ? skill.agents[0].id : migrationSources[skill.id];
        if (!sourceId) {
          skipped.push(skill.name);
          return null;
        }
        const agent = agents.find((entry) => entry.id === sourceId);
        if (!agent) {
          skipped.push(skill.name);
          return null;
        }
        return {
          agentId: sourceId,
          skillId: skill.id,
          pathMac: agent.pathMac,
          pathWindows: agent.pathWindows,
        };
      })
      .filter(Boolean);
    if (!items.length) {
      setMigrationNotice(
        skipped.length
          ? `以下技能未选择来源，已跳过：${skipped.join('、')}`
          : '未发现可迁移的技能。'
      );
      return;
    }
    if (!window?.skillpkg?.migrateSkills) {
      setMigrationNotice('当前环境不支持迁移功能。');
      return;
    }
    setMigrationSubmitting(true);
    try {
      const results = await window.skillpkg.migrateSkills({
        installPath,
        items: items as Array<{
          agentId: string;
          skillId: string;
          pathMac: string;
          pathWindows: string;
        }>,
      });
      const failed = results.filter((result) => !result.ok);
      const doneCount = results.filter((result) => result.ok).length;
      if (failed.length) {
        setMigrationNotice(
          `已迁移 ${doneCount} 项，失败 ${failed.length} 项。` +
            (skipped.length ? ` 未选择来源已跳过：${skipped.join('、')}` : '')
        );
      } else if (skipped.length) {
        setMigrationNotice(`已迁移 ${doneCount} 项。未选择来源已跳过：${skipped.join('、')}`);
      } else {
        setMigrationNotice(`迁移完成，共 ${doneCount} 项。`);
      }
    } finally {
      setMigrationSubmitting(false);
    }
  }, [agents, installPath, migrationSelected, migrationSkills, migrationSources]);

  /**
   * 从统一路径加载技能列表。
   * @param path - 统一技能存放路径。
   */
  const loadLocalSkills = useCallback(async (path: string) => {
    if (!path) return;
    if (!window?.skillpkg?.loadSkills) {
      setNotice('当前环境不支持读取本地路径。');
      return;
    }
    const skills = await window.skillpkg.loadSkills(path);
    setLocalSkills(skills);
  }, []);

  /**
   * 从本地模拟路径加载发现页技能。
   */
  const loadDiscoverSkills = useCallback(async () => {
    if (!window?.skillpkg?.loadSkills) {
      setNotice('当前环境不支持读取发现页数据。');
      return;
    }
    const skills = await window.skillpkg.loadSkills(DISCOVER_MOCK_PATH);
    setDiscoverSkills(skills);
    if (skills[0] && !skills.some((skill) => skill.id === selectedDiscoverSkillId)) {
      setSelectedDiscoverSkillId(skills[0].id);
      setSelectedFilePath(skills[0].files[0]?.path || '');
    }
  }, [selectedDiscoverSkillId]);

  useEffect(() => {
    const savedPath = window?.localStorage?.getItem('skillpkg.installPath');
    if (savedPath) {
      setInstallPath(savedPath);
    }
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
      if (nextAgents.length && !nextAgents.some((agent) => agent.id === selectedAgentId)) {
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

  /**
   * 打开主题选择弹窗并预填草稿值。
   */
  const openThemeDialog = () => {
    setThemeDraft(theme);
    setThemeDialogOpen(true);
    setSettingsOpen(false);
  };

  /**
   * 打开 API Key 弹窗并预填草稿值。
   */
  const openApiKeyDialog = () => {
    setApiKeyDraft(apiKey);
    setApiKeyDialogOpen(true);
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (installPath) {
      window?.localStorage?.setItem('skillpkg.installPath', installPath);
      loadLocalSkills(installPath);
    }
  }, [installPath, loadLocalSkills]);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/agents')) {
      setActiveSection('agents');
      const agentId = path.split('/')[2];
      if (agentId && agents.some((agent) => agent.id === agentId)) {
        setSelectedAgentId(agentId);
      } else if (agents[0]) {
        setSelectedAgentId(agents[0].id);
      }
    } else if (path.startsWith('/favorites')) {
      setActiveSection('favorites');
    } else if (path.startsWith('/local')) {
      setActiveSection('local');
    } else {
      setActiveSection('discover');
    }
  }, [agents, location.pathname]);

  useEffect(() => {
    if (!currentSkillList.length) return;
    const listHasSelected = currentSkillList.some((skill) => skill.id === selectedSkillId);
    if (!listHasSelected) {
      const first = currentSkillList[0];
      if (activeSection === 'discover') {
        setSelectedDiscoverSkillId(first.id);
      } else {
        setSelectedLibrarySkillId(first.id);
      }
      setSelectedFilePath(first.files[0]?.path || '');
    }
  }, [activeSection, currentSkillList, selectedSkillId]);


  /**
   * 切换技能收藏状态。
   * @param skillId - 需要切换的技能标识。
   */
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

  /**
   * 打开安装弹窗。
   * @param skill - 待安装的技能信息。
   */
  const openInstallDialog = (skill: Skill) => {
    if (!validateSkill(skill)) {
      setNotice('Skill 校验失败：缺少必要字段或文件。');
      return;
    }
    const allAgents = new Set(agents.map((agent) => agent.id));
    setDialogAgents(allAgents);
    setDialogSkill(skill);
    setInstallConflict(false);
    setDialogOpen(true);
  };

  /**
   * 执行安装（可选覆盖已有技能）。
   * @param overwrite - 是否覆盖已有技能目录。
   */
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

  /**
   * 打开当前技能的本地存放位置。
   */
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

  /**
   * 将选择的 zip 转换成占位技能记录。
   * @param event - 文件选择变更事件（包含 zip 文件）。
   */
  const handleImportZip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = file.name.replace(/\.zip$/i, '').toLowerCase().replace(/\s+/g, '-');
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

  /**
   * 切换当前 Agent 的安装状态。
   * @param skillId - 需要切换的技能标识。
   */
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

  /**
   * 选择当前技能中的文件。
   * @param path - 相对技能根目录的文件路径。
   */
  const handleFileSelect = (path: string) => {
    setSelectedFilePath(path);
    setEditing(false);
  };

  /**
   * 更新当前文件的草稿内容。
   * @param value - 新的草稿内容。
   */
  const updateDraft = (value: string) => {
    if (!selectedSkill || !selectedFile) return;
    const key = `${selectedSkill.id}::${selectedFile.path}`;
    setFileDrafts((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * 通过桥接接口保存当前草稿。
   */
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
            file.path === selectedFile.path ? { ...file, content: draft } : file
          ),
        };
      })
    );
    setFileDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNotice('已保存修改。');
    setEditing(false);
  };

  /**
   * 选择统一路径并重新加载本地技能。
   */
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

  /**
   * 展开/收起技能树中的文件夹。
   * @param path - 相对技能根目录的文件夹路径。
   */
  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  /**
   * 进入 Agent 视图并选中该 Agent 的首个技能。
   * @param agentId - 需要激活的 Agent 标识。
   */
  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    const installed = installedByAgent[agentId] || new Set();
    const agentSkills = localSkills.filter((skill) => installed.has(skill.id));
    if (agentSkills[0]) {
      setSelectedLibrarySkillId(agentSkills[0].id);
      setSelectedFilePath(agentSkills[0].files[0]?.path || '');
    }
    navigate(`/agents/${agentId}`);
  };

  const fileKey = selectedSkill && selectedFile ? `${selectedSkill.id}::${selectedFile.path}` : '';
  const draftValue = fileKey ? fileDrafts[fileKey] : undefined;
  const currentAgentName = agents.find((agent) => agent.id === selectedAgentId)?.name || '';
  const installedSkillIds = installedByAgent[selectedAgentId] || new Set();

  return (
    <div className="app-shell">
      <Sidebar
        routes={menuRoutes}
        activeSection={activeSection}
        agentsExpanded={agentsExpanded}
        onToggleAgents={() => setAgentsExpanded((prev) => !prev)}
        agents={agents}
        selectedAgentId={selectedAgentId}
        installedByAgent={installedByAgent}
        onSelectAgent={handleSelectAgent}
        onRefreshAgents={refreshAgents}
        refreshingAgents={refreshingAgents}
        theme={theme}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((prev) => !prev)}
        onOpenTheme={openThemeDialog}
        onOpenApiKey={openApiKeyDialog}
        onOpenMigration={openMigrationDialog}
      />

      <main className="content">
        <header className="topbar">
          <div>
            <div className="page-title">
              {menuRoutes.find((item) => item.id === activeSection)?.label}
            </div>
            <div className="page-subtitle">SkillPkg 管理与分发中心</div>
          </div>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => fileInputRef.current?.click()}>
              <FolderOpenRegular className="icon" />
              导入 Zip
            </button>
            <button type="button" className="btn primary" onClick={handleSelectInstallPath}>
              <LinkRegular className="icon" />
              统一路径
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleImportZip}
            />
          </div>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}
        {installPath ? (
          <div className="path-info">
            <span className="label">统一路径</span>
            <span className="value">{installPath}</span>
          </div>
        ) : null}

        <Routes>
          <Route
            path={routePaths.discover}
            element={
              <DiscoverPage
                skills={discoverSkills}
                selectedSkillId={selectedDiscoverSkillId}
                selectedSkill={selectedSkill}
                selectedFile={selectedFile}
                onSelectSkill={(skill) => {
                  setSelectedDiscoverSkillId(skill.id);
                  setSelectedFilePath(skill.files[0]?.path || '');
                }}
                onInstall={openInstallDialog}
              />
            }
          />
          <Route
            path={routePaths.local}
            element={
              <LocalPage
                skills={currentSkillList}
                selectedSkillId={selectedLibrarySkillId}
                selectedSkill={selectedSkill}
                selectedFile={selectedFile}
                selectedFilePath={selectedFilePath}
                favorites={favorites}
                onSelectSkill={(skill) => {
                  setSelectedLibrarySkillId(skill.id);
                  setSelectedFilePath(skill.files[0]?.path || '');
                }}
                onToggleFavorite={toggleFavorite}
                onReinstall={openInstallDialog}
                onSelectFile={handleFileSelect}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                editing={editing}
                draftValue={draftValue}
                onToggleEdit={() => setEditing((prev) => !prev)}
                onSave={handleSaveFile}
                onChangeDraft={updateDraft}
              />
            }
          />
          <Route
            path={routePaths.favorites}
            element={
              <FavoritesPage
                skills={currentSkillList}
                selectedSkillId={selectedLibrarySkillId}
                selectedSkill={selectedSkill}
                selectedFile={selectedFile}
                selectedFilePath={selectedFilePath}
                favorites={favorites}
                onSelectSkill={(skill) => {
                  setSelectedLibrarySkillId(skill.id);
                  setSelectedFilePath(skill.files[0]?.path || '');
                }}
                onToggleFavorite={toggleFavorite}
                onSelectFile={handleFileSelect}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                editing={editing}
                draftValue={draftValue}
                onToggleEdit={() => setEditing((prev) => !prev)}
                onSave={handleSaveFile}
                onChangeDraft={updateDraft}
              />
            }
          />
          <Route
            path={routePaths.agents}
            element={
              <AgentsPage
                skills={currentSkillList}
                selectedSkillId={selectedLibrarySkillId}
                selectedSkill={selectedSkill}
                selectedFile={selectedFile}
                selectedFilePath={selectedFilePath}
                favorites={favorites}
                currentAgentName={currentAgentName}
                installedSkillIds={installedSkillIds}
                onSelectSkill={(skill) => {
                  setSelectedLibrarySkillId(skill.id);
                  setSelectedFilePath(skill.files[0]?.path || '');
                }}
                onToggleFavorite={toggleFavorite}
                onInstallToggle={handleInstallToggle}
                onReinstall={openInstallDialog}
                onSelectFile={handleFileSelect}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                editing={editing}
                draftValue={draftValue}
                onToggleEdit={() => setEditing((prev) => !prev)}
                onSave={handleSaveFile}
                onChangeDraft={updateDraft}
              />
            }
          />
          <Route path="/" element={<Navigate to={routePaths.discover} replace />} />
        </Routes>
      </main>

      <InstallDialog
        open={dialogOpen}
        skill={dialogSkill}
        agents={agents}
        selectedAgents={dialogAgents}
        onToggleAgent={(id) => {
          setDialogAgents((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        conflict={installConflict}
        onOverwrite={() => confirmInstall(true)}
        onKeep={() => {
          setInstallConflict(false);
          setDialogOpen(false);
        }}
        onOpenSkillPath={openSkillLocation}
        onClose={() => setDialogOpen(false)}
        onConfirm={() => confirmInstall(false)}
      />
      <ThemeDialog
        open={themeDialogOpen}
        value={themeDraft}
        onChange={setThemeDraft}
        onConfirm={() => {
          setTheme(themeDraft);
          setThemeDialogOpen(false);
        }}
        onCancel={() => setThemeDialogOpen(false)}
      />
      <ApiKeyDialog
        open={apiKeyDialogOpen}
        value={apiKeyDraft}
        onChange={setApiKeyDraft}
        onConfirm={() => {
          setApiKey(apiKeyDraft);
          setApiKeyDialogOpen(false);
        }}
        onCancel={() => setApiKeyDialogOpen(false)}
      />
      <MigrationDialog
        open={migrationOpen}
        loading={migrationLoading}
        migrating={migrationSubmitting}
        installPath={installPath}
        skills={migrationSkills}
        selectedIds={migrationSelected}
        selectedSources={migrationSources}
        notice={migrationNotice}
        onToggleAll={toggleMigrationAll}
        onToggleSkill={toggleMigrationSkill}
        onSelectSource={selectMigrationSource}
        onConfirm={confirmMigration}
        onCancel={() => setMigrationOpen(false)}
      />
    </div>
  );
};

export default App;
