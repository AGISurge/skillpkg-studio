import { useEffect, useMemo } from 'react';
import { FolderOpenRegular, LinkRegular } from '@fluentui/react-icons';
import { useAppContext, useToolbar } from '../AppContext';
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
    fileInputRef,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    openInstallDialog,
    handleFileSelect,
    handleToggleFolder,
    handleSaveFile,
    handleCancelEdit,
    handleImportZip,
    handleSelectInstallPath,
    updateDraft,
  } = useAppContext();

  const toolbar = useMemo(
    () => (
      <>
        <button type="button" className="btn ghost" onClick={() => fileInputRef.current?.click()}>
          <FolderOpenRegular className="icon" />
          导入 Zip
        </button>
        <button type="button" className="btn primary" onClick={handleSelectInstallPath}>
          <LinkRegular className="icon" />
          统一路径
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleImportZip}
        />
      </>
    ),
    [fileInputRef, handleImportZip, handleSelectInstallPath],
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
      onReinstall={openInstallDialog}
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
