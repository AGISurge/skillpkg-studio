import {
  ArrowClockwiseRegular,
  DismissCircleRegular,
  ShieldCheckmarkRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../AppContext';
import { Button } from '../components/ui/button';
import { useSecurityScan } from '../security/SecurityScanContext';
import type {
  SecurityFinding,
  SecurityLevel,
  SecurityReport,
  SecurityReportSummary,
  SemanticAssessment,
  SemanticDimension,
} from '../security/types';

const levelMeta: Record<SecurityLevel, { label: string; rank: number }> = {
  dangerous: { label: '危险', rank: 0 },
  suspicious: { label: '可疑', rank: 1 },
  safe: { label: '安全', rank: 2 },
};

const phaseLabel: Record<string, string> = {
  idle: '等待扫描',
  inventory: '正在清点文件',
  analyzing: '正在分析安全风险',
  semantic: '正在进行智能语义判断',
  finalizing: '正在汇总结果',
  completed: '扫描完成',
  canceled: '扫描已取消',
  error: '扫描失败',
};

const severityLabel: Record<SecurityFinding['severity'], string> = {
  critical: '危险',
  high: '高',
  medium: '中',
  low: '低',
  info: '提示',
};

const coverageLabel = {
  complete: '完整',
  partial: '部分',
  incomplete: '不完整',
} as const;

const confidenceLabel: Record<SecurityFinding['confidence'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const semanticDimensionLabel: Record<SemanticDimension, string> = {
  prompt_injection: '提示词注入',
  instruction_override: '覆盖上层指令',
  authorization_bypass: '绕过确认或授权',
  sensitive_data_access: '敏感信息读取',
  data_exfiltration: '数据外传',
  destructive_actions: '破坏性操作',
  privilege_escalation: '权限提升',
  security_control_bypass: '绕过安全控制',
  persistence: '持久化运行',
  remote_code_execution: '执行远程代码',
  unexpected_network_access: '非预期网络访问',
  remote_code_download: '下载远程代码',
  stealth_behavior: '隐瞒行为',
  obfuscation: '隐藏真实行为',
  scope_expansion: '扩大操作范围',
  behavior_description_mismatch: '行为与描述不一致',
};

const formatTime = (value?: string | null) => {
  if (!value) return '尚未扫描';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

type SkillRow = {
  skillId: string;
  name: string;
  report: SecurityReportSummary | null;
  scanning: boolean;
};

const LevelBadge = ({ level, partial }: { level: SecurityLevel; partial?: boolean }) => (
  <span className={`security-level security-level-${level}`}>
    {levelMeta[level].label}{partial ? ' · 扫描不完整' : ''}
  </span>
);

const SecurityScanPage = () => {
  const { installPath, localSkills } = useAppContext();
  const {
    task,
    reports,
    loading,
    error,
    startScan,
    cancelScan,
    loadReport,
  } = useSecurityScan();
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedReport, setSelectedReport] = useState<SecurityReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const rows = useMemo<SkillRow[]>(() => {
    const reportsById = new Map(reports.map((report) => [report.skillId, report]));
    return localSkills.map((skill) => ({
      skillId: skill.id,
      name: skill.name,
      report: reportsById.get(skill.id) || null,
      scanning: task?.status === 'scanning' && (
        (task.activeSkillIds && task.activeSkillIds.length
          ? task.activeSkillIds.includes(skill.id)
          : task.currentSkillId === skill.id)
      ),
    })).sort((left, right) => {
      if (left.scanning !== right.scanning) return left.scanning ? -1 : 1;
      const leftRank = left.report ? levelMeta[left.report.effectiveLevel].rank : 3;
      const rightRank = right.report ? levelMeta[right.report.effectiveLevel].rank : 3;
      return leftRank - rightRank || left.name.localeCompare(right.name);
    });
  }, [localSkills, reports, task?.activeSkillIds, task?.currentSkillId, task?.status]);

  useEffect(() => {
    if (selectedSkillId && rows.some((row) => row.skillId === selectedSkillId)) return;
    setSelectedSkillId(rows[0]?.skillId || '');
  }, [rows, selectedSkillId]);

  const selectedSummary = reports.find((report) => report.skillId === selectedSkillId) || null;
  useEffect(() => {
    let active = true;
    if (!selectedSkillId || !selectedSummary) {
      setSelectedReport(null);
      return () => { active = false; };
    }
    setDetailLoading(true);
    void loadReport(selectedSkillId).then((report) => {
      if (active) setSelectedReport(report);
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [loadReport, selectedSkillId, selectedSummary]);

  const scanning = task?.status === 'scanning';
  const hasPreviousScan = Boolean(task || reports.length);
  const percent = scanning || task ? task?.percent || 0 : 0;
  const currentTarget = (() => {
    if (!task) return '等待扫描任务';
    const parts = [];
    if (task.activeSkillIds && task.activeSkillIds.length > 1) {
      parts.push(`${task.activeSkillIds.length} 个 Skill 并行`);
    } else if (task.currentSkillName) {
      parts.push(task.currentSkillName);
    }
    const totalChunks = task.semanticTotalChunks || 0;
    const inFlightChunks = task.semanticInFlightChunks || 0;
    if (totalChunks || inFlightChunks || task.phase === 'semantic') {
      const label = `语义块 ${task.semanticCompletedChunks || 0}/${totalChunks}`;
      parts.push(inFlightChunks ? `${label} · ${inFlightChunks} 进行中` : label);
    } else if (task.currentFile) {
      parts.push(task.currentFile);
    }
    return parts.join(' / ') || '等待扫描任务';
  })();
  const currentStatusText = scanning
    ? `正在扫描：${currentTarget}`
    : task?.phase === 'completed'
      ? ''
      : task?.phase === 'canceled'
        ? '扫描已取消，已完成的结果已保留'
        : task?.phase === 'error'
          ? `扫描失败${task.error ? `：${task.error}` : ''}`
          : '等待开始扫描';

  return (
    <section className="security-page fade-in">
      <div className="security-progress-card">
        <div className="security-progress-heading">
          <div>
            <div className="security-progress-title">
              <ShieldCheckmarkRegular className="icon" />
              {phaseLabel[task?.phase || 'idle']}
            </div>
            <div className="security-current-file" title={currentTarget}>
              {currentStatusText}
            </div>
          </div>
          <div className="security-progress-actions">
            <span className="security-progress-percent">{Math.round(percent)}%</span>
            {scanning ? (
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void cancelScan()}>
                <DismissCircleRegular className="icon" />
                取消扫描
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => void startScan(hasPreviousScan ? 'full' : 'incremental')}
                disabled={!installPath}
              >
                <ArrowClockwiseRegular className="icon" />
                {hasPreviousScan ? '重新扫描全部' : '开始安全扫描'}
              </Button>
            )}
          </div>
        </div>
        <div className="security-progress-track" aria-label={`扫描进度 ${Math.round(percent)}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="security-progress-stats">
          <span>文件 {task?.processedFiles || 0} / {task?.totalFiles || 0}</span>
          <span>Skill {task?.completedSkills || 0} / {task?.totalSkills || localSkills.length}</span>
          <span>已记录 {task?.findingsCount || 0} 项发现</span>
          {task?.runtime?.sequences ? <span>推理 {task.runtime.sequences} 路</span> : null}
          {task?.runtime?.batchSize ? <span>batch {task.runtime.batchSize}</span> : null}
          {task?.completedAt ? <span>更新于 {formatTime(task.completedAt)}</span> : null}
        </div>
        {(error || task?.error) ? (
          <div className="security-error"><WarningRegular className="icon" />{error || task?.error}</div>
        ) : null}
      </div>

      <div className="security-results-grid">
        <div className="security-skill-panel">
          <div className="security-panel-header">
            <strong>Skill 安全等级</strong>
            <span>{rows.length} 个 Skill</span>
          </div>
          <div className="security-skill-list">
            {rows.map((row) => (
              <button
                type="button"
                key={row.skillId}
                className={`security-skill-row ${selectedSkillId === row.skillId ? 'active' : ''}`}
                onClick={() => setSelectedSkillId(row.skillId)}
              >
                <span className="security-skill-info">
                  <strong>{row.name}</strong>
                  <span>
                    {row.scanning
                      ? '正在扫描'
                      : row.report
                        ? `${row.report.findingCount} 项发现 · 覆盖度：${coverageLabel[row.report.coverage]} · ${formatTime(row.report.scannedAt)}`
                        : '等待扫描'}
                  </span>
                </span>
                {row.scanning ? (
                  <span className="security-scanning-label"><span className="mini-spinner" />扫描中</span>
                ) : row.report ? (
                  <LevelBadge
                    level={row.report.effectiveLevel}
                    partial={row.report.coverage !== 'complete'}
                  />
                ) : (
                  <span className="security-level security-level-pending">未扫描</span>
                )}
              </button>
            ))}
            {!rows.length && !loading ? (
              <div className="empty-state">统一技能库中暂无可扫描的 Skill。</div>
            ) : null}
          </div>
        </div>

        <div className="security-detail-panel">
          {!selectedSkillId ? (
            <div className="empty-state">请选择一个 Skill 查看安全报告。</div>
          ) : detailLoading ? (
            <div className="empty-state">正在读取安全报告...</div>
          ) : !selectedReport ? (
            <div className="empty-state">该 Skill 尚未完成扫描。</div>
          ) : (
            <>
              <div className="security-detail-header">
                <div>
                  <h2>{selectedReport.name}</h2>
                  <p>
                    覆盖度：{coverageLabel[selectedReport.coverage]}
                    {' · '}策略 {selectedReport.policyVersion}
                    {' · '}{formatTime(selectedReport.scannedAt)}
                  </p>
                </div>
                <LevelBadge
                  level={selectedReport.effectiveLevel}
                  partial={selectedReport.coverage !== 'complete'}
                />
              </div>
              <div className="security-current-file">
                {selectedReport.semanticAnalysis.kind === 'model'
                  ? '智能语义 + 确定性检查'
                  : selectedReport.semanticAnalysis.kind === 'fallback'
                    ? `智能判断失败，已回退（${selectedReport.semanticAnalysis.reason}）`
                    : '规则扫描'}
              </div>
              {selectedReport.semanticAnalysis.kind === 'model' && selectedReport.semanticAssessments ? (
                <details className="security-semantic-details">
                  <summary>查看 16 项智能判断</summary>
                  <div className="security-findings">
                    {(Object.entries(selectedReport.semanticAssessments) as Array<[
                      SemanticDimension,
                      SemanticAssessment,
                    ]>)
                      .sort((left, right) => Number(right[1].detected) - Number(left[1].detected))
                      .map(([dimension, assessment]) => (
                        <div className="security-finding-location" key={dimension}>
                          <strong>{semanticDimensionLabel[dimension]}</strong>
                          {' · '}{assessment.detected ? '命中' : '未命中'}
                          {' · '}{Math.round(assessment.confidence * 100)}%
                          {assessment.reason ? <p>{assessment.reason}</p> : null}
                        </div>
                      ))}
                  </div>
                </details>
              ) : null}
              {selectedReport.findings.length === 0 ? (
                <div className="security-safe-empty">
                  <ShieldCheckmarkRegular className="icon" />
                  <div>
                    <strong>当前策略下未发现安全问题</strong>
                    <span>该结果仅代表本次离线扫描的覆盖范围。</span>
                  </div>
                </div>
              ) : (
                <div className="security-findings">
                  {selectedReport.findings.map((finding) => (
                    <article className="security-finding" key={finding.id || finding.fingerprint}>
                      <div className="security-finding-title">
                        <span className={`security-severity security-severity-${finding.severity}`}>
                          {severityLabel[finding.severity]}
                        </span>
                        <strong>{finding.title}</strong>
                      </div>
                      <div className="security-finding-location">
                        {finding.filePath || 'Skill 整体'}
                        {finding.filePath ? `:${finding.startLine}:${finding.startColumn}` : ''}
                        <span>
                          {finding.category} · 置信度 {confidenceLabel[finding.confidence]}
                          {finding.confidenceScore !== null
                            ? ` (${Math.round(finding.confidenceScore * 100)}%)`
                            : ''}
                          {' · '}{finding.detector === 'model' ? '智能判断' : '规则'}
                          {' · '}{finding.ruleId}
                        </span>
                      </div>
                      {finding.evidence ? <pre>{finding.evidence}</pre> : null}
                      <p>{finding.message}</p>
                      <div className="security-remediation">
                        <strong>建议：</strong>{finding.remediation}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default SecurityScanPage;
