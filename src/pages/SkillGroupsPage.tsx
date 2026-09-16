import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FolderRegular, AddRegular } from "@fluentui/react-icons";
import { useAppContext, useToolbar } from "../AppContext";
import { useSkillGroups } from "../SkillGroupsContext";
import SkillGroupDialog from "../components/SkillGroupDialog";
import { Button } from "../components/ui/button";
import type { SkillGroup } from "../types/models";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { useMasonryGrid } from "../utils/useMasonryGrid";

const SkillGroupCard = ({
  group,
  names,
  onEdit,
}: {
  group: SkillGroup;
  names: ReadonlyMap<string, string>;
  onEdit: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || expanded) return;

    const measure = () => {
      setOverflowing(content.scrollHeight > viewport.clientHeight + 1);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [expanded, group.skillIds]);

  return (
    <div className="group-card-item">
      <SpotlightCard className="group-card w-full shadow-none bg-white transition-shadow duration-300 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-primary/20 p-0 rounded-lg">
        <button
          type="button"
          className="group-card-open"
          aria-label={`编辑技能组 ${group.name}`}
          onClick={onEdit}
        >
          <div className="group-card-heading">
            <h2>{group.name}</h2>
            <span>{group.skillIds.length}</span>
          </div>
          <div
            ref={viewportRef}
            id={contentId}
            className={`group-card-tags-viewport ${expanded ? "is-expanded" : ""}`}
          >
            <div ref={contentRef} className="group-tags group-card-tags-content">
              {group.skillIds.map((id) => (
                <span className="group-tag" key={id}>
                  {names.get(id) || id}
                </span>
              ))}
            </div>
            {!group.skillIds.length && (
              <p className="group-muted">请添加技能</p>
            )}
          </div>
        </button>
        {overflowing && (
          <button
            type="button"
            className="group-card-toggle"
            aria-controls={contentId}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "收起" : "展开"}
          </button>
        )}
      </SpotlightCard>
    </div>
  );
};

const SkillGroupsPage = () => {
  const { localSkills } = useAppContext();
  const { groups, loading, error, refresh } = useSkillGroups();
  const groupGridRef = useMasonryGrid<HTMLDivElement>(groups);
  const [editor, setEditor] = useState<{ group: SkillGroup | null } | null>(
    null,
  );
  const toolbar = useMemo(
    () => (
      <Button
        onClick={() => setEditor({ group: null })}
        size="sm"
        className="rounded-full"
      >
        <AddRegular />
        添加
      </Button>
    ),
    [],
  );
  useToolbar(toolbar);
  const names = new Map(localSkills.map((skill) => [skill.id, skill.name]));
  return (
    <section className="skill-groups-page" aria-label="技能组">
      {error && (
        <div role="alert" className="group-error">
          {error}{" "}
          <Button variant="ghost" onClick={() => void refresh()}>
            重试
          </Button>
        </div>
      )}
      {loading && !groups.length ? (
        <p className="group-empty">正在加载技能组…</p>
      ) : (
        <>
          {!groups.length && !error && (
            <div className="group-page-empty">
              <FolderRegular className="size-24" />
              <p>选择多个本地技能，随时切换到适合当前工作的组合。</p>
            </div>
          )}
          <div className="group-grid" ref={groupGridRef}>
            {groups.map((group) => (
              <SkillGroupCard
                key={group.id}
                group={group}
                names={names}
                onEdit={() => setEditor({ group })}
              />
            ))}
          </div>
        </>
      )}
      {editor && (
        <SkillGroupDialog
          key={editor.group?.id || "new"}
          group={editor.group}
          skills={localSkills}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
};
export default SkillGroupsPage;
