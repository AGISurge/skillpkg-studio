import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  ChevronDownRegular,
  DismissCircleRegular,
  FolderRegular,
  FolderZipRegular,
  ShieldCheckmarkRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import { Button } from "../components/ui/button";
import { SkillCheckTree } from "../components/SkillCheckTree";
import { semanticProgressLabel } from "../security/semanticProgress";
import {
  coverageLabel,
  levelMeta,
  LevelBadge,
  SecurityFindings,
} from "../security/SecurityFindings";
import type {
  SkillCheckSource,
  SkillCheckSourceKind,
  SkillCheckState,
} from "../security/skillCheckTypes";

const phaseLabel = {
  idle: "等待扫描",
  inventory: "正在清点文件",
  analyzing: "正在分析安全风险",
  semantic: "正在智能判断",
  finalizing: "正在汇总结果",
  completed: "扫描完成",
  canceled: "扫描已取消",
  error: "扫描失败",
};
const failureMessage = (failure: unknown) =>
  failure instanceof Error ? failure.message : "检查 Skill 失败。";
const initialState: SkillCheckState = {
  task: null,
  sourceName: "",
  files: [],
  report: null,
};
const desktopApi = () => {
  const api = window.skillpkg;
  if (!api) throw new Error("请在桌面应用中选择 Skill。");
  return api;
};

const SourceButton = ({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (kind: SkillCheckSourceKind) => void;
}) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <div className="import-menu" ref={root}>
      <Button
        size="sm"
        className="rounded-full"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FolderRegular className="icon" />
        选择 Skill
        <ChevronDownRegular className="icon" />
      </Button>
      {open && !disabled ? (
        <div className="import-menu-popover" role="menu">
          <button
            type="button"
            className="import-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSelect("folder");
            }}
          >
            <FolderRegular className="icon" />
            选择文件夹
          </button>
          <button
            type="button"
            className="import-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSelect("zip");
            }}
          >
            <FolderZipRegular className="icon" />
            选择 ZIP
          </button>
        </div>
      ) : null}
    </div>
  );
};

