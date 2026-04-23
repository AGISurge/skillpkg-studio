// 引入 Jest DOM 扩展断言。
import '@testing-library/jest-dom';
// 在测试环境中模拟 ESM 包，避免 Jest 解析失败。
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => {
    const ReactLocal = require('react');
    return ReactLocal.createElement('div', null, children);
  },
}));

jest.mock('rehype-highlight', () => ({
  __esModule: true,
  default: () => null,
}));

// 过滤 React Router 未来版本提示，避免测试输出噪声。
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const firstArg = typeof args[0] === 'string' ? args[0] : '';
  if (firstArg.includes('React Router Future Flag Warning')) return;
  originalWarn(...args);
};
