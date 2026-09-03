import { fireEvent, render, screen } from '@testing-library/react';
import { useAppContext } from '../AppContext';
import SettingsPage from './SettingsPage';
import type { AppUpdateState } from '../types/global';

jest.mock('../AppContext', () => ({
  useAppContext: jest.fn(),
}));

const mockedUseAppContext = useAppContext as jest.MockedFunction<typeof useAppContext>;

const createUpdateState = (
  patch: Partial<AppUpdateState> = {},
): AppUpdateState => ({
  enabled: true,
  platform: 'darwin',
  status: 'idle',
  source: 'automatic',
  currentVersion: '0.1.0',
  version: null,
  percent: 0,
  error: null,
  ...patch,
});

const renderSettings = (state: AppUpdateState) => {
  const checkAppUpdate = jest.fn(async () => undefined);
  const downloadAppUpdate = jest.fn(async () => undefined);
  const installAppUpdateNow = jest.fn(async () => undefined);

  mockedUseAppContext.mockReturnValue({
    theme: 'system',
    apiKey: '',
    installPath: '/tmp/skills',
    appUpdateState: state,
    setTheme: jest.fn(),
    setApiKey: jest.fn(),
    handleSelectInstallPath: jest.fn(async () => undefined),
    checkAppUpdate,
    downloadAppUpdate,
    installAppUpdateNow,
  } as unknown as ReturnType<typeof useAppContext>);

  const view = render(<SettingsPage />);
  return { ...view, checkAppUpdate, downloadAppUpdate, installAppUpdateNow };
};

beforeEach(() => {
  window.skillpkg = {
    getAppUpdateState: async () => createUpdateState(),
    checkAppUpdate: async () => createUpdateState({ source: 'manual' }),
    downloadAppUpdate: async () => createUpdateState({
      status: 'downloading',
      source: 'manual',
    }),
    installAppUpdateNow: async () => createUpdateState({ status: 'downloaded' }),
  } as unknown as typeof window.skillpkg;
});

test('shows the current version and manual update check entry', () => {
  const { checkAppUpdate } = renderSettings(createUpdateState());

  expect(screen.getByText('当前版本 v0.1.0')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '检测新版本' }));
  expect(checkAppUpdate).toHaveBeenCalledTimes(1);
});

test('disables the version action and shows activity while checking or downloading', () => {
  const { unmount } = renderSettings(createUpdateState({
    status: 'checking',
    source: 'manual',
  }));
  const checkingButton = screen.getByRole('button', { name: '正在检测' });
  expect(checkingButton).toBeDisabled();
  expect(checkingButton).toHaveAttribute('aria-busy', 'true');

  unmount();
  renderSettings(createUpdateState({
    status: 'downloading',
    source: 'manual',
    version: '1.1.0',
    percent: 42.4,
  }));
  const downloadingButton = screen.getByRole('button', { name: '下载中 42%' });
  expect(downloadingButton).toBeDisabled();
  expect(downloadingButton).toHaveAttribute('aria-busy', 'true');
});

test('shows inline results for no update and update failures', () => {
  const { unmount } = renderSettings(createUpdateState({
    status: 'not-available',
    source: 'manual',
  }));
  expect(screen.getByText('当前已是最新版本。')).toBeInTheDocument();
  unmount();

  const { checkAppUpdate } = renderSettings(createUpdateState({
    status: 'error',
    source: 'manual',
    error: 'network error',
  }));
  expect(screen.getByRole('alert')).toHaveTextContent('更新检测失败，请稍后重试。');
  fireEvent.click(screen.getByRole('button', { name: '重新检测' }));
  expect(checkAppUpdate).toHaveBeenCalledTimes(1);
});

test('downloads an available update from settings in manual mode', () => {
  const { downloadAppUpdate } = renderSettings(createUpdateState({
    status: 'available',
    version: '1.1.0',
  }));

  expect(screen.getByText('发现新版本 v1.1.0。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下载更新' }));
  expect(downloadAppUpdate).toHaveBeenCalledWith('manual');
});

test('restarts and installs a downloaded update from settings', () => {
  const { installAppUpdateNow } = renderSettings(createUpdateState({
    status: 'downloaded',
    version: '1.1.0',
    percent: 100,
  }));

  fireEvent.click(screen.getByRole('button', {
    name: 'v1.1.0已就绪，重启更新',
  }));
  expect(installAppUpdateNow).toHaveBeenCalledTimes(1);
});
