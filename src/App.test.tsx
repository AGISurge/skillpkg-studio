import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { HashRouter } from 'react-router-dom';
import App from './App';
import ImportSkillDropdown from './components/ImportSkillDropdown';
import SkillDeleteConfirmDialog from './components/SkillDeleteConfirmDialog';
import SkillsPage from './pages/SkillsPage';
import type { Skill } from './types/models';

beforeEach(() => {
  window.localStorage.clear();
});

// 验证应用外壳是否渲染成功。
test('renders app shell', async () => {
  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
  } as unknown as typeof window.skillpkg;
  render(
    <HashRouter>
      <App />
    </HashRouter>
  );
  await waitFor(() => {
    expect(screen.getByText(/SkillPkg Studio/i)).toBeInTheDocument();
  });
});

test('shows discover api key prompt when no api key is configured', async () => {
  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
  } as unknown as typeof window.skillpkg;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  expect(await screen.findByText('请先在设置页配置 SkillPKG API Key。')).toBeInTheDocument();
});

test('does not search discovery list while Chinese IME composition is active', async () => {
  window.localStorage.setItem('skillpkg.apiKey', 'test-key');
  const listSkillpkgSkills = jest.fn(async () => ({
    ok: true,
    docs: [],
    meta: {
      totalDocs: 0,
      totalPages: 1,
      page: 1,
      limit: 20,
    },
  }));

  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
    listSkillpkgCategories: async () => ({ ok: true, categories: [] }),
    listSkillpkgSkills,
  } as unknown as typeof window.skillpkg;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  const input = await screen.findByLabelText('搜索 Skill');
  await waitFor(() => {
    expect(listSkillpkgSkills).toHaveBeenCalledWith(expect.objectContaining({ q: '' }));
  });
  listSkillpkgSkills.mockClear();

  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'zhong' } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(listSkillpkgSkills).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: '中' } });
  fireEvent.compositionEnd(input);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(listSkillpkgSkills).toHaveBeenCalledWith(expect.objectContaining({ q: '中' }));
});

test('renders import skill source menu', () => {
  const onSelect = jest.fn();
  render(<ImportSkillDropdown status="idle" onSelect={onSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /导入 Skill/i }));

  expect(screen.getByText('本地 zip 文件')).toBeInTheDocument();
  expect(screen.getByText('Git 仓库地址')).toBeInTheDocument();
  expect(screen.queryByText('skills.sh URL')).not.toBeInTheDocument();
});

const baseSkill: Skill = {
  id: 'demo',
  name: 'Demo Skill',
  version: '1.0.0',
  description: 'Demo description',
  author: '',
  tags: [],
  files: [{ path: 'SKILL.md', content: '# Demo' }],
};

const renderSkillsPage = (skill: Skill, props: Partial<ComponentProps<typeof SkillsPage>> = {}) => {
  render(
    <SkillsPage
      skills={[skill]}
      selectedSkillId={skill.id}
      selectedSkill={skill}
      selectedFile={skill.files[0]}
      selectedFilePath="SKILL.md"
      favorites={new Set()}
      mode="agents"
      onSelectSkill={jest.fn()}
      onToggleFavorite={jest.fn()}
      onSelectFile={jest.fn()}
      expandedFolders={new Set()}
      onToggleFolder={jest.fn()}
      editing={false}
      draftValue={undefined}
      onStartEdit={jest.fn()}
      onSave={jest.fn()}
      onCancelEdit={jest.fn()}
      onChangeDraft={jest.fn()}
      {...props}
    />,
  );
};

