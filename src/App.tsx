import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FolderOpenRegular, LinkRegular } from '@fluentui/react-icons';
import './App.css';
import type { Agent, Skill, SkillFile } from './types/models';
import { menuRoutes, routePaths } from './routes';
import { validateSkill } from './utils/skillUtils';
import Sidebar from './components/Sidebar';
import InstallDialog from './components/InstallDialog';
import ThemeDialog from './components/ThemeDialog';
import ApiKeyDialog from './components/ApiKeyDialog';
import DiscoverPage from './pages/DiscoverPage';
import LocalPage from './pages/LocalPage';
import FavoritesPage from './pages/FavoritesPage';
import AgentsPage from './pages/AgentsPage';

const INITIAL_AGENTS: Agent[] = [
  {
    id: 'claude',
    name: 'Claude',
    pathMac: '~/.claude/skills',
    pathWindows: '%USERPROFILE%\\.claude\\skills',
  },
  {
    id: 'codex',
    name: 'Codex',
    pathMac: '~/.codex/skills',
    pathWindows: '%USERPROFILE%\\.codex\\skills',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    pathMac: '~/.cursor/skills',
    pathWindows: '%USERPROFILE%\\.cursor\\skills',
  },
];

const SAMPLE_DISCOVER: Skill[] = [
  {
    id: 'service-guardian',
    name: 'Service Guardian',
    version: '1.0.3',
    description: '对 API 调用进行守护与重试策略编排。',
    author: 'SkillPkg Labs',
    tags: ['ops', 'api'],
    files: [
      {
        path: 'README.md',
        content: `# Service Guardian\n\n守护 API 稳定性。\n\n\`\`\`js\nexport const policy = { retries: 3 };\n\`\`\``,
      },
      {
        path: 'rules/policy.yaml',
        content: `retries: 3\nbackoff: exponential`,
      },
    ],
  },
  {
    id: 'release-pilot',
    name: 'Release Pilot',
    version: '0.8.0',
    description: '为发布流程提供检查清单与风险评估。',
    author: 'Studio Core',
    tags: ['release', 'qa'],
    files: [
      {
        path: 'README.md',
        content: `# Release Pilot\n\n发布流程自动化。\n\n- 检查清单\n- 风险评估`,
      },
      {
        path: 'checklists/prod.md',
        content: `# Production Checklist\n\n- 变更确认\n- 回滚策略`,
      },
    ],
  },
];

type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'skillpkg.theme';

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
  const [agents] = useState(INITIAL_AGENTS);
  const [discoverSkills] = useState(SAMPLE_DISCOVER);
  const [localSkills, setLocalSkills] = useState<Skill[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedAgentId, setSelectedAgentId] = useState('claude');
  const [selectedDiscoverSkillId, setSelectedDiscoverSkillId] = useState(
    SAMPLE_DISCOVER[0]?.id || ''
  );
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
  const [editing, setEditing] = useState(false);
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState<ThemeMode>(theme);
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey);

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

  const loadLocalSkills = useCallback(async (path: string) => {
    if (!path) return;
    if (!window?.skillpkg?.loadSkills) {
      setNotice('当前环境不支持读取本地路径。');
      return;
    }
    const skills = await window.skillpkg.loadSkills(path);
    setLocalSkills(skills);
  }, []);

  useEffect(() => {
    const savedPath = window?.localStorage?.getItem('skillpkg.installPath');
    if (savedPath) {
      setInstallPath(savedPath);
    }
  }, []);

  useEffect(() => {
    if (!document?.body) return;
    document.body.dataset.theme = theme;
    window?.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const openThemeDialog = () => {
    setThemeDraft(theme);
    setThemeDialogOpen(true);
    setSettingsOpen(false);
  };

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
      if (agentId) setSelectedAgentId(agentId);
    } else if (path.startsWith('/favorites')) {
      setActiveSection('favorites');
    } else if (path.startsWith('/local')) {
      setActiveSection('local');
    } else {
      setActiveSection('discover');
    }
  }, [location.pathname]);

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
    const allAgents = new Set(agents.map((agent) => agent.id));
    setDialogAgents(allAgents);
    setDialogSkill(skill);
    setDialogOpen(true);
  };

  const confirmInstall = async () => {
    if (!dialogSkill) return;
    if (!installPath) {
      setNotice('请先设置统一路径。');
      return;
    }
    if (!window?.skillpkg?.installSkill) {
      setNotice('当前环境不支持安装 Skill。');
      return;
    }
    await window.skillpkg.installSkill({ installPath, skill: dialogSkill });
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
        theme={theme}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((prev) => !prev)}
        onOpenTheme={openThemeDialog}
        onOpenApiKey={openApiKeyDialog}
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
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
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
        onClose={() => setDialogOpen(false)}
        onConfirm={confirmInstall}
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
    </div>
  );
};

export default App;
