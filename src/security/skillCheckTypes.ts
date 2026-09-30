import type { SecurityFinding, SecurityLevel, SecurityReport, SecurityScanProgress, ScanCoverage } from './types';

export type SkillCheckSourceKind = 'folder' | 'zip';
export type SkillCheckSource = {
  sessionId: string;
  candidates: Array<{ id: string; name: string; relativePath: string }>;
};
export type SkillCheckFile = { path: string; kind: 'file' | 'link' } & (
  | { status: 'pending' | 'analyzing' }
  | { status: 'checked' | 'complete'; level: SecurityLevel; coverage: ScanCoverage; findings: SecurityFinding[] }
);
export type SkillCheckTask = Pick<SecurityScanProgress,
  'id' | 'status' | 'phase' | 'percent' | 'processedFiles' | 'totalFiles' | 'currentFile'
  | 'findingsCount' | 'startedAt' | 'completedAt' | 'error'
>;
export type SkillCheckState = {
  task: SkillCheckTask | null;
  sourceName: string;
  files: SkillCheckFile[];
  report: SecurityReport | null;
};
