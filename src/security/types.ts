export type SecurityLevel =
  | 'safe'
  | 'suspicious'
  | 'dangerous';

export type ScanCoverage = 'complete' | 'partial' | 'incomplete';

export type SemanticDimension =
  | 'prompt_injection'
  | 'instruction_override'
  | 'authorization_bypass'
  | 'sensitive_data_access'
  | 'data_exfiltration'
  | 'destructive_actions'
  | 'privilege_escalation'
  | 'security_control_bypass'
  | 'persistence'
  | 'remote_code_execution'
  | 'unexpected_network_access'
  | 'remote_code_download'
  | 'stealth_behavior'
  | 'obfuscation'
  | 'scope_expansion'
  | 'behavior_description_mismatch';

export type SemanticAssessment = {
  detected: boolean;
  confidence: number;
  evidence: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    quote: string;
  }>;
  reason: string;
};

export type SemanticAssessments = Record<SemanticDimension, SemanticAssessment>;

export type SemanticAnalysis =
  | { kind: 'rules'; reason: 'model-missing' | 'legacy-report' | 'no-semantic-corpus' }
  | {
      kind: 'model';
      modelId: 'qwen3.5-2b-q4_k_m';
      modelSha256: string;
      policyVersion: string;
    }
  | {
      kind: 'fallback';
      reason:
        | 'model-invalid'
        | 'load-failed'
        | 'inference-failed'
        | 'timeout'
        | 'schema-invalid'
        | 'evidence-invalid'
        | 'corpus-too-large'
        | 'corpus-changed';
    };

export type SecurityModelState =
  | { kind: 'missing'; modelId: 'qwen3.5-2b-q4_k_m' }
  | {
      kind: 'downloading';
      modelId: 'qwen3.5-2b-q4_k_m';
      source: 'download' | 'import';
      receivedBytes: number;
      totalBytes: number;
      percent: number;
    }
  | {
      kind: 'verifying';
      modelId: 'qwen3.5-2b-q4_k_m';
      source: 'download' | 'import' | 'existing';
    }
  | {
      kind: 'ready';
      modelId: 'qwen3.5-2b-q4_k_m';
      path: string;
      size: number;
      sha256: string;
      source: 'download' | 'import' | 'existing';
    }
  | {
      kind: 'error';
      modelId: 'qwen3.5-2b-q4_k_m';
      error: string;
    };

export type SecurityScanPhase =
  | 'idle'
  | 'inventory'
  | 'analyzing'
  | 'semantic'
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
  activeSkillIds?: string[];
  semanticChunkIndex: number;
  semanticChunkCount: number;
  semanticCompletedChunks?: number;
  semanticTotalChunks?: number;
  semanticInFlightChunks?: number;
  processedFiles: number;
  totalFiles: number;
  completedSkills: number;
  totalSkills: number;
  findingsCount: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  runtime?: {
    sequences: number;
    fileWorkers: number;
    gpuLayers?: number | string;
    batchSize?: number;
  } | null;
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
  detector: 'rule' | 'model';
  confidenceScore: number | null;
};

export type SecurityReportSummary = {
  id: string;
  libraryPath: string;
  skillId: string;
  name: string;
  rootPath: string;
  baseLevel: SecurityLevel;
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
  semanticAnalysis: SemanticAnalysis;
};

export type SecurityReport = SecurityReportSummary & {
  findings: SecurityFinding[];
  semanticAssessments: SemanticAssessments | null;
};

export type SecurityScanEvent =
  | { type: 'progress'; task: SecurityScanProgress }
  | { type: 'report-updated'; task: SecurityScanProgress; report: SecurityReportSummary }
  | { type: 'completed'; task: SecurityScanProgress }
  | { type: 'canceled'; task: SecurityScanProgress }
  | { type: 'error'; task: SecurityScanProgress; error?: string };
