import {
  ArrowDownloadRegular,
  SettingsRegular,
  StarFilled,
  StarRegular,
} from "@fluentui/react-icons";
import type { KeyboardEvent } from "react";
import type { Skill, SkillFile } from "../types/models";
import SkillTree from "../components/SkillTree";
import SkillViewer from "../components/SkillViewer";
import { Button } from "@/components/ui/button";

/**
 * 技能列表与详情页参数。
 */
type SkillsPageProps = {
  skills: Skill[];
  selectedSkillId: string;
  selectedSkill: Skill | null;
  selectedFile: SkillFile | null;
  selectedFilePath: string;
  favorites: Set<string>;
  mode: "local" | "favorites" | "agents";
  installedSkillIds?: Set<string>;
  pendingSkillIds?: Set<string>;
  onSelectSkill: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onInstallToggle?: (skill: Skill) => void;
  onReinstall?: (skill: Skill) => void;
  onSelectFile: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  editing: boolean;
  draftValue: string | undefined;
  onStartEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onChangeDraft: (value: string) => void;
};

/**
 * 通用技能页面（本机/收藏/Agents 复用）。
 */
const SkillsPage = ({
  skills,
  selectedSkillId,
  selectedSkill,
  selectedFile,
  selectedFilePath,
  favorites,
  mode,
  installedSkillIds,
  pendingSkillIds,
  onSelectSkill,
  onToggleFavorite,
  onInstallToggle,
  onReinstall,
  onSelectFile,
  expandedFolders,
  onToggleFolder,
  editing,
  draftValue,
  onStartEdit,
  onSave,
  onCancelEdit,
  onChangeDraft,
}: SkillsPageProps) => {
  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    skill: Skill,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectSkill(skill);
  };

  return (
    <section className="panel-grid fade-in">
      <div className="skill-list">
        {skills.map((skill) => {
          const isManaged = Boolean(
            skill.managed || installedSkillIds?.has(skill.id),
          );
          const isPending = Boolean(pendingSkillIds?.has(skill.id));
          return (
            <div
              key={skill.id}
              className={`skill-card ${selectedSkillId === skill.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSkill(skill)}
              onKeyDown={(event) => handleCardKeyDown(event, skill)}
            >
              <div className="skill-card-header">
                <div>
                  <div className="skill-title">{skill.name}</div>
                  <div className="skill-version">v{skill.version}</div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(skill.id);
                  }}
                >
                  {favorites.has(skill.id) ? (
                    <StarFilled className="icon" />
                  ) : (
                    <StarRegular className="icon" />
                  )}
                </button>
              </div>
              <p>{skill.description}</p>
              {mode === "agents" && onInstallToggle && (
                <div
                  className="skill-card-footer"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className={`btn mini ${isManaged ? "managed" : "primary"} ${isPending ? "loading" : ""}`}
                    disabled={isPending}
                    aria-busy={isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isPending) onInstallToggle(skill);
                    }}
                  >
                    {isPending ? (
                      <span className="mini-spinner" aria-hidden="true" />
                    ) : (
                      <SettingsRegular className="icon" />
                    )}
                    {isPending ? "处理中" : isManaged ? "取消托管" : "托管"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {skills.length === 0 && (
          <div className="empty-state">当前列表为空。</div>
        )}
      </div>
      <div className="panel detail">
        {selectedSkill ? (
          <>
            <div className="detail-header">
              <div>
                <div className="flex justify-between items-center">
                  <div className="detail-title">{selectedSkill.name}</div>
                  <div className="detail-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onToggleFavorite(selectedSkill.id)}
                    >
                      {favorites.has(selectedSkill.id) ? (
                        <StarFilled className="icon" />
                      ) : (
                        <StarRegular className="icon" />
                      )}
                    </Button>
                    {onReinstall && mode !== "favorites" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onReinstall(selectedSkill)}
                      >
                        <ArrowDownloadRegular className="icon" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="detail-subtitle">
                  {selectedSkill.description}
                </div>
              </div>
            </div>
            <div className="detail-body border-t">
              <div className="tree pt-4">
                <div className="section-title">目录</div>
                <SkillTree
                  files={selectedSkill.files}
                  selectedFilePath={selectedFilePath}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                />
              </div>
              <div className="viewer pt-4">
                <SkillViewer
                  file={selectedFile}
                  editing={editing}
                  draftValue={draftValue}
                  onStartEdit={onStartEdit}
                  onSave={onSave}
                  onCancel={onCancelEdit}
                  onChangeDraft={onChangeDraft}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">请选择一个 Skill 查看详情。</div>
        )}
      </div>
    </section>
  );
};

export default SkillsPage;