test('agent managed skill uses uninstall action before deletion confirmation', () => {
  const onDeleteSkill = jest.fn();
  const onInstallToggle = jest.fn();

  renderSkillsPage(
    { ...baseSkill, managed: true, source: 'managed', agentId: 'claude' },
    {
      installedSkillIds: new Set(['demo']),
      onDeleteSkill,
      onInstallToggle,
    },
  );

  fireEvent.click(screen.getByRole('button', { name: '卸载' }));

  expect(onDeleteSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo' }));
  expect(onInstallToggle).not.toHaveBeenCalled();
});

test('agent unmanaged skill keeps host action and adds delete action', () => {
  const onDeleteSkill = jest.fn();
  const onInstallToggle = jest.fn();

  renderSkillsPage(
    { ...baseSkill, managed: false, source: 'agent', agentId: 'claude' },
    {
      onDeleteSkill,
      onInstallToggle,
    },
  );

  fireEvent.click(screen.getByRole('button', { name: '托管' }));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  expect(onInstallToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo' }));
  expect(onDeleteSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo' }));
});

test('local delete confirmation lists agents using the skill', () => {
  render(
    <SkillDeleteConfirmDialog
      state={{
        action: 'library-delete',
        skill: baseSkill,
        hostedAgentNames: ['Claude', 'Codex'],
      }}
      onClose={jest.fn()}
      onConfirm={jest.fn()}
    />,
  );

  expect(screen.getByText('确认删除本地 Skill')).toBeInTheDocument();
  expect(screen.getByText('同时会从以下 Agents 中卸载：')).toBeInTheDocument();
  expect(screen.getByText('Claude')).toBeInTheDocument();
  expect(screen.getByText('Codex')).toBeInTheDocument();
});

test('selecting a new install path opens migration confirmation before changing path', async () => {
  window.location.hash = '#/settings';
  window.localStorage.setItem('skillpkg.installPath', '/tmp/old-skills');
  const migrateInstallPath = jest.fn(async () => ({
    ok: true,
    migratedCount: 2,
    relinkedCount: 1,
    conflicts: [],
  }));
  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
    selectInstallPath: async () => '/tmp/new-skills',
    prepareInstallPathChange: async () => ({
      ok: true,
      migratedCount: 2,
      relinkedCount: 1,
      conflicts: [],
    }),
    migrateInstallPath,
  } as unknown as typeof window.skillpkg;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  await screen.findByText('/tmp/old-skills');
  fireEvent.click(await screen.findByRole('button', { name: /选择文件夹/i }));

  expect(await screen.findByText('确认切换存放路径')).toBeInTheDocument();
  expect(screen.getAllByText('/tmp/old-skills').length).toBeGreaterThan(0);
  expect(screen.getByText('/tmp/new-skills')).toBeInTheDocument();
  expect(migrateInstallPath).not.toHaveBeenCalled();
});

test('canceling install path migration keeps current path', async () => {
  window.location.hash = '#/settings';
  window.localStorage.setItem('skillpkg.installPath', '/tmp/old-skills');
  const migrateInstallPath = jest.fn();
  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
    selectInstallPath: async () => '/tmp/new-skills',
    prepareInstallPathChange: async () => ({
      ok: true,
      migratedCount: 1,
      relinkedCount: 0,
      conflicts: [],
    }),
    migrateInstallPath,
  } as unknown as typeof window.skillpkg;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  await screen.findByText('/tmp/old-skills');
  fireEvent.click(await screen.findByRole('button', { name: /选择文件夹/i }));
  fireEvent.click(await screen.findByRole('button', { name: '取消' }));

  expect(migrateInstallPath).not.toHaveBeenCalled();
  expect(screen.getByText('/tmp/old-skills')).toBeInTheDocument();
  expect(screen.queryByText('确认切换存放路径')).not.toBeInTheDocument();
});

test('confirming install path migration updates the settings path', async () => {
  window.location.hash = '#/settings';
  window.localStorage.setItem('skillpkg.installPath', '/tmp/old-skills');
  const migrateInstallPath = jest.fn(async () => ({
    ok: true,
    migratedCount: 2,
    relinkedCount: 1,
    conflicts: [],
  }));
  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
    selectInstallPath: async () => '/tmp/new-skills',
    prepareInstallPathChange: async () => ({
      ok: true,
      migratedCount: 2,
      relinkedCount: 1,
      conflicts: [],
    }),
    migrateInstallPath,
  } as unknown as typeof window.skillpkg;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  await screen.findByText('/tmp/old-skills');
  fireEvent.click(await screen.findByRole('button', { name: /选择文件夹/i }));
  fireEvent.click(await screen.findByRole('button', { name: '确认迁移' }));

  await waitFor(() => expect(migrateInstallPath).toHaveBeenCalled());
  expect(await screen.findByText('/tmp/new-skills')).toBeInTheDocument();
  expect(await screen.findByText('已迁移 2 个 Skill，并更新 1 个 Agent 链接。')).toBeInTheDocument();
});

test('invalid install path selection shows validation notice', async () => {
  window.location.hash = '#/settings';
  window.localStorage.setItem('skillpkg.installPath', '/tmp/old-skills');
  window.skillpkg = {
    detectAgents: async () => [],
    loadSkills: async () => [],
    selectInstallPath: async () => '/tmp/.claude',
    prepareInstallPathChange: async () => ({
      ok: false,
      reason: 'agent-directory',
      migratedCount: 0,
      relinkedCount: 0,
      conflicts: [],
    }),
  } as unknown as typeof window.skillpkg;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  await screen.findByText('/tmp/old-skills');
  fireEvent.click(await screen.findByRole('button', { name: /选择文件夹/i }));

  expect(await screen.findByText('不能将 Agent 自己的目录设置为统一路径。')).toBeInTheDocument();
  expect(screen.queryByText('确认切换存放路径')).not.toBeInTheDocument();
});
