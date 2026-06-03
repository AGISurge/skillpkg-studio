import { BroomRegular } from '@fluentui/react-icons';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, useToolbar } from '../AppContext';
import Empty from '../components/Empty';
import ImportSkillDropdown from '../components/ImportSkillDropdown';
import OpenDirectoryButton from '../components/OpenDirectoryButton';
import { AGENT_CATALOG } from '../config/agents';
import { routePaths } from '../routes';
import SkillsPage from './SkillsPage';
import { Button } from '@/components/ui/button';

const getDefaultSkillFilePath = (skill: { files: Array<{ path: string }> }) =>
  skill.files.find((file) => file.path === 'SKILL.md')?.path ||
  skill.files[0]?.path ||
  '';

/**
 * 本地技能页封装，复用 SkillsPage。
 */
const LocalPage = () => {
  const navigate = useNavigate();
  const {
    localSkills,
    selectedLibrarySkillId,
    selectedFilePath,
    favorites,
    expandedFolders,
    editing,
    fileDrafts,
    installedByAgent,
    installPath,
    importStatus,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    openInstallDialog,
    openLocalSkillDeleteDialog,
    openDirectoryPath,
    openSkillDirectory,
    openImportSkill,
    handleFileSelect,
    handleToggleFolder,
    handleSaveFile,
    handleCancelEdit,
    updateDraft,
  } = useAppContext();

  const hostedAgentNamesBySkillId = useMemo(() => {
    const next: Record<string, string[]> = {};

    Object.entries(installedByAgent).forEach(([agentId, skillIds]) => {
      const agentName =
        AGENT_CATALOG[agentId as keyof typeof AGENT_CATALOG]?.name || agentId;

      skillIds.forEach((skillId) => {
        next[skillId] = [...(next[skillId] || []), agentName];
      });
    });

    return next;
  }, [installedByAgent]);

  const selectedSkill =
    localSkills.find((skill) => skill.id === selectedLibrarySkillId) ||
    localSkills[0] ||
    null;

  const toolbar = useMemo(
    () => (
      <>
        <OpenDirectoryButton
          disabled={!installPath}
          onClick={() => openDirectoryPath(installPath, 'local')}
        />
        <Button
          className="btn ghost"
          onClick={() => navigate(routePaths.localOrganize)}
        >
          <BroomRegular className="icon" />
          整理
        </Button>
        <ImportSkillDropdown status={importStatus} onSelect={openImportSkill} />
      </>
    ),
    [importStatus, installPath, navigate, openDirectoryPath, openImportSkill],
  );
  useToolbar(toolbar);

  const selectedFile =
    selectedSkill?.files.find((file) => file.path === selectedFilePath) ||
    selectedSkill?.files[0] ||
    null;
  const fileKey = selectedSkill && selectedFile ? `${selectedSkill.id}::${selectedFile.path}` : '';

  useEffect(() => {
    if (!localSkills.length) return;
    if (localSkills.some((skill) => skill.id === selectedLibrarySkillId)) return;
    setSelectedLibrarySkillId(localSkills[0].id);
    setSelectedFilePath(getDefaultSkillFilePath(localSkills[0]));
  }, [localSkills, selectedLibrarySkillId, setSelectedFilePath, setSelectedLibrarySkillId]);

  if (localSkills.length === 0) {
    return <Empty text="本地还没有任何 Skill。" />;
  }

  return (
    <SkillsPage
      skills={localSkills}
      selectedSkillId={selectedLibrarySkillId}
      selectedSkill={selectedSkill}
      selectedFile={selectedFile}
      selectedFilePath={selectedFilePath}
      favorites={favorites}
      hostedAgentNamesBySkillId={hostedAgentNamesBySkillId}
      onSelectSkill={(skill) => {
        setSelectedLibrarySkillId(skill.id);
        setSelectedFilePath(getDefaultSkillFilePath(skill));
      }}
      onToggleFavorite={toggleFavorite}
      onOpenSkillDirectory={(skill) => openSkillDirectory(skill, 'local')}
      onReinstall={(skill) => openInstallDialog(skill, 'local')}
      onDeleteSkill={openLocalSkillDeleteDialog}
      onSelectFile={handleFileSelect}
      expandedFolders={expandedFolders}
      onToggleFolder={handleToggleFolder}
      editing={editing}
      draftValue={fileKey ? fileDrafts[fileKey] : undefined}
      onStartEdit={() => setEditing(() => true)}
      onSave={() => handleSaveFile(selectedSkill, selectedFile)}
      onCancelEdit={() => handleCancelEdit(selectedSkill, selectedFile)}
      onChangeDraft={updateDraft}
      mode="local"
    />
  );
};

export default LocalPage;
