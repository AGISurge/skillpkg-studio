import { useEffect, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import SkillsPage from './SkillsPage';

/**
 * 收藏页封装，复用 SkillsPage。
 */
const FavoritesPage = () => {
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
    handleFileSelect,
    handleToggleFolder,
    handleSaveFile,
    updateDraft,
  } = useAppContext();

  const favoriteSkills = useMemo(
    () => localSkills.filter((skill) => favorites.has(skill.id)),
    [favorites, localSkills]
  );
  const selectedSkill =
    favoriteSkills.find((skill) => skill.id === selectedLibrarySkillId) ||
    favoriteSkills[0] ||
    null;
  const selectedFile =
    selectedSkill?.files.find((file) => file.path === selectedFilePath) ||
    selectedSkill?.files[0] ||
    null;
  const fileKey = selectedSkill && selectedFile ? `${selectedSkill.id}::${selectedFile.path}` : '';

  useEffect(() => {
    if (!favoriteSkills.length) return;
    if (favoriteSkills.some((skill) => skill.id === selectedLibrarySkillId)) return;
    setSelectedLibrarySkillId(favoriteSkills[0].id);
    setSelectedFilePath(favoriteSkills[0].files[0]?.path || '');
  }, [favoriteSkills, selectedLibrarySkillId, setSelectedFilePath, setSelectedLibrarySkillId]);

  return (
    <SkillsPage
      skills={favoriteSkills}
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
      onSelectFile={handleFileSelect}
      expandedFolders={expandedFolders}
      onToggleFolder={handleToggleFolder}
      editing={editing}
      draftValue={fileKey ? fileDrafts[fileKey] : undefined}
      onToggleEdit={() => setEditing((prev) => !prev)}
      onSave={handleSaveFile}
      onChangeDraft={updateDraft}
      title="收藏技能"
      subtitle="已收藏的技能清单"
      mode="favorites"
    />
  );
};

export default FavoritesPage;
