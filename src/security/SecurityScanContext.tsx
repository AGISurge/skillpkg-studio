import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useAppContext } from '../AppContext';
import type {
  SecurityReport,
  SecurityReportSummary,
  SecurityScanProgress,
} from './types';

type SecurityScanContextValue = {
  task: SecurityScanProgress | null;
  reports: SecurityReportSummary[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  startScan: (mode?: 'incremental' | 'full') => Promise<void>;
  cancelScan: () => Promise<void>;
  loadReport: (skillId: string) => Promise<SecurityReport | null>;
};

const SecurityScanContext = createContext<SecurityScanContextValue | null>(null);

const upsertReport = (
  reports: SecurityReportSummary[],
  report: SecurityReportSummary,
) => {
  const index = reports.findIndex((item) => item.skillId === report.skillId);
  if (index < 0) return [...reports, report];
  const next = [...reports];
  next[index] = report;
  return next;
};

export const SecurityScanProvider = ({ children }: { children: ReactNode }) => {
  const { installPath } = useAppContext();
  const [task, setTask] = useState<SecurityScanProgress | null>(null);
  const [reports, setReports] = useState<SecurityReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!installPath || !window.skillpkg?.listSecurityReports) {
      setReports([]);
      setTask(null);
      return;
    }
    setLoading(true);
    try {
      const [nextTask, nextReports] = await Promise.all([
        window.skillpkg.getSecurityScanState?.({ installPath }) ?? Promise.resolve(null),
        window.skillpkg.listSecurityReports({ installPath }),
      ]);
      setTask(nextTask);
      setReports(nextReports);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '读取安全扫描结果失败。');
    } finally {
      setLoading(false);
    }
  }, [installPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = window.skillpkg?.onSecurityScanEvent?.((event) => {
      if (!event.task || event.task.libraryPath !== installPath) return;
      setTask(event.task);
      if (event.type === 'report-updated') {
        setReports((current) => upsertReport(current, event.report));
      }
      if (event.type === 'completed' || event.type === 'canceled') {
        const reportsPromise = window.skillpkg?.listSecurityReports?.({ installPath });
        if (reportsPromise) {
          void reportsPromise.then(setReports);
        }
      }
      if (event.type === 'error') {
        setError(event.error || event.task.error || '安全扫描失败。');
      } else if (event.type !== 'progress') {
        setError('');
      }
    });
    return () => unsubscribe?.();
  }, [installPath]);

  const startScan = useCallback(async (mode: 'incremental' | 'full' = 'incremental') => {
    if (!installPath || !window.skillpkg?.startSecurityScan) return;
    setError('');
    try {
      const nextTask = await window.skillpkg.startSecurityScan({ installPath, mode });
      setTask(nextTask);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法启动安全扫描。');
    }
  }, [installPath]);

  const cancelScan = useCallback(async () => {
    if (!task?.id || !window.skillpkg?.cancelSecurityScan) return;
    await window.skillpkg.cancelSecurityScan({ taskId: task.id });
  }, [task?.id]);

  const loadReport = useCallback(async (skillId: string) => {
    if (!installPath || !skillId || !window.skillpkg?.getSecurityReport) return null;
    return window.skillpkg.getSecurityReport({ installPath, skillId });
  }, [installPath]);

  const value = useMemo(() => ({
    task,
    reports,
    loading,
    error,
    refresh,
    startScan,
    cancelScan,
    loadReport,
  }), [cancelScan, error, loadReport, loading, refresh, reports, startScan, task]);

  return (
    <SecurityScanContext.Provider value={value}>
      {children}
    </SecurityScanContext.Provider>
  );
};

export const useSecurityScan = () => {
  const value = useContext(SecurityScanContext);
  if (!value) throw new Error('useSecurityScan must be used inside SecurityScanProvider');
  return value;
};
