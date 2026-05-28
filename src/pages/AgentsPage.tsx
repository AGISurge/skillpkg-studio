import { useCallback, useEffect, useMemo, useTransition } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Empty from '../components/Empty';
import SkillsPage from './SkillsPage';

/**
 * Agents 页面封装，复用 SkillsPage。
 */
const getDefaultSkillFilePath = (files: Array<{ path: string }>) =>
  files.find((file) => file.path === 'SKILL.md')?.path || files[0]?.path || '';

const AgentsPage = () => {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const [, startSkillTransition] = useTransition();
  const {
    agents,
    agentSkillsByAgent,
    selectedAgentId,
    selectedLibrarySkillId,
    selectedFilePath,
    favorites,
    expandedFolders,
    editing,
    fileDrafts,
    installedByAgent,
    pendingSkillIds,
    setSelectedAgentId,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    handleInstallToggle,
    openAgentSkillDeleteDialog,
    openInstallDialog,
    handleFileSelect,
    loadSkillFileContent,
    handleToggleFolder,
    handleSaveFile,
    handleCancelEdit,
    updateDraft,
  } = useAppContext();

  useEffect(() => {
    const firstAgentId = agents[0]?.id || '';
    const agentExists = Boolean(
      agentId && agents.some((agent) => agent.id === agentId),
    );

    if (agentId) {
      if (agentExists) {
        setSelectedAgentId(agentId);
        return;
      }
      setSelectedAgentId(firstAgentId);
      navigate(firstAgentId ? `/agents/${firstAgentId}` : '/agents', {
        replace: true,
      });
      return;
    }

    if (firstAgentId) {
      setSelectedAgentId(firstAgentId);
      navigate(`/agents/${firstAgentId}`, { replace: true });
    }
  }, [agentId, agents, navigate, setSelectedAgentId]);

  const currentAgentId =
    agentId && agents.some((agent) => agent.id === agentId) ? agentId : selectedAgentId;
  const installedSkillIds = useMemo(
    () => installedByAgent[currentAgentId] || new Set<string>(),
    [currentAgentId, installedByAgent]
  );
  const agentSkills = useMemo(
    () => agentSkillsByAgent[currentAgentId] || [],
    [agentSkillsByAgent, currentAgentId]
  );
  const selectedSkill = useMemo(
    () =>
      agentSkills.find((skill) => skill.id === selectedLibrarySkillId) ||
      agentSkills[0] ||
      null,
    [agentSkills, selectedLibrarySkillId],
  );
  const selectedFile = useMemo(
    () =>
      selectedSkill?.files.find((file) => file.path === selectedFilePath) ||
      selectedSkill?.files[0] ||
      null,
    [selectedFilePath, selectedSkill],
  );
  const fileKey = selectedSkill && selectedFile ? `${selectedSkill.id}::${selectedFile.path}` : '';

  const handleSelectSkill = useCallback((skill: (typeof agentSkills)[number]) => {
    startSkillTransition(() => {
      setSelectedLibrarySkillId(skill.id);
      setSelectedFilePath(getDefaultSkillFilePath(skill.files));
    });
  }, [setSelectedFilePath, setSelectedLibrarySkillId, startSkillTransition]);

  const handleSelectFile = useCallback((path: string) => {
    handleFileSelect(path);
    void loadSkillFileContent(selectedSkill, path);
  }, [handleFileSelect, loadSkillFileContent, selectedSkill]);

  useEffect(() => {
    if (!agentSkills.length) return;
    if (agentSkills.some((skill) => skill.id === selectedLibrarySkillId)) return;
    setSelectedLibrarySkillId(agentSkills[0].id);
    setSelectedFilePath(getDefaultSkillFilePath(agentSkills[0].files));
  }, [agentSkills, selectedLibrarySkillId, setSelectedFilePath, setSelectedLibrarySkillId]);

  useEffect(() => {
    if (!selectedSkill || !selectedFile) return;
    void loadSkillFileContent(selectedSkill, selectedFile.path);
  }, [loadSkillFileContent, selectedFile, selectedSkill]);

  if (agentSkills.length === 0) {
    const agentName =
      agents.find((agent) => agent.id === currentAgentId)?.name || '当前 Agent';

    return <Empty text={`${agentName} 还没有任何 Skill。`} />;
  }

  return (
    <SkillsPage
      skills={agentSkills}
      selectedSkillId={selectedLibrarySkillId}
      selectedSkill={selectedSkill}
      selectedFile={selectedFile}
      selectedFilePath={selectedFilePath}
      favorites={favorites}
      installedSkillIds={installedSkillIds}
      pendingSkillIds={pendingSkillIds}
      onSelectSkill={handleSelectSkill}
      onToggleFavorite={toggleFavorite}
      onInstallToggle={handleInstallToggle}
      onDeleteSkill={openAgentSkillDeleteDialog}
      onReinstall={(skill) => openInstallDialog(skill, 'agents')}
      onSelectFile={handleSelectFile}
      expandedFolders={expandedFolders}
      onToggleFolder={handleToggleFolder}
      editing={editing}
      draftValue={fileKey ? fileDrafts[fileKey] : undefined}
      onStartEdit={() => setEditing(() => true)}
      onSave={() => handleSaveFile(selectedSkill, selectedFile)}
      onCancelEdit={() => handleCancelEdit(selectedSkill, selectedFile)}
      onChangeDraft={updateDraft}
      mode="agents"
    />
  );
};

export default AgentsPage;
