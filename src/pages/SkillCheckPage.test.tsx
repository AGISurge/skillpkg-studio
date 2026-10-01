import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SkillCheckPage from './SkillCheckPage';
import type { SkillCheckSource, SkillCheckState } from '../security/skillCheckTypes';
import type { SecurityFinding, SecurityReport } from '../security/types';

const finding: SecurityFinding = {
  fingerprint: 'download', ruleId: 'SCRIPT_DOWNLOAD_EXECUTE', title: '下载并立即执行',
  category: 'malware-pattern', severity: 'critical', confidence: 'high', filePath: 'scripts/run.sh',
  startLine: 1, endLine: 1, startColumn: 1, endColumn: 40, evidence: 'curl https://example.test | sh',
  message: '直接执行远程内容', remediation: '先校验来源', features: [], fileDigest: '',
  policyVersion: '2.3.0', analyzerVersion: '2.2.0', scannerVersion: '1.0.0', detector: 'rule', confidenceScore: null,
};
const report: SecurityReport = {
  id: 'report', libraryPath: '/source', skillId: 'skill', name: 'Test Skill', rootPath: '/source',
  baseLevel: 'dangerous', effectiveLevel: 'dangerous', coverage: 'complete', findingCount: 1,
  severityCounts: { critical: 1 }, digest: '', policyVersion: '2.3.0', analyzerVersion: '2.2.0', scannerVersion: '1.0.0',
  scannedAt: '2026-09-30T00:00:00Z', runId: 'task', semanticAnalysis: { kind: 'rules', reason: 'model-missing' },
  semanticAssessments: null, findings: [finding],
};
const result: SkillCheckState = {
  task: { id: 'task', status: 'completed', phase: 'completed', percent: 100, processedFiles: 2, totalFiles: 2,
    currentFile: '', findingsCount: 1, startedAt: report.scannedAt, completedAt: report.scannedAt, error: null },
  sourceName: 'Test Skill', report,
  files: [
    { path: 'SKILL.md', kind: 'file', status: 'complete', level: 'safe', coverage: 'complete', findings: [] },
    { path: 'scripts/run.sh', kind: 'file', status: 'complete', level: 'dangerous', coverage: 'complete', findings: [finding] },
  ],
};
const empty: SkillCheckState = { task: null, sourceName: '', report: null, files: [] };
const single: SkillCheckSource = { sessionId: 'source', candidates: [{ id: 'candidate', name: 'Test Skill', relativePath: '' }] };
let current: SkillCheckState;
let listener: ((state: SkillCheckState) => void) | undefined;
const api = {
  getSkillCheckState: jest.fn(async () => current),
  onSkillCheckState: jest.fn((callback: (state: SkillCheckState) => void) => { listener = callback; return () => { listener = undefined; }; }),
  selectSkillCheckSource: jest.fn(async () => '/source'),
  prepareSkillCheckSource: jest.fn(async () => single),
  startSkillCheck: jest.fn(async () => result),
  discardSkillCheckSource: jest.fn(async () => {}),
  cancelSkillCheck: jest.fn(async () => ({ ok: true })),
  getDroppedFilePath: jest.fn(() => '/dropped'),
};
const choose = async (label = '选择文件夹') => {
  fireEvent.click(screen.getByRole('button', { name: '选择 Skill' }));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
  await waitFor(() => expect(api.prepareSkillCheckSource).toHaveBeenCalled());
};
beforeEach(() => {
  jest.clearAllMocks();
  current = empty;
  listener = undefined;
  api.getSkillCheckState.mockImplementation(async () => current);
  api.onSkillCheckState.mockImplementation((callback) => { listener = callback; return () => { listener = undefined; }; });
  api.selectSkillCheckSource.mockResolvedValue('/source');
  api.getDroppedFilePath.mockReturnValue('/dropped');
  api.discardSkillCheckSource.mockResolvedValue(undefined);
  api.cancelSkillCheck.mockResolvedValue({ ok: true });
  api.prepareSkillCheckSource.mockResolvedValue(single);
  api.startSkillCheck.mockResolvedValue(result);
  Object.defineProperty(window, 'skillpkg', { configurable: true, value: api });
});

