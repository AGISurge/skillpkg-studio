export type SecurityLevel =
  | 'safe'
  | 'review'
  | 'high-risk'
  | 'dangerous'
  | 'incomplete';

export type ScanCoverage = 'complete' | 'partial' | 'incomplete';

export type SecurityScanPhase =
  | 'idle'
  | 'inventory'
  | 'analyzing'
  | 'finalizing'
  | 'completed'
  | 'canceled'
  | 'error';

export type SecurityScanStatus =
  | 'idle'
  | 'scanning'
  | 'completed'
  | 'canceled'
  | 'error';

export type SecurityScanProgress = {
  id: string;
  libraryPath: string;
  mode: 'incremental' | 'full';
  status: SecurityScanStatus;
  phase: SecurityScanPhase;
  percent: number;
  currentSkillId: string;
  currentSkillName: string;
  currentFile: string;
  processedFiles: number;
  totalFiles: number;
  completedSkills: number;
  totalSkills: number;
  findingsCount: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

export type SecurityFinding = {
  id?: string;
  fingerprint: string;
  ruleId: string;
  title: string;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  evidence: string;
  message: string;
  remediation: string;
  features: string[];
  fileDigest: string;
  policyVersion: string;
  analyzerVersion: string;
  scannerVersion: string;
};

export type SecurityReportSummary = {
  id: string;
  libraryPath: string;
  skillId: string;
  name: string;
  rootPath: string;
  baseLevel: Exclude<SecurityLevel, 'incomplete'>;
  effectiveLevel: SecurityLevel;
  coverage: ScanCoverage;
  findingCount: number;
  severityCounts: Record<string, number>;
  digest: string;
  policyVersion: string;
  analyzerVersion: string;
  scannerVersion: string;
  scannedAt: string;
  runId: string;
};

export type SecurityReport = SecurityReportSummary & {
  findings: SecurityFinding[];
};

export type SecurityScanEvent =
  | { type: 'progress'; task: SecurityScanProgress }
  | { type: 'report-updated'; task: SecurityScanProgress; report: SecurityReportSummary }
  | { type: 'completed'; task: SecurityScanProgress }
  | { type: 'canceled'; task: SecurityScanProgress }
  | { type: 'error'; task: SecurityScanProgress; error?: string };
