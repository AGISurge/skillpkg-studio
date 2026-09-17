import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppContext } from '../AppContext';
import { useSecurityScan } from '../security/SecurityScanContext';
import type { SecurityReport, SecurityReportSummary, SemanticAssessments } from '../security/types';
import SecurityScanPage from './SecurityScanPage';

jest.mock('../AppContext', () => ({
  useAppContext: jest.fn(),
}));

jest.mock('../security/SecurityScanContext', () => ({
  useSecurityScan: jest.fn(),
}));

const mockedUseAppContext = useAppContext as jest.MockedFunction<typeof useAppContext>;
const mockedUseSecurityScan = useSecurityScan as jest.MockedFunction<typeof useSecurityScan>;

const summary: SecurityReportSummary = {
  id: 'danger-skill',
  libraryPath: '/tmp/skills',
  skillId: 'danger-skill',
  name: 'Danger Skill',
  rootPath: '/tmp/skills/danger-skill',
  baseLevel: 'dangerous',
  effectiveLevel: 'dangerous',
  coverage: 'partial',
  findingCount: 1,
  severityCounts: { critical: 1 },
  digest: 'abc',
  policyVersion: '1.0.0',
  analyzerVersion: '1.0.0',
  scannerVersion: '1.0.0',
  scannedAt: '2026-09-16T00:00:00.000Z',
  runId: 'task-1',
  semanticAnalysis: { kind: 'rules', reason: 'model-missing' },
};

const report: SecurityReport = {
  ...summary,
  findings: [{
    id: 'finding-1',
    fingerprint: 'fingerprint',
    ruleId: 'SCRIPT_DOWNLOAD_EXECUTE',
    title: '下载并立即执行',
    category: 'malware-pattern',
    severity: 'critical',
    confidence: 'high',
    filePath: 'scripts/run.sh',
    startLine: 4,
    startColumn: 1,
    endLine: 4,
    endColumn: 12,
    evidence: 'curl [REDACTED] | sh',
    message: '脚本将下载内容直接交给解释器执行。',
    remediation: '先保存并校验固定摘要。',
    features: ['download', 'execute'],
    fileDigest: 'def',
    policyVersion: '1.0.0',
    analyzerVersion: '1.0.0',
    scannerVersion: '1.0.0',
    detector: 'rule',
    confidenceScore: null,
  }],
  semanticAssessments: null,
};

test('shows live progress, risk level, and finding details', async () => {
  const startScan = jest.fn(async () => undefined);
  const cancelScan = jest.fn(async () => undefined);
  const loadReport = jest.fn(async () => report);
  mockedUseAppContext.mockReturnValue({
    installPath: '/tmp/skills',
    localSkills: [{
      id: 'danger-skill',
      name: 'Danger Skill',
      version: '1.0.0',
      description: '',
      author: '',
      tags: [],
      files: [],
    }],
  } as unknown as ReturnType<typeof useAppContext>);
  mockedUseSecurityScan.mockReturnValue({
    task: {
      id: 'task-1',
      libraryPath: '/tmp/skills',
      mode: 'incremental',
      status: 'scanning',
      phase: 'analyzing',
      percent: 42,
      currentSkillId: 'danger-skill',
      currentSkillName: 'Danger Skill',
      currentFile: 'scripts/run.sh',
      semanticChunkIndex: 0,
      semanticChunkCount: 0,
      processedFiles: 4,
      totalFiles: 10,
      completedSkills: 0,
      totalSkills: 1,
      findingsCount: 1,
      startedAt: '2026-09-16T00:00:00.000Z',
      completedAt: null,
      error: null,
    },
    reports: [summary],
    loading: false,
    error: '',
    startScan,
    cancelScan,
    loadReport,
    refresh: jest.fn(async () => undefined),
  } as unknown as ReturnType<typeof useSecurityScan>);

  render(<SecurityScanPage />);

  expect(screen.getByText('正在扫描：Danger Skill / scripts/run.sh')).toBeInTheDocument();
  expect(screen.getByLabelText('扫描进度 42%')).toBeInTheDocument();
  expect(screen.getByText('文件 4 / 10')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /取消扫描/ })).toBeInTheDocument();
  expect(startScan).not.toHaveBeenCalled();

  await waitFor(() => expect(loadReport).toHaveBeenCalledWith('danger-skill'));
  expect(await screen.findByText('下载并立即执行')).toBeInTheDocument();
  expect(screen.getByText('scripts/run.sh:4:1')).toBeInTheDocument();
  expect(screen.getAllByText('危险 · 扫描不完整')).not.toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: /取消扫描/ }));
  expect(cancelScan).toHaveBeenCalledTimes(1);
});

test('waits for the user before starting the first scan', () => {
  const startScan = jest.fn(async () => undefined);
  mockedUseAppContext.mockReturnValue({
    installPath: '/tmp/skills',
    localSkills: [],
  } as unknown as ReturnType<typeof useAppContext>);
  mockedUseSecurityScan.mockReturnValue({
    task: null,
    reports: [],
    loading: false,
    error: '',
    startScan,
    cancelScan: jest.fn(async () => undefined),
    loadReport: jest.fn(async () => null),
    refresh: jest.fn(async () => undefined),
  } as unknown as ReturnType<typeof useSecurityScan>);

  render(<SecurityScanPage />);

  expect(startScan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /开始安全扫描/ }));
  expect(startScan).toHaveBeenCalledWith('incremental');
});

test('shows all model dimensions only for a successful semantic analysis', async () => {
  const miss = () => ({ detected: false, confidence: 0.1, evidence: [], reason: '' });
  const semanticAssessments: SemanticAssessments = {
    prompt_injection: { detected: true, confidence: 0.9, evidence: [], reason: '' },
    instruction_override: miss(),
    authorization_bypass: miss(),
    sensitive_data_access: miss(),
    data_exfiltration: miss(),
    destructive_actions: miss(),
    privilege_escalation: miss(),
    security_control_bypass: miss(),
    persistence: miss(),
    remote_code_execution: miss(),
    unexpected_network_access: miss(),
    remote_code_download: miss(),
    stealth_behavior: miss(),
    obfuscation: miss(),
    scope_expansion: miss(),
    behavior_description_mismatch: miss(),
  };
  const modelSummary: SecurityReportSummary = {
    ...summary,
    semanticAnalysis: {
      kind: 'model',
      modelId: 'qwen3.5-2b-q4_k_m',
      modelSha256: 'model-sha',
      policyVersion: '1.0.0',
    },
  };
  mockedUseAppContext.mockReturnValue({
    installPath: '/tmp/skills',
    localSkills: [{
      id: 'danger-skill',
      name: 'Danger Skill',
      version: '1.0.0',
      description: '',
      author: '',
      tags: [],
      files: [],
    }],
  } as unknown as ReturnType<typeof useAppContext>);
  mockedUseSecurityScan.mockReturnValue({
    task: null,
    reports: [modelSummary],
    loading: false,
    error: '',
    startScan: jest.fn(async () => undefined),
    cancelScan: jest.fn(async () => undefined),
    loadReport: jest.fn(async () => ({
      ...report,
      ...modelSummary,
      semanticAssessments,
    })),
    refresh: jest.fn(async () => undefined),
  });

  render(<SecurityScanPage />);

  expect(await screen.findByText('智能语义 + 确定性检查')).toBeInTheDocument();
  expect(screen.getByText('查看 16 项智能判断')).toBeInTheDocument();
  expect(screen.getByText('提示词注入')).toBeInTheDocument();
  expect(screen.getAllByText(/未命中/)).toHaveLength(15);
});
