import {
  BroomRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import { useEffect, useMemo } from 'react';
import { useAppContext, useToolbar } from '../AppContext';
import type { LocalOrganizeStatus } from '../AppContext';
import { Button } from '@/components/ui/button';

const getStatusText = (
  status: LocalOrganizeStatus,
  scannedAgentCount: number,
  totalAgentCount: number,
) => {
  if (status === 'scanning') {
    return totalAgentCount
      ? `正在扫描 Agents (${scannedAgentCount}/${totalAgentCount})`
      : '正在扫描 Agents';
  }
  if (status === 'completed') return '扫描完成';
  if (status === 'canceled') return '扫描已取消';
  if (status === 'hosting') return '正在执行托管';
  if (status === 'error') return '任务失败';
  return '准备扫描';
};

const LocalOrganizePage = () => {
  const {
    installPath,
    localOrganizeTask,
    startLocalOrganizeScan,
    cancelLocalOrganizeScan,
    toggleLocalOrganizeCandidate,
    setAllLocalOrganizeCandidatesSelected,
    confirmLocalOrganizeHosting,
  } = useAppContext();

  const {
    status,
    candidates,
    selectedSkillIds,
    scannedAgentCount,
    totalAgentCount,
    error,
    result,
  } = localOrganizeTask;
  const selectedCount = selectedSkillIds.size;
  const canHost = status === 'completed' && selectedCount > 0;
  const isBusy = status === 'scanning' || status === 'hosting';
  const allSelected = candidates.length > 0 && candidates.every((candidate) =>
    selectedSkillIds.has(candidate.skillId),
  );

  useEffect(() => {
    if (status === 'idle' && installPath) {
      void startLocalOrganizeScan();
    }
  }, [installPath, startLocalOrganizeScan, status]);

  const toolbar = useMemo(() => (
    <>
      <Button
        className={`${status === 'hosting' ? 'loading' : ''}`}
        onClick={() => {
          void confirmLocalOrganizeHosting();
        }}
        disabled={!canHost}
      >
        {status === 'hosting' ? (
          <span className="mini-spinner" aria-hidden="true" />
        ) : (
          <CheckmarkCircleRegular className="icon" />
        )}
        托管选中
      </Button>
      <Button
        type="button"
        className="btn ghost"
        onClick={() => {
          if (status === 'scanning') {
            cancelLocalOrganizeScan();
            return;
          }
          void startLocalOrganizeScan();
        }}
        disabled={status === 'hosting'}
      >
        {status === 'scanning' ? (
          <DismissCircleRegular className="icon" />
        ) : (
          <BroomRegular className="icon" />
        )}
        {status === 'scanning' ? '取消' : '重新扫描'}
      </Button>
    </>
  ), [
    canHost,
    cancelLocalOrganizeScan,
    confirmLocalOrganizeHosting,
    startLocalOrganizeScan,
    status,
  ]);
  useToolbar(toolbar);

  const progressPercent = totalAgentCount
    ? Math.min(100, Math.round((scannedAgentCount / totalAgentCount) * 100))
    : status === 'completed'
      ? 100
      : 0;

  return (
    <section className="local-organize-page fade-in">
      <div className="local-organize-progress" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      {result ? (
        <div className="notice local-organize-result">
          已托管 {result.successCount} 项{result.failedCount ? `，${result.failedCount} 项失败` : ''}。
        </div>
      ) : null}
      {error ? <div className="notice local-organize-result">{error}</div> : null}

      <div className="local-organize-list-panel">
        <div className="local-organize-list-header">
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!candidates.length || status === 'hosting'}
              onChange={(event) => setAllLocalOrganizeCandidatesSelected(event.target.checked)}
            />
            <span>Skill</span>
          </label>
          <span>当前所在 Agents</span>
        </div>

        <div className="local-organize-list">
          {candidates.map((candidate) => (
            <label className="local-organize-row" key={candidate.skillId}>
              <input
                type="checkbox"
                checked={selectedSkillIds.has(candidate.skillId)}
                disabled={status === 'hosting'}
                onChange={() => toggleLocalOrganizeCandidate(candidate.skillId)}
              />
              <span className="local-organize-skill-name">{candidate.name}</span>
              <span className="local-organize-agent-tags">
                {candidate.agents.map((entry) => (
                  <span
                    className="skill-agent-tag"
                    key={`${candidate.skillId}-${entry.agentId}`}
                  >
                    {entry.agentName}
                  </span>
                ))}
              </span>
            </label>
          ))}
          {!candidates.length && status !== 'scanning' ? (
            <div className="empty-state">未发现需要托管的 Skill。</div>
          ) : null}
          {!candidates.length && status === 'scanning' ? (
            <div className="empty-state">正在等待扫描结果。</div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default LocalOrganizePage;
