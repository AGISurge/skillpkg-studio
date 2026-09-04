import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { X } from "lucide-react";
import { FolderRegular } from "@fluentui/react-icons";
import type { Agent, Skill, SkillGroup } from "../types/models";
import { useSkillGroups } from "../SkillGroupsContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GroupModal } from "./SkillGroupDialog";

const SwitchSkillGroupButton = ({
  agent,
  skills,
}: {
  agent: Agent | null;
  skills: Skill[];
}) => {
  const {
    groups,
    error: loadError,
    loading,
    refresh,
    switchGroup,
  } = useSkillGroups();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(10);
  const [pending, setPending] = useState<SkillGroup | null>(null);
  const [previousCount, setPreviousCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const matches = groups.filter((group) =>
    group.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    setOpen(false);
    setPending(null);
    setNotice("");
    setError("");
  }, [agent?.id]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);
  const confirm = async () => {
    if (!agent || !pending || busy) return;
    setBusy(true);
    setError("");
    const result = await switchGroup(agent.id, pending);
    setBusy(false);
    const recovery = result.recoveryPath
      ? ` 暂存恢复位置：${result.recoveryPath}`
      : "";
    if (result.ok) {
      setNotice(
        `已切换为“${pending.name}”。${result.hostedSkillIds?.length ? ` 已将 ${result.hostedSkillIds.length} 个非托管技能保存到本地库。` : ""}${result.warning || ""}${recovery}`,
      );
      setPending(null);
    } else if (result.reason === "group-changed") {
      setNotice(result.error || "技能组已变化，请重新选择。");
      setPending(null);
    } else {
      setError(`${result.error || "切换失败，请重试。"}${recovery}`);
    }
  };
  return (
    <>
      <Popover.Root
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) {
            setQuery("");
            setLimit(10);
            void refresh();
          }
        }}
      >
        <Popover.Trigger asChild>
          <Button variant="outline" className="rounded-full" disabled={!agent?.skillPath || busy} size="sm">
            <FolderRegular className="icon" />
            切换技能组
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="group-popover group-switch-popover"
            align="end"
            sideOffset={8}
          >
            <Input
              autoFocus
              placeholder="搜索技能组…"
              aria-label="筛选技能组"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(10);
              }}
            />
            {loadError && (
              <p role="alert" className="group-error">
                {loadError}
              </p>
            )}
            <div
              className="group-options"
              role="radiogroup"
              aria-label="选择技能组"
              onScroll={(event) => {
                const element = event.currentTarget;
                if (
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  24
                )
                  setLimit((value) => Math.min(value + 10, matches.length));
              }}
            >
              {matches.slice(0, limit).map((group) => (
                <label className="group-option" key={group.id}>
                  <input
                    type="radio"
                    name="switch-skill-group"
                    checked={pending?.id === group.id}
                    disabled={!group.skillIds.length}
                    onChange={() => {
                      setPending(group);
                      setPreviousCount(skills.length);
                      setError("");
                      setNotice("");
                      setOpen(false);
                    }}
                  />
                  <span>
                    <strong>{group.name}</strong>
                    <small>
                      {group.skillIds.length
                        ? `${group.skillIds.length} 个技能`
                        : "请添加技能"}
                    </small>
                  </span>
                </label>
              ))}
              {!matches.length && (
                <p className="group-empty">
                  {loading
                    ? "正在加载…"
                    : query
                      ? "没有匹配的技能组"
                      : "请先在“技能组”页面添加技能组"}
                </p>
              )}
              {limit < matches.length && (
                <Button
                  variant="ghost"
                  className="group-load-more"
                  onClick={() => setLimit((value) => value + 10)}
                >
                  加载更多
                </Button>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {pending && (
        <GroupModal
          title="确认切换技能组"
          compact
          busy={busy}
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <p>
            将 <strong>{agent?.name}</strong> 的 {previousCount} 个技能替换为{" "}
            <strong>“{pending.name}”</strong> 中的 {pending.skillIds.length}{" "}
            个技能。
          </p>
          <p className="group-muted -mt-4">
            现有非托管技能会先保存到本地库并托管，再从 Agent
            中移除。若有同名冲突，切换会暂停，原有技能会保留。
          </p>
          {error && (
            <p className="group-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-footer">
            <Button
              variant="ghost"
              className="rounded-full"
              size="sm"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              取消
            </Button>
            <Button disabled={busy} onClick={() => void confirm()} size="sm" className="rounded-full">
              {busy ? "正在托管并切换…" : "确认切换"}
            </Button>
          </div>
        </GroupModal>
      )}
      {notice && (
        <div className="group-switch-notice" role="status">
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <X />
          </Button>
        </div>
      )}
    </>
  );
};
export default SwitchSkillGroupButton;
