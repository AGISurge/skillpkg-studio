import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, Popover } from "radix-ui";
import { ChevronDown, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import type { Skill, SkillGroup } from "../types/models";
import { useSkillGroups } from "../SkillGroupsContext";

const GroupModalPortalContext = createContext<HTMLDivElement | null>(null);

export const GroupModal = ({
  title,
  children,
  onClose,
  busy = false,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  compact?: boolean;
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  return (
  <Dialog.Root
    open
    onOpenChange={(open) => {
      if (!open && !busy) onClose();
    }}
  >
    <Dialog.Portal>
      <Dialog.Overlay className="group-modal-overlay" />
      <Dialog.Content
        ref={setPortalContainer}
        className={`dialog group-modal ${compact ? "group-modal-compact" : ""}`}
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="dialog-header">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭"
            onClick={onClose}
            disabled={busy}
          >
            <X />
          </Button>
        </div>
        <GroupModalPortalContext.Provider value={portalContainer}>
          {children}
        </GroupModalPortalContext.Provider>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
};

export const SkillMultiSelect = ({
  skills,
  selected,
  onToggle,
  disabled,
}: {
  skills: Skill[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) => {
  const portalContainer = useContext(GroupModalPortalContext);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = skills.filter((skill) =>
    keywords.every((word) =>
      `${skill.name} ${skill.description}`.toLowerCase().includes(word),
    ),
  );
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="group-select-trigger"
        >
          选择技能 <span>已选 {selected.size} 项</span>
          <ChevronDown />
        </Button>
      </Popover.Trigger>
      {/* Keep wheel events inside the modal scroll-lock boundary. */}
      <Popover.Portal container={portalContainer}>
        <Popover.Content className="group-popover" sideOffset={6} align="start">
          <Input
            autoFocus
            aria-label="筛选本地技能"
            placeholder="搜索技能名称或描述…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(20);
            }}
          />
          <div
            className="group-options"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                24
              )
                setLimit((value) => Math.min(value + 20, matches.length));
            }}
          >
            {matches.slice(0, limit).map((skill) => (
              <label key={skill.id} className="group-option">
                <input
                  type="checkbox"
                  checked={selected.has(skill.id)}
                  onChange={() => onToggle(skill.id)}
                />
                <span>
                  <strong>{skill.name}</strong>
                  <small>{skill.description}</small>
                </span>
              </label>
            ))}
            {!matches.length && (
              <p className="group-empty">没有匹配的本地技能</p>
            )}
            {limit < matches.length && (
              <Button
                variant="ghost"
                className="group-load-more"
                onClick={() => setLimit((value) => value + 20)}
              >
                加载更多
              </Button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const SkillGroupDialog = ({
  group,
  skills,
  onClose,
}: {
  group: SkillGroup | null;
  skills: Skill[];
  onClose: () => void;
}) => {
  const { groups, save, remove } = useSkillGroups();
  const [name, setName] = useState(group?.name || "");
  const [selected, setSelected] = useState(new Set(group?.skillIds || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const eligible = skills.filter(
    (skill) =>
      (skill.type || "skill") === "skill" &&
      (!skill.source || skill.source === "library"),
  );
  const dirty =
    name !== (group?.name || "") ||
    selected.size !== (group?.skillIds.length || 0) ||
    [...selected].some((id) => !group?.skillIds.includes(id));
  const close = () => {
    if (!busy) dirty ? setConfirm("discard") : onClose();
  };
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const submit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("技能组名称不能为空或全为空格。");
      return;
    }
    if (
      groups.some(
        (item) =>
          item.id !== group?.id &&
          item.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError("技能组名称已存在。");
      return;
    }
    if (!selected.size) {
      setError("请至少选择一个有效技能。");
      return;
    }
    if (
      [...selected].some((id) => !eligible.some((skill) => skill.id === id))
    ) {
      setError("请移除已失效的技能后保存。");
      return;
    }
    setBusy(true);
    setError("");
    const result = await save({
      id: group?.id,
      name: trimmed,
      skillIds: [...selected],
    });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error || "保存失败，请重试。");
  };
  const deleteGroup = async () => {
    if (!group || busy) return;
    setBusy(true);
    const result = await remove(group.id);
    setBusy(false);
    setConfirm(null);
    if (result.ok) onClose();
    else setError(result.error || "删除失败，请重试。");
  };
  return (
    <>
      <GroupModal
        title={group ? "编辑技能组" : "添加技能组"}
        onClose={close}
        busy={busy}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="group-form"
        >
          <div className="group-editor-body">
            <InputGroup>
              <InputGroupAddon>名称</InputGroupAddon>
              <InputGroupInput
                aria-label="名称"
                autoFocus
                className="focus-visible:ring-0 focus-visible:outline-0 text-sm"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                placeholder="例如：产品设计"
              />
            </InputGroup>
            <div className="group-editor-columns">
              <div className="group-field">
                <SkillMultiSelect
                  skills={eligible}
                  selected={selected}
                  onToggle={toggle}
                  disabled={busy}
                />
              </div>
              <div className="group-selection" aria-label="已选技能">
                <div className="group-selection-title">
                  已选技能 · {selected.size}
                </div>
                <div className="group-tags">
                  {[...selected].map((id) => {
                    const skill = eligible.find((item) => item.id === id);
                    return (
                      <span
                        className={`group-tag ${skill ? "" : "group-tag-invalid"}`}
                        key={id}
                      >
                        {skill?.name || `${id}（已失效）`}
                        <button
                          type="button"
                          className="group-tag-remove"
                          aria-label={`移除 ${skill?.name || id}`}
                          disabled={busy}
                          onClick={() => toggle(id)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
                {!selected.size && (
                  <p className="group-muted">
                    从上方选择技能，组成你的工作组合。
                  </p>
                )}
              </div>
            </div>
            {error && (
              <p role="alert" className="group-error">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-footer group-footer  pt-4">
            {group && (
              <Button
                type="button"
                variant="destructive"
                className="group-delete rounded-full"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm("delete")}
              >
                删除
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              size="sm"
              onClick={close}
              disabled={busy}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy} className="rounded-full" size="sm">
              {busy ? "保存中…" : "保 存"}
            </Button>
          </div>
        </form>
      </GroupModal>
      {confirm && (
        <GroupModal
          title={confirm === "discard" ? "放弃未保存的修改？" : "删除技能组？"}
          compact
          busy={busy}
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm === "discard"
              ? "你已做了修改，是否不保存退出？"
              : `确认删除“${group?.name}”？本地技能及 Agent 当前配置会保留。`}
          </p>
          <div className="dialog-footer">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {confirm === "discard" ? "继续编辑" : "取消"}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                confirm === "discard" ? onClose() : void deleteGroup()
              }
            >
              {confirm === "discard" ? "不保存退出" : "确认删除"}
            </Button>
          </div>
        </GroupModal>
      )}
    </>
  );
};
export default SkillGroupDialog;
