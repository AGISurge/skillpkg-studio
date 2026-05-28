import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import App from './App';
import ImportSkillDropdown from './components/ImportSkillDropdown';

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
