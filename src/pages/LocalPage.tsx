import { useEffect, useMemo } from 'react';
import { useAppContext, useToolbar } from '../AppContext';
import ImportSkillDropdown from '../components/ImportSkillDropdown';
import SkillsPage from './SkillsPage';

const getDefaultSkillFilePath = (skill: { files: Array<{ path: string }> }) =>
  skill.files.find((file) => file.path === 'SKILL.md')?.path ||
  skill.files[0]?.path ||
  '';

/**
 * 本地技能页封装，复用 SkillsPage。
 */
const LocalPage = () => {
  const {
    localSkills,
    selectedLibrarySkillId,
    selectedFilePath,
    favorites,
    expandedFolders,
    editing,
    fileDrafts,
    importStatus,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    openInstallDialog,
    openImportSkill,
    handleFileSelect,
    handleToggleFolder,
    handleSaveFile,
    handleCancelEdit,
    updateDraft,
  } = useAppContext();

  const toolbar = useMemo(
    () => (
      <ImportSkillDropdown status={importStatus} onSelect={openImportSkill} />
    ),
    [importStatus, openImportSkill],
  );
  useToolbar(toolbar);

  const selectedSkill =
    localSkills.find((skill) => skill.id === selectedLibrarySkillId) ||
    localSkills[0] ||
    null;
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

  return (
    <SkillsPage
      skills={localSkills}
      selectedSkillId={selectedLibrarySkillId}
      selectedSkill={selectedSkill}
      selectedFile={selectedFile}
      selectedFilePath={selectedFilePath}
      favorites={favorites}
      onSelectSkill={(skill) => {
        setSelectedLibrarySkillId(skill.id);
        setSelectedFilePath(getDefaultSkillFilePath(skill));
      }}
      onToggleFavorite={toggleFavorite}
      onReinstall={(skill) => openInstallDialog(skill, 'local')}
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
