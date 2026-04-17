import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import {
  ArrowDownloadRegular,
  BoxRegular,
  CheckmarkCircleRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  CodeRegular,
  DismissCircleRegular,
  DocumentRegular,
  EditRegular,
  FolderOpenRegular,
  FolderRegular,
  KeyRegular,
  LinkRegular,
  PeopleRegular,
  SaveRegular,
  SearchRegular,
  SettingsRegular,
  StarFilled,
  StarRegular,
} from '@fluentui/react-icons';
import './App.css';

const MENU_ITEMS = [
  { id: 'discover', label: '发现', icon: SearchRegular },
  { id: 'local', label: '本机', icon: BoxRegular },
  { id: 'favorites', label: '收藏', icon: StarRegular },
  { id: 'agents', label: 'Agents', icon: PeopleRegular },
];

const INITIAL_AGENTS = [
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

const SAMPLE_SKILLS = [
  {
    id: 'focus-flow',
    name: 'Focus Flow',
    version: '1.2.0',
    description: '为编程任务提供节奏管理和番茄协作流程。',
    author: 'SkillPkg Labs',
    tags: ['productivity', 'workflow'],
    files: [
      {
        path: 'README.md',
        content: `# Focus Flow\n\n让 Agent 按节奏完成任务。\n\n## 功能\n\n- 自动拆解任务\n- 时段提醒\n- 汇总报告\n\n\`\`\`bash\nfocus start --session deep-work\n\`\`\`\n`,
      },
      {
        path: 'rules/manifest.json',
        content: `{"name":"focus-flow","version":"1.2.0","entry":"README.md"}`,
      },
      {
        path: 'prompts/start.md',
        content: `# Start\n\n请基于当前任务输出执行节奏。`,
      },
    ],
  },
  {
    id: 'repo-compass',
    name: 'Repo Compass',
    version: '0.9.4',
    description: '快速扫描仓库结构并生成导航策略。',
    author: 'Studio Core',
    tags: ['analysis', 'navigation'],
    files: [
      {
        path: 'README.md',
        content: `# Repo Compass\n\n聚焦仓库理解。\n\n## 使用方式\n\n1. 读取目录结构\n2. 找出关键模块\n3. 输出阅读路线\n`,
      },
      {
        path: 'playbooks/scan.md',
        content: `# Scan\n\n- 先扫描顶层目录\n- 再查找关键模块`,
      },
    ],
  },
  {
    id: 'design-sprint',
    name: 'Design Sprint',
    version: '2.1.1',
    description: '帮助 Agent 组织产品设计冲刺流程。',
    author: 'Studio Core',
    tags: ['design', 'product'],
    files: [
      {
        path: 'README.md',
        content: `# Design Sprint\n\n快速梳理产品的设计流程。\n\n\`\`\`json\n{"day":1,"task":"sketch"}\n\`\`\``,
      },
      {
        path: 'templates/brief.md',
        content: `# Brief\n\n- 目标\n- 受众\n- 约束`,
      },
    ],
  },
];

const SAMPLE_DISCOVER = [
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

const FILE_LANGUAGE_MAP = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  css: 'css',
  html: 'html',
  bash: 'bash',
};

const getExtension = (path) => {
  const segments = path.split('.');
  return segments.length > 1 ? segments[segments.length - 1].toLowerCase() : '';
};

const getLanguage = (path) => FILE_LANGUAGE_MAP[getExtension(path)] || 'plaintext';

const buildTree = (files) => {
  const root = { name: '', path: '', children: {}, type: 'folder' };
  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;
    parts.forEach((part, index) => {
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          children: {},
          type: index === parts.length - 1 ? 'file' : 'folder',
        };
      }
      current = current.children[part];
    });
  });
  return root;
};

const validateSkill = (skill) => {
  if (!skill || !skill.name || !skill.version) return false;
  if (!Array.isArray(skill.files) || skill.files.length === 0) return false;
  return skill.files.every((file) => file.path && typeof file.content === 'string');
};

