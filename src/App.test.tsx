import { render, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import App from './App';

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
