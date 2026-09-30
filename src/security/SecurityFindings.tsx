import type { SecurityFinding, SecurityLevel } from './types';

export const levelMeta: Record<SecurityLevel, { label: string; rank: number }> = {
  dangerous: { label: '危险', rank: 0 }, suspicious: { label: '可疑', rank: 1 }, safe: { label: '安全', rank: 2 },
};
export const coverageLabel = { complete: '完整', partial: '部分', incomplete: '不完整' };
const severityLabel = { critical: '危险', high: '高', medium: '中', low: '低', info: '提示' };
const confidenceLabel = { high: '高', medium: '中', low: '低' };

export const LevelBadge = ({ level, partial }: { level: SecurityLevel; partial?: boolean }) => (
  <span className={`security-level security-level-${level}`}>
    {levelMeta[level].label}{partial ? ' · 扫描不完整' : ''}
  </span>
);

export const SecurityFindings = ({ findings }: { findings: SecurityFinding[] }) => (
  <div className="security-findings">
    {findings.map((finding) => (
      <article className="security-finding" key={finding.id || finding.fingerprint}>
        <div className="security-finding-title">
          <span className={`security-severity security-severity-${finding.severity}`}>{severityLabel[finding.severity]}</span>
          <strong>{finding.title}</strong>
        </div>
        <div className="security-finding-location">
          {finding.filePath || 'Skill 整体'}
          {finding.filePath ? `:${finding.startLine}:${finding.startColumn}` : ''}
          <span>
            {finding.category} · 置信度 {confidenceLabel[finding.confidence]}
            {finding.confidenceScore != null ? ` (${Math.round(finding.confidenceScore * 100)}%)` : ''}
            {' · '}{finding.detector === 'model' ? '智能判断' : '规则'}{' · '}{finding.ruleId}
          </span>
        </div>
        {finding.evidence ? <pre>{finding.evidence}</pre> : null}
        <p>{finding.message}</p>
        <div className="security-remediation"><strong>建议：</strong>{finding.remediation}</div>
      </article>
    ))}
  </div>
);