function App() {
  const [activeSection, setActiveSection] = useState('discover');
  const [agents] = useState(INITIAL_AGENTS);
  const [discoverSkills] = useState(SAMPLE_DISCOVER);
  const [localSkills, setLocalSkills] = useState(SAMPLE_SKILLS);
  const [favorites, setFavorites] = useState(new Set(['focus-flow']));
  const [selectedAgentId, setSelectedAgentId] = useState('claude');
  const [selectedSkillId, setSelectedSkillId] = useState(SAMPLE_DISCOVER[0].id);
  const [selectedFilePath, setSelectedFilePath] = useState('README.md');
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [apiKey, setApiKey] = useState('');
  const [notice, setNotice] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSkill, setDialogSkill] = useState(null);
  const [dialogAgents, setDialogAgents] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [fileDrafts, setFileDrafts] = useState({});
  const fileInputRef = useRef(null);

  const [installedByAgent, setInstalledByAgent] = useState({
    claude: new Set(['focus-flow', 'repo-compass']),
    codex: new Set(['focus-flow']),
    cursor: new Set(['focus-flow', 'design-sprint']),
  });

  const currentSkillList = useMemo(() => {
    if (activeSection === 'discover') return discoverSkills;
    if (activeSection === 'favorites')
      return localSkills.filter((skill) => favorites.has(skill.id));
    return localSkills;
  }, [activeSection, discoverSkills, favorites, localSkills]);

  const selectedSkill = useMemo(() => {
    return (
      currentSkillList.find((skill) => skill.id === selectedSkillId) ||
      currentSkillList[0] ||
      null
    );
  }, [currentSkillList, selectedSkillId]);

  const selectedFile = useMemo(() => {
    if (!selectedSkill) return null;
    return (
      selectedSkill.files.find((file) => file.path === selectedFilePath) ||
      selectedSkill.files[0]
    );
  }, [selectedSkill, selectedFilePath]);

  const handleSectionChange = (id) => {
    setActiveSection(id);
    const list =
      id === 'discover'
        ? discoverSkills
        : id === 'favorites'
          ? localSkills.filter((skill) => favorites.has(skill.id))
          : localSkills;
    if (list[0]) {
      setSelectedSkillId(list[0].id);
      setSelectedFilePath(list[0].files[0]?.path || '');
    }
  };

  const toggleFavorite = (skillId) => {
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

  const openInstallDialog = (skill) => {
    if (!validateSkill(skill)) {
      setNotice('Skill 校验失败：缺少必要字段或文件。');
      return;
    }
    const allAgents = new Set(agents.map((agent) => agent.id));
    setDialogAgents(allAgents);
    setDialogSkill(skill);
    setDialogOpen(true);
  };

  const confirmInstall = () => {
    if (!dialogSkill) return;
    setLocalSkills((prev) => {
      if (prev.some((skill) => skill.id === dialogSkill.id)) return prev;
      return [...prev, dialogSkill];
    });
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

  const handleImportZip = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = file.name.replace(/\.zip$/i, '').toLowerCase().replace(/\s+/g, '-');
    const importedSkill = {
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

  const handleInstallToggle = (skillId) => {
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

  const handleFileSelect = (path) => {
    setSelectedFilePath(path);
    setEditing(false);
  };

  const updateDraft = (value) => {
    if (!selectedSkill || !selectedFile) return;
    const key = `${selectedSkill.id}::${selectedFile.path}`;
    setFileDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveFile = () => {
    if (!selectedSkill || !selectedFile) return;
    const key = `${selectedSkill.id}::${selectedFile.path}`;
    const draft = fileDrafts[key];
    if (draft === undefined) return;
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

  const renderTree = (node, depth = 0) => {
    const entries = Object.values(node.children).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    return entries.map((entry) => {
      const isExpanded = expandedFolders.has(entry.path);
      const isActive = entry.path === selectedFilePath;
      if (entry.type === 'folder') {
        return (
          <div key={entry.path} className="tree-node" style={{ paddingLeft: depth * 12 }}>
            <button
              type="button"
              className="tree-item"
              onClick={() => {
                setExpandedFolders((prev) => {
                  const next = new Set(prev);
                  if (next.has(entry.path)) next.delete(entry.path);
                  else next.add(entry.path);
                  return next;
                });
              }}
            >
              {isExpanded ? (
                <ChevronDownRegular className="icon" />
              ) : (
                <ChevronRightRegular className="icon" />
              )}
              <FolderRegular className="icon" />
              <span>{entry.name}</span>
            </button>
            {isExpanded && renderTree(entry, depth + 1)}
          </div>
        );
      }
      return (
        <div key={entry.path} className="tree-node" style={{ paddingLeft: depth * 12 }}>
          <button
            type="button"
            className={`tree-item ${isActive ? 'active' : ''}`}
            onClick={() => handleFileSelect(entry.path)}
          >
            <DocumentRegular className="icon" />
            <span>{entry.name}</span>
          </button>
        </div>
      );
    });
  };

  const fileKey = selectedSkill && selectedFile ? `${selectedSkill.id}::${selectedFile.path}` : '';
  const draftValue = fileKey ? fileDrafts[fileKey] : undefined;
  const displayedContent = selectedFile ? draftValue ?? selectedFile.content : '';
  const isMarkdown = selectedFile ? getExtension(selectedFile.path) === 'md' : false;
  const language = selectedFile ? getLanguage(selectedFile.path) : 'plaintext';
  const markdownContent = selectedFile
    ? isMarkdown
      ? displayedContent
      : `\`\`\`${language}\n${displayedContent}\n\`\`\``
    : '';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">SP</div>
          <div>
            <div className="brand-title">SkillPkg Studio</div>
            <div className="brand-subtitle">Electron + React</div>
          </div>
        </div>
        <nav className="menu">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={`menu-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => handleSectionChange(item.id)}
              >
                <Icon className="icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="status-card">
            <div className="status-title">本地技能库</div>
            <div className="status-row">
              <span>{localSkills.length} Skills</span>
              <span>{agents.length} Agents</span>
            </div>
            <div className="status-row muted">统一路径已准备</div>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <div className="page-title">
              {MENU_ITEMS.find((item) => item.id === activeSection)?.label}
            </div>
            <div className="page-subtitle">SkillPkg 管理与分发中心</div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpenRegular className="icon" />
              导入 Zip
            </button>
            <button type="button" className="btn primary">
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

        {activeSection === 'discover' && (
          <section className="panel-grid fade-in">
            <div className="panel list">
              <div className="panel-header">
                <div>
                  <div className="panel-title">发现技能</div>
                  <div className="panel-subtitle">连接 SkillPkg 市集</div>
                </div>
                <div className="panel-actions">
                  <div className="field">
                    <KeyRegular className="icon" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="输入 API Key"
                    />
                  </div>
                </div>
              </div>
              <div className="skill-list">
                {discoverSkills.map((skill) => (
                  <button
                    type="button"
                    key={skill.id}
                    className={`skill-card ${selectedSkillId === skill.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSkillId(skill.id);
                      setSelectedFilePath(skill.files[0]?.path || '');
                    }}
                  >
                    <div className="skill-card-header">
                      <div>
                        <div className="skill-title">{skill.name}</div>
                        <div className="skill-version">v{skill.version}</div>
                      </div>
                      <div className="pill">远程</div>
                    </div>
                    <p>{skill.description}</p>
                    <div className="skill-meta">
                      <span>{skill.author}</span>
                      <span>{skill.tags.join(' · ')}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel detail">
              {selectedSkill ? (
                <>
                  <div className="detail-header">
                    <div>
                      <div className="detail-title">{selectedSkill.name}</div>
                      <div className="detail-subtitle">{selectedSkill.description}</div>
                    </div>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => openInstallDialog(selectedSkill)}
                    >
                      <ArrowDownloadRegular className="icon" />
                      安装到本机
                    </button>
                  </div>
                  <div className="detail-meta">
                    <div>
                      <span className="label">作者</span>
                      <span>{selectedSkill.author}</span>
                    </div>
                    <div>
                      <span className="label">标签</span>
                      <span>{selectedSkill.tags.join(', ')}</span>
                    </div>
                    <div>
                      <span className="label">版本</span>
                      <span>{selectedSkill.version}</span>
                    </div>
                  </div>
                  <div className="detail-section">
                    <div className="section-title">内容预览</div>
                    <div className="preview">
                      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{
                        markdownContent
                      }</ReactMarkdown>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">暂无可展示的 Skill。</div>
              )}
            </div>
          </section>
        )}

        {activeSection !== 'discover' && (
          <section className="panel-grid fade-in">
            <div className="panel list">
              {activeSection === 'agents' && (
                <div className="agent-tabs">
                  {agents.map((agent) => (
                    <button
                      type="button"
                      key={agent.id}
                      className={`tab ${selectedAgentId === agent.id ? 'active' : ''}`}
                      onClick={() => setSelectedAgentId(agent.id)}
                    >
                      {agent.name}
                      <span className="tab-count">
                        {installedByAgent[agent.id]?.size || 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="panel-header">
                <div>
                  <div className="panel-title">
                    {activeSection === 'favorites' ? '收藏技能' : '本地技能库'}
                  </div>
                  <div className="panel-subtitle">
                    {activeSection === 'agents'
                      ? `当前 Agent：${
                          agents.find((agent) => agent.id === selectedAgentId)?.name
                        }`
                      : '统一存放于本地路径'}
                  </div>
                </div>
              </div>
              <div className="skill-list">
                {currentSkillList.map((skill) => {
                  const isInstalled =
                    activeSection === 'agents'
                      ? installedByAgent[selectedAgentId]?.has(skill.id)
                      : true;
                  return (
                    <button
                      type="button"
                      key={skill.id}
                      className={`skill-card ${selectedSkillId === skill.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedSkillId(skill.id);
                        setSelectedFilePath(skill.files[0]?.path || '');
                      }}
                    >
                      <div className="skill-card-header">
                        <div>
                          <div className="skill-title">{skill.name}</div>
                          <div className="skill-version">v{skill.version}</div>
                        </div>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(skill.id);
                          }}
                        >
                          {favorites.has(skill.id) ? (
                            <StarFilled className="icon" />
                          ) : (
                            <StarRegular className="icon" />
                          )}
                        </button>
                      </div>
                      <p>{skill.description}</p>
                      <div className="skill-meta">
                        <span>{skill.author}</span>
                        {activeSection === 'agents' && (
                          <span className={`status ${isInstalled ? 'on' : 'off'}`}>
                            {isInstalled ? (
                              <>
                                <CheckmarkCircleRegular className="icon" /> 已安装
                              </>
                            ) : (
                              <>
                                <DismissCircleRegular className="icon" /> 未安装
                              </>
                            )}
                          </span>
                        )}
                      </div>
                      {activeSection === 'agents' && (
                        <button
                          type="button"
                          className={`btn ${isInstalled ? 'ghost' : 'primary'}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleInstallToggle(skill.id);
                          }}
                        >
                          <SettingsRegular className="icon" />
                          {isInstalled ? '卸载' : '安装'}
                        </button>
                      )}
                    </button>
                  );
                })}
                {currentSkillList.length === 0 && (
                  <div className="empty-state">当前列表为空。</div>
                )}
              </div>
            </div>
            <div className="panel detail">
              {selectedSkill ? (
                <>
                  <div className="detail-header">
                    <div>
                      <div className="detail-title">{selectedSkill.name}</div>
                      <div className="detail-subtitle">{selectedSkill.description}</div>
                    </div>
                    <div className="detail-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => toggleFavorite(selectedSkill.id)}
                      >
                        {favorites.has(selectedSkill.id) ? (
                          <StarFilled className="icon" />
                        ) : (
                          <StarRegular className="icon" />
                        )}
                        收藏
                      </button>
                      {activeSection !== 'favorites' && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => openInstallDialog(selectedSkill)}
                        >
                          <ArrowDownloadRegular className="icon" />
                          重新安装
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="detail-body">
                    <div className="tree">
                      <div className="section-title">目录</div>
                      {renderTree(buildTree(selectedSkill.files))}
                    </div>
                    <div className="viewer">
                      <div className="viewer-header">
                        <div className="viewer-title">
                          <CodeRegular className="icon" />
                          {selectedFile?.path || '未选择文件'}
                        </div>
                        <div className="viewer-actions">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setEditing((prev) => !prev)}
                          >
                            <EditRegular className="icon" />
                            {editing ? '预览' : '编辑'}
                          </button>
                          <button
                            type="button"
                            className="btn primary"
                            onClick={handleSaveFile}
                            disabled={!editing}
                          >
                            <SaveRegular className="icon" />
                            保存
                          </button>
                        </div>
                      </div>
                      <div className="viewer-content">
                        {editing ? (
                          <textarea
                            value={displayedContent}
                            onChange={(event) => updateDraft(event.target.value)}
                          />
                        ) : (
                          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{
                            markdownContent
                          }</ReactMarkdown>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">请选择一个 Skill 查看详情。</div>
              )}
            </div>
          </section>
        )}
      </main>

      {dialogOpen && dialogSkill && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <div className="dialog-header">
              <div>
                <div className="dialog-title">确认安装</div>
                <div className="dialog-subtitle">
                  {dialogSkill.name} 将安装到以下 Agents
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setDialogOpen(false)}>
                <DismissCircleRegular className="icon" />
              </button>
            </div>
            <div className="dialog-body">
              {agents.map((agent) => (
                <label key={agent.id} className="dialog-option">
                  <input
                    type="checkbox"
                    checked={dialogAgents.has(agent.id)}
                    onChange={() => {
                      setDialogAgents((prev) => {
                        const next = new Set(prev);
                        if (next.has(agent.id)) next.delete(agent.id);
                        else next.add(agent.id);
                        return next;
                      });
                    }}
                  />
                  <div>
                    <div className="option-title">{agent.name}</div>
                    <div className="option-subtitle">
                      Mac: {agent.pathMac} · Windows: {agent.pathWindows}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn ghost" onClick={() => setDialogOpen(false)}>
                取消
              </button>
              <button type="button" className="btn primary" onClick={confirmInstall}>
                <CheckmarkCircleRegular className="icon" />
                确认安装
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
