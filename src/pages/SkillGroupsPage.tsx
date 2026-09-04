import { useMemo, useState } from "react";
import { FolderRegular, AddRegular } from "@fluentui/react-icons";
import { useAppContext, useToolbar } from "../AppContext";
import { useSkillGroups } from "../SkillGroupsContext";
import SkillGroupDialog from "../components/SkillGroupDialog";
import { Button } from "../components/ui/button";
import type { SkillGroup } from "../types/models";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const SkillGroupsPage = () => {
  const { localSkills } = useAppContext();
  const { groups, loading, error, refresh } = useSkillGroups();
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
          <div className="group-grid">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className="group-card-button"
                onClick={() => setEditor({ group })}
              >
                <SpotlightCard className="group-card w-full shadow-none bg-white transition-shadow duration-300 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-primary/20 pt-6 px-6 pb-3 rounded-lg">
                  <div className="group-card-heading">
                    <h2>{group.name}</h2>
                    <span>{group.skillIds.length}</span>
                  </div>
                  <div className="group-tags">
                    {group.skillIds.map((id) => (
                      <span className="group-tag" key={id}>
                        {names.get(id) || id}
                      </span>
                    ))}
                  </div>
                  {!group.skillIds.length && (
                    <p className="group-muted">请添加技能</p>
                  )}
                </SpotlightCard>
              </button>
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
