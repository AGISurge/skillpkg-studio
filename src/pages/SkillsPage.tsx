import {
  ArrowDownloadRegular,
  DeleteRegular,
  DismissRegular,
  OpenFolderRegular,
  SearchRegular,
  SettingsRegular,
  StarFilled,
  StarRegular,
} from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Skill, SkillFile } from "../types/models";
import SkillTree from "../components/SkillTree";
import SkillViewer from "../components/SkillViewer";
import { Button } from "@/components/ui/button";

const SEARCH_DEBOUNCE_MS = 220;

const includesSearch = (value: string, normalizedQuery: string) =>
  value.toLocaleLowerCase().includes(normalizedQuery);

const highlightSearchMatch = (value: string, query: string): ReactNode => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return value;

  const normalizedValue = value.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = normalizedValue.indexOf(normalizedQuery, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(value.slice(cursor, matchIndex));
    }
    const matchEnd = matchIndex + normalizedQuery.length;
    parts.push(
      <mark className="skill-search-highlight" key={`${matchIndex}-${matchEnd}`}>
        {value.slice(matchIndex, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    matchIndex = normalizedValue.indexOf(normalizedQuery, cursor);
  }

  if (cursor < value.length) {
    parts.push(value.slice(cursor));
  }

  return parts;
};

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
  hostedAgentNamesBySkillId?: Record<string, string[]>;
  onSelectSkill: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onOpenSkillDirectory?: (skill: Skill) => void;
  onInstallToggle?: (skill: Skill) => void;
  onReinstall?: (skill: Skill) => void;
  onDeleteSkill?: (skill: Skill) => void;
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
  hostedAgentNamesBySkillId,
  onSelectSkill,
  onToggleFavorite,
  onOpenSkillDirectory,
  onInstallToggle,
  onReinstall,
  onDeleteSkill,
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
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
  const searchable = mode === "local" || mode === "agents";
  const normalizedSearchValue = debouncedSearchValue.trim().toLocaleLowerCase();
  const visibleSkills = useMemo(() => {
    if (!searchable || !normalizedSearchValue) return skills;
    return skills.filter(
      (skill) =>
        includesSearch(skill.name, normalizedSearchValue) ||
        includesSearch(skill.description, normalizedSearchValue),
    );
  }, [normalizedSearchValue, searchable, skills]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchValue(searchValue);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchValue]);

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
        {searchable && (
          <div className="skill-search">
            <SearchRegular className="icon" />
            <input
              type="search"
              value={searchValue}
              aria-label="搜索 Skill"
              placeholder="搜索 name 或 description"
              onChange={(event) => setSearchValue(event.target.value)}
            />
            {searchValue && (
              <button
                type="button"
                className="skill-search-clear"
                aria-label="清空搜索"
                onClick={() => {
                  setSearchValue("");
                  setDebouncedSearchValue("");
                }}
              >
                <DismissRegular className="icon" />
              </button>
            )}
          </div>
        )}
        <div className="skill-list-items">
          {visibleSkills.map((skill) => {
            const isManaged = Boolean(
              skill.managed || installedSkillIds?.has(skill.id),
            );
            const isPending = Boolean(pendingSkillIds?.has(skill.id));
            const hostedAgentNames = hostedAgentNamesBySkillId?.[skill.id] || [];
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
                    <div className="skill-title">
                      {highlightSearchMatch(skill.name, debouncedSearchValue)}
                    </div>
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
                <p>{highlightSearchMatch(skill.description, debouncedSearchValue)}</p>
                {(mode === "local" || mode === "favorites") && hostedAgentNames.length > 0 && (
                  <div className="skill-agent-tags" aria-label="已托管的 Agents">
                    {hostedAgentNames.map((agentName) => (
                      <span className="skill-agent-tag" key={`${skill.id}-${agentName}`}>
                        {agentName}
                      </span>
                    ))}
                  </div>
                )}
                {mode === "agents" && (onInstallToggle || onDeleteSkill) && (
                  <div
                    className="skill-card-footer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {isManaged ? (
                      <button
                        type="button"
                        className={`btn mini danger ${isPending ? "loading" : ""}`}
                        disabled={isPending}
                        aria-busy={isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isPending) (onDeleteSkill || onInstallToggle)?.(skill);
                        }}
                      >
                        {isPending ? (
                          <span className="mini-spinner" aria-hidden="true" />
                        ) : (
                          <DeleteRegular className="icon" />
                        )}
                        {isPending ? "处理中" : "卸载"}
                      </button>
                    ) : (
                      <>
                        {onInstallToggle && (
                          <button
                            type="button"
                            className={`btn mini primary ${isPending ? "loading" : ""}`}
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
                            {isPending ? "处理中" : "托管"}
                          </button>
                        )}
                        {onDeleteSkill && (
                          <button
                            type="button"
                            className={`btn mini danger ${isPending ? "loading" : ""}`}
                            disabled={isPending}
                            aria-busy={isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!isPending) onDeleteSkill(skill);
                            }}
                          >
                            {isPending ? (
                              <span className="mini-spinner" aria-hidden="true" />
                            ) : (
                              <DeleteRegular className="icon" />
                            )}
                            {isPending ? "处理中" : "删除"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visibleSkills.length === 0 && (
            <div className="empty-state">
              {skills.length === 0 ? "当前列表为空。" : "未找到匹配的 Skill。"}
            </div>
          )}
        </div>
      </div>
      <div className="panel detail">
        {selectedSkill ? (
          <>
            <div className="detail-header">
              <div>
                <div className="flex justify-between items-center">
                  <div className="detail-title">{selectedSkill.name}</div>
                  <div className="detail-actions">
                    {onOpenSkillDirectory && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="打开当前 Skill 目录"
                        title="打开当前 Skill 目录"
                        onClick={() => onOpenSkillDirectory(selectedSkill)}
                      >
                        <OpenFolderRegular className="icon" />
                      </Button>
                    )}
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
                    {onDeleteSkill && mode !== "favorites" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={mode === "agents" && selectedSkill.managed ? "卸载 Skill" : "删除 Skill"}
                        onClick={() => onDeleteSkill(selectedSkill)}
                      >
                        <DeleteRegular className="icon" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="detail-subtitle">
                  {selectedSkill.description}
                </div>
              </div>
            </div>
            <div className="detail-body">
              <div className="tree py-4 px-2">
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