test('selects a single source, starts automatically, and shows the riskiest file details', async () => {
  render(<SkillCheckPage />);
  await choose();
  await screen.findByText('下载并立即执行');
  expect(api.startSkillCheck).toHaveBeenCalledWith({ sessionId: 'source', candidateId: 'candidate' });
  expect(screen.getByRole('tree', { name: 'Skill 文件树' })).toBeInTheDocument();
  expect(screen.getByText('curl https://example.test | sh')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'SKILL.md 安全' }));
  expect(screen.queryByText('下载并立即执行')).not.toBeInTheDocument();
  expect(screen.getByText('当前检查范围内未发现安全问题')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'scripts' }));
  expect(screen.queryByRole('button', { name: 'run.sh 危险' })).not.toBeInTheDocument();
});

test('multi-Skill source selects exactly one and cancellation preserves the existing report', async () => {
  current = result;
  const multiple = { sessionId: 'multi', candidates: [{ id: 'a', name: 'Skill A', relativePath: 'a' }, { id: 'b', name: 'Skill B', relativePath: 'b' }] };
  api.prepareSkillCheckSource.mockResolvedValue(multiple);
  render(<SkillCheckPage />);
  await screen.findByText('下载并立即执行');
  await choose('选择 ZIP');
  expect(await screen.findByRole('dialog', { name: '选择要检查的 Skill' })).toBeInTheDocument();
  expect(api.startSkillCheck).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.discardSkillCheckSource).toHaveBeenCalledWith({ sessionId: 'multi' });
  expect(screen.getByText('下载并立即执行')).toBeInTheDocument();
  await choose();
  fireEvent.click(await screen.findByRole('radio', { name: 'Skill B b' }));
  fireEvent.click(screen.getByRole('button', { name: '开始检查' }));
  await waitFor(() => expect(api.startSkillCheck).toHaveBeenCalledWith({ sessionId: 'multi', candidateId: 'b' }));
});

test('shows semantic progress below 100% and keeps cancellation available', async () => {
  current = { ...result, report: null, task: result.task && { ...result.task, phase: 'semantic', status: 'scanning', completedAt: null, percent: 66, semanticProgress: { stage: 'generating', chunkIndex: 1, chunkCount: 2, completedDimensions: 8, totalDimensions: 16, generatedTokens: 500 } } };
  render(<SkillCheckPage />);
  expect(await screen.findByText('正在智能判断')).toBeInTheDocument();
  expect(screen.getByText('66%')).toBeInTheDocument();
  expect(screen.getByText('智能判断 1 / 2 · 已分析 8 / 16 项')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66');
  expect(screen.queryByText('扫描完成')).not.toBeInTheDocument();
  expect(within(screen.getByRole('tree')).queryByText('安全')).not.toBeInTheDocument();
  expect(within(screen.getByRole('tree')).queryByText('危险')).not.toBeInTheDocument();
  expect(screen.queryByText('当前检查范围内未发现安全问题')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '选择 Skill' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '取消扫描' }));
  await waitFor(() => expect(api.cancelSkillCheck).toHaveBeenCalledWith({ taskId: 'task' }));
});

test('keeps checked files unrated through semantic analysis and finalizing, then shows final ratings', async () => {
  const checkedFiles: SkillCheckState['files'] = result.files.map((file) =>
    file.status === 'complete' ? { ...file, status: 'checked' } : file);
  current = { ...result, report: null, files: checkedFiles,
    task: result.task && { ...result.task, phase: 'semantic', status: 'scanning', completedAt: null, percent: 66 } };
  const view = render(<SkillCheckPage />);
  await screen.findByText('正在智能判断');
  const tree = within(screen.getByRole('tree'));
  expect(tree.getAllByText('待评级')).toHaveLength(2);
  expect(tree.queryByText('危险')).not.toBeInTheDocument();
  expect(tree.queryByText('安全')).not.toBeInTheDocument();
  // Findings remain inspectable before the final file rating is available.
  expect(await screen.findByText('下载并立即执行')).toBeInTheDocument();
  expect(view.container.querySelector('.security-detail-header .security-level')).toBeNull();
  expect(screen.getByText(/最终评级将在扫描完成后确定/)).toBeInTheDocument();
  fireEvent.click(tree.getByRole('button', { name: 'SKILL.md 待评级' }));
  expect(screen.getByText('正在确定最终安全等级')).toBeInTheDocument();
  expect(screen.queryByText('当前检查范围内未发现安全问题')).not.toBeInTheDocument();
  act(() => listener?.({ ...current, report, task: current.task && { ...current.task, phase: 'finalizing', percent: 97 } }));
  expect(screen.getByText('正在汇总结果')).toBeInTheDocument();
  expect(tree.getAllByText('待评级')).toHaveLength(2);
  act(() => listener?.(result));
  expect(screen.getByText('扫描完成')).toBeInTheDocument();
  expect(tree.getByRole('button', { name: 'SKILL.md 安全' })).toBeInTheDocument();
  expect(tree.getByRole('button', { name: 'run.sh 危险' })).toBeInTheDocument();
  expect(screen.getByText('当前检查范围内未发现安全问题')).toBeInTheDocument();
});

