import { useEffect } from 'react';
import { useAppContext } from '../AppContext';
import SkillsPage from './SkillsPage';

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
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    openInstallDialog,
    handleFileSelect,
    handleToggleFolder,
    handleSaveFile,
    updateDraft,
  } = useAppContext();

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
    setSelectedFilePath(localSkills[0].files[0]?.path || '');
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
        setSelectedFilePath(skill.files[0]?.path || '');
      }}
      onToggleFavorite={toggleFavorite}
      onReinstall={openInstallDialog}
      onSelectFile={handleFileSelect}
      expandedFolders={expandedFolders}
      onToggleFolder={handleToggleFolder}
      editing={editing}
      draftValue={fileKey ? fileDrafts[fileKey] : undefined}
      onToggleEdit={() => setEditing((prev) => !prev)}
      onSave={handleSaveFile}
      onChangeDraft={updateDraft}
      title="本地技能库"
      subtitle="统一存放于本地路径"
      mode="local"
    />
  );
};

export default LocalPage;
