import { render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import App from './App';

test('renders app shell', () => {
  render(
    <HashRouter>
      <App />
    </HashRouter>
  );
  expect(screen.getByText(/SkillPkg Studio/i)).toBeInTheDocument();
});