test.each(['canceled', 'error'] as const)('retains incomplete checked results when the scan is %s', async (status) => {
  current = { ...result, report: { ...report, coverage: 'incomplete' },
    files: result.files.map((file) =>
      file.status === 'complete' ? { ...file, status: 'checked', coverage: 'incomplete' } : file),
    task: result.task && { ...result.task, phase: status, status, percent: 66 } };
  render(<SkillCheckPage />);
  await screen.findByText(status === 'canceled' ? '扫描已取消' : '扫描失败');
  const tree = within(screen.getByRole('tree'));
  expect(tree.getByRole('button', { name: 'run.sh 危险 · 扫描不完整' })).toBeInTheDocument();
  expect(tree.getByRole('button', { name: 'SKILL.md 安全 · 扫描不完整' })).toBeInTheDocument();
  expect(await screen.findByText('下载并立即执行')).toBeInTheDocument();
});

test('drops one source through the Electron path bridge and refuses multiple sources', async () => {
  const view = render(<SkillCheckPage />);
  const zone = screen.getByText('拖入 Skill 目录或 ZIP 包，开始安全检测');
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['a'], 'one.zip'), new File(['b'], 'two.zip')] } });
  expect(screen.getByRole('alert')).toHaveTextContent('请每次拖入一个文件夹或 ZIP');
  expect(api.prepareSkillCheckSource).not.toHaveBeenCalled();
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['zip'], 'one.zip')] } });
  await waitFor(() => expect(api.prepareSkillCheckSource).toHaveBeenCalledWith({ sourcePath: '/dropped' }));
  await screen.findByText('扫描完成');
  api.prepareSkillCheckSource.mockClear();
  fireEvent.drop(view.container.firstChild || view.container, { dataTransfer: { files: [new File(['zip'], 'two.zip')] } });
  expect(api.prepareSkillCheckSource).not.toHaveBeenCalled();
});

test('invalid replacement keeps the report, and remount reloads the session result', async () => {
  current = result;
  api.prepareSkillCheckSource.mockRejectedValueOnce(new Error('未找到 SKILL.md'));
  const view = render(<SkillCheckPage />);
  await screen.findByText('扫描完成');
  await choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('未找到 SKILL.md');
  expect(screen.getByText('下载并立即执行')).toBeInTheDocument();
  view.unmount();
  render(<SkillCheckPage />);
  expect(await screen.findByText('下载并立即执行')).toBeInTheDocument();
});

test('events supersede stale initial reads and global findings remain selectable', async () => {
  let resolveRead: ((value: SkillCheckState) => void) | undefined;
  api.getSkillCheckState.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
  render(<SkillCheckPage />);
  const globalFinding = { ...finding, fingerprint: 'global', filePath: '', title: '整体结构发现' };
  act(() => listener?.({ ...result, report: { ...report, findings: [finding, globalFinding], findingCount: 2 } }));
  act(() => resolveRead?.(empty));
  await screen.findByText('扫描完成');
  fireEvent.click(screen.getByRole('button', { name: 'Skill 整体 1 项发现' }));
  expect(screen.getByText('整体结构发现')).toBeInTheDocument();
  expect(screen.queryByText('下载并立即执行')).not.toBeInTheDocument();
});
