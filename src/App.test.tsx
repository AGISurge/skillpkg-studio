import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('renders import skill source menu', () => {
  const onSelect = jest.fn();
  render(<ImportSkillDropdown status="idle" onSelect={onSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /导入 Skill/i }));

  expect(screen.getByText('本地 zip 文件')).toBeInTheDocument();
  expect(screen.getByText('Git 仓库地址')).toBeInTheDocument();
  expect(screen.getByText('skillpkg.com URL')).toBeInTheDocument();
  expect(screen.queryByText('skills.sh URL')).not.toBeInTheDocument();
});
