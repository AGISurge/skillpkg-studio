import { useEffect, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import SkillsPage from './SkillsPage';

const getDefaultSkillFilePath = (skill: { files: Array<{ path: string }> }) =>
  skill.files.find((file) => file.path === 'SKILL.md')?.path ||
  skill.files[0]?.path ||
  '';

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
    handleCancelEdit,
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
    setSelectedFilePath(getDefaultSkillFilePath(favoriteSkills[0]));
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
        setSelectedFilePath(getDefaultSkillFilePath(skill));
      }}
      onToggleFavorite={toggleFavorite}
      onSelectFile={handleFileSelect}
      expandedFolders={expandedFolders}
      onToggleFolder={handleToggleFolder}
      editing={editing}
      draftValue={fileKey ? fileDrafts[fileKey] : undefined}
      onStartEdit={() => setEditing(() => true)}
      onSave={() => handleSaveFile(selectedSkill, selectedFile)}
      onCancelEdit={() => handleCancelEdit(selectedSkill, selectedFile)}
      onChangeDraft={updateDraft}
      mode="favorites"
    />
  );
};

export default FavoritesPage;