const SkillCheckPage = () => {
  const [state, setState] = useState<SkillCheckState>(initialState);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<SkillCheckSource | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const sourceRef = useRef<SkillCheckSource | null>(null);
  const revision = useRef(0);
  const lastTaskId = useRef("");
  const manualSelection = useRef(false);
  const scanning = state.task?.status === "scanning";

  useEffect(() => {
    mounted.current = true;
    const before = revision.current;
    const unsubscribe = window.skillpkg?.onSkillCheckState((next) => {
      revision.current += 1;
      setState(next);
    });
    void window.skillpkg
      ?.getSkillCheckState()
      .then((next) => {
        if (mounted.current && revision.current === before) setState(next);
      })
      .catch((failure: unknown) => {
        if (mounted.current) setError(failureMessage(failure));
      });
    return () => {
      mounted.current = false;
      unsubscribe?.();
      const pending = sourceRef.current;
      if (pending)
        void window.skillpkg
          ?.discardSkillCheckSource({ sessionId: pending.sessionId })
          .catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (state.task?.id !== lastTaskId.current) {
      lastTaskId.current = state.task?.id || "";
      manualSelection.current = false;
      setCollapsed(new Set());
      setSelectedPath("");
    }
    const ranked = [...state.files].sort((a, b) => {
      const left =
        a.status === "checked" || a.status === "complete"
          ? levelMeta[a.level].rank
          : 3;
      const right =
        b.status === "checked" || b.status === "complete"
          ? levelMeta[b.level].rank
          : 3;
      return left - right || a.path.localeCompare(b.path);
    });
    const highest = ranked[0];
    const risky =
      highest &&
      (highest.status === "checked" || highest.status === "complete") &&
      highest.level !== "safe";
    const defaultPath = risky
      ? highest.path
      : state.files.find((file) => file.path === "SKILL.md")?.path ||
        highest?.path ||
        "";
    setSelectedPath((current) =>
      manualSelection.current &&
      (current === "@overall" ||
        state.files.some((file) => file.path === current))
        ? current
        : defaultPath,
    );
  }, [state.files, state.task?.id, state.task?.status]);

  const start = async (prepared: SkillCheckSource, selectedId: string) => {
    const before = revision.current;
    const next = await desktopApi().startSkillCheck({
      sessionId: prepared.sessionId,
      candidateId: selectedId,
    });
    sourceRef.current = null;
    if (mounted.current) {
      setSource(null);
      if (revision.current === before) setState(next);
    }
  };
  const prepare = async (sourcePath: string) => {
    const prepared = await desktopApi().prepareSkillCheckSource({ sourcePath });
    if (!mounted.current) {
      await desktopApi().discardSkillCheckSource({
        sessionId: prepared.sessionId,
      });
      return;
    }
    sourceRef.current = prepared;
    if (prepared.candidates.length === 1) {
      const candidate = prepared.candidates[0];
      if (candidate) await start(prepared, candidate.id);
    } else {
      setSource(prepared);
      setCandidateId(prepared.candidates[0]?.id || "");
    }
  };
  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current || scanning) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(failureMessage(failure));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const choose = (kind: SkillCheckSourceKind) =>
    void runAction(async () => {
      if (!window.skillpkg) throw new Error("请在桌面应用中选择 Skill。");
      const sourcePath = await window.skillpkg.selectSkillCheckSource({ kind });
      if (sourcePath && mounted.current) await prepare(sourcePath);
    });
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (state.task || busy || source || scanning) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      setError("请每次拖入一个文件夹或 ZIP。");
      return;
    }
    const file = files[0];
    if (file)
      void runAction(async () => {
        const sourcePath = window.skillpkg?.getDroppedFilePath(file);
        if (!sourcePath)
          throw new Error("无法读取拖入来源，请通过选择Skill按钮选择。");
        await prepare(sourcePath);
      });
  };
  const closeSource = () =>
    void runAction(async () => {
      if (!source) return;
      await desktopApi().discardSkillCheckSource({
        sessionId: source.sessionId,
      });
      sourceRef.current = null;
      setSource(null);
    });
  useEffect(() => {
    if (!source) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) closeSource();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });
  const cancel = async () => {
    if (!state.task) return;
    try {
      await desktopApi().cancelSkillCheck({ taskId: state.task.id });
    } catch (failure) {
      setError(failureMessage(failure));
    }
  };
  const selectedFile = state.files.find((file) => file.path === selectedPath);
  const fileResult =
    selectedFile &&
    (selectedFile.status === "checked" || selectedFile.status === "complete")
      ? selectedFile
      : null;
  const overall = selectedPath === "@overall";
  const findings = overall
    ? state.report?.findings.filter((finding) => !finding.filePath) || []
    : fileResult?.findings || [];
  const overallFindings =
    state.report?.findings.filter((finding) => !finding.filePath) || [];
  const level = overall ? state.report?.effectiveLevel : fileResult?.level;
  const coverage = overall ? state.report?.coverage : fileResult?.coverage;
  const percent = Math.round(state.task?.percent || 0);
  const selectFile = (value: string) => {
    manualSelection.current = true;
    setSelectedPath(value);
  };
  const selector = (
    <SourceButton disabled={busy || Boolean(source)} onSelect={choose} />
  );

  return (
    <section
      className="security-page fade-in skill-check-page"
      onDragOver={(event) => {
        event.preventDefault();
        if (!state.task && !busy && !source) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={drop}
    >
      {!state.task ? (
        <div className={`skill-check-dropzone ${dragging ? "dragging" : ""}`}>
          <ShieldCheckmarkRegular className="skill-check-empty-icon" />
          <h2 className="font-semibold">检查此 Skill</h2>
          <p className="text-sm">拖入 Skill 目录或 ZIP 包，开始安全检测</p>
          {selector}
          <span className="skill-check-hint">
            {busy ? "正在识别 Skill…" : ""}
          </span>
          {error ? (
            <div className="security-error" role="alert">
              <WarningRegular className="icon" />
              {error}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="security-progress-card">
            <div className="security-progress-heading">
              <div>
                <div className="security-progress-title">
                  <ShieldCheckmarkRegular className="icon" />
                  {phaseLabel[state.task.phase]}
                </div>
                <div
                  className="security-current-file"
                  title={state.task.currentFile}
                >
                  {state.sourceName}
                  {state.task.currentFile ? ` / ${state.task.currentFile}` : ""}
                </div>
              </div>
              <div className="security-progress-actions">
                <span className="security-progress-percent">
                  {state.task.phase === "inventory" ? "—" : `${percent}%`}
                </span>
                {scanning ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => void cancel()}
                  >
                    <DismissCircleRegular className="icon" />
                    取消扫描
                  </Button>
                ) : (
                  selector
                )}
              </div>
            </div>
            <div
              className="security-progress-track"
              role="progressbar"
              aria-label="安全扫描进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="security-progress-stats">
              <span>
                文件 {state.task.processedFiles} / {state.task.totalFiles}
              </span>
              {state.task.semanticProgress ? <span>{semanticProgressLabel(state.task.semanticProgress)}</span> : null}
              <span>
                已记录{" "}
                {state.report?.findingCount ??
                  state.files.reduce(
                    (sum, file) =>
                      sum + ("findings" in file ? file.findings.length : 0),
                    0,
                  )}{" "}
                项发现
              </span>
              {state.task.status === "canceled" ? (
                <span>已保留部分结果，扫描不完整</span>
              ) : null}
            </div>
            {error || state.task.error ? (
              <div className="security-error" role="alert">
                <WarningRegular className="icon" />
                {error || state.task.error}
              </div>
            ) : null}
          </div>
          <div className="security-results-grid">
            <div className="security-skill-panel">
              <div className="security-panel-header">
                <strong>文件安全等级</strong>
                <span>{state.files.length} 个文件</span>
              </div>
              <div className="security-skill-list">
                {overallFindings.length ? (
                  <button
                    type="button"
                    className={`skill-check-tree-row ${overall ? "active" : ""}`}
                    onClick={() => selectFile("@overall")}
                  >
                    <ShieldCheckmarkRegular className="icon" />
                    <span className="skill-check-tree-name">Skill 整体</span>
                    <span>{overallFindings.length} 项发现</span>
                  </button>
                ) : null}
                <SkillCheckTree
                  files={state.files}
                  selectedPath={selectedPath}
                  collapsed={collapsed}
                  onSelect={selectFile}
                  onToggle={(value) =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(value)) next.delete(value);
                      else next.add(value);
                      return next;
                    })
                  }
                />
                {!state.files.length ? (
                  <div className="empty-state">正在清点文件…</div>
                ) : null}
              </div>
            </div>
            <div className="security-detail-panel">
              {!selectedFile && !overall ? (
                <div className="empty-state">请选择一个文件查看详细结果。</div>
              ) : (
                <>
                  <div className="security-detail-header">
                    <div>
                      <h2>{overall ? "Skill 整体" : selectedPath}</h2>
                      <p>
                        {coverage
                          ? `覆盖度：${coverageLabel[coverage]}`
                          : "等待文件检查"}
                        {fileResult?.status === "checked" && scanning
                          ? " · 最终评级将在智能判断结束后确定"
                          : ""}
                      </p>
                    </div>
                    {level ? (
                      <LevelBadge
                        level={level}
                        partial={coverage !== "complete"}
                      />
                    ) : null}
                  </div>
                  <div className="security-current-file">
                    {state.report?.semanticAnalysis.kind === "model"
                      ? "智能语义 + 确定性检查"
                      : state.report?.semanticAnalysis.kind === "fallback"
                        ? `智能判断失败，已回退（${state.report.semanticAnalysis.reason}）`
                        : "规则扫描"}
                    {state.task.status === "canceled" ||
                    state.task.status === "error"
                      ? " · 扫描不完整"
                      : ""}
                  </div>
                  {findings.length ? (
                    <SecurityFindings findings={findings} />
                  ) : !fileResult && !overall ? (
                    <div className="empty-state">
                      {scanning
                        ? "该文件尚未完成检查。"
                        : "该文件未完成扫描，结果不完整。"}
                    </div>
                  ) : (
                    <div className="security-safe-empty">
                      <ShieldCheckmarkRegular className="icon" />
                      <div>
                        <strong>当前检查范围内未发现安全问题</strong>
                        <span>
                          {scanning
                            ? "扫描仍在进行，最终结果可能更新。"
                            : "该结果仅代表本次离线扫描的覆盖范围。"}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
      {source ? (
        <div className="dialog-backdrop">
          <div
            className="dialog import-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="选择要检查的 Skill"
          >
            <div className="dialog-header">
              <div>
                <div className="dialog-title">选择要检查的 Skill</div>
                <div className="dialog-subtitle">
                  检测到 {source.candidates.length} 个
                  Skill，请选择一个进行扫描。
                </div>
              </div>
            </div>
            <div className="dialog-body import-candidate-list">
              {source.candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className={`dialog-option ${candidateId === candidate.id ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="skill-check-candidate"
                    checked={candidateId === candidate.id}
                    onChange={() => setCandidateId(candidate.id)}
                    disabled={busy}
                  />
                  <span>
                    <span className="option-title">{candidate.name}</span>
                    <span className="option-subtitle">
                      {candidate.relativePath || "."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {error ? (
              <div className="security-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="dialog-footer">
              <Button variant="ghost" disabled={busy} onClick={closeSource}>
                取消
              </Button>
              <Button
                disabled={busy || !candidateId}
                onClick={() => void runAction(() => start(source, candidateId))}
              >
                开始检查
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
export default SkillCheckPage;
