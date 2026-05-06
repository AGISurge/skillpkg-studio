import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import SkillsPage from './SkillsPage';

/**
 * Agents 页面封装，复用 SkillsPage。
 */
const AgentsPage = () => {
  const navigate = useNavigate();
  const { agentId } = useParams();
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
    setSelectedAgentId,
    setSelectedLibrarySkillId,
    setSelectedFilePath,
    setEditing,
    toggleFavorite,
    handleInstallToggle,
    openInstallDialog,
    handleFileSelect,
    handleToggleFolder,
    handleSaveFile,
    updateDraft,
  } = useAppContext();

  useEffect(() => {
    if (agentId && agents.some((agent) => agent.id === agentId)) {
      setSelectedAgentId(agentId);
      return;
    }
    if (!agentId && agents[0]) {
      navigate(`/agents/${agents[0].id}`, { replace: true });
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
  const selectedSkill =
    agentSkills.find((skill) => skill.id === selectedLibrarySkillId) ||
    agentSkills[0] ||
    null;
  const selectedFile =
    selectedSkill?.files.find((file) => file.path === selectedFilePath) ||
    selectedSkill?.files[0] ||
    null;
  const fileKey = selectedSkill && selectedFile ? `${selectedSkill.id}::${selectedFile.path}` : '';
  const currentAgentName = agents.find((agent) => agent.id === currentAgentId)?.name || '';

  useEffect(() => {
    if (!agentSkills.length) return;
    if (agentSkills.some((skill) => skill.id === selectedLibrarySkillId)) return;
    setSelectedLibrarySkillId(agentSkills[0].id);
    setSelectedFilePath(
      agentSkills[0].files.find((file) => file.path === 'SKILL.md')?.path ||
        agentSkills[0].files[0]?.path ||
        '',
    );
  }, [agentSkills, selectedLibrarySkillId, setSelectedFilePath, setSelectedLibrarySkillId]);

  return (
    <SkillsPage
      skills={agentSkills}
      selectedSkillId={selectedLibrarySkillId}
      selectedSkill={selectedSkill}
      selectedFile={selectedFile}
      selectedFilePath={selectedFilePath}
      favorites={favorites}
      installedSkillIds={installedSkillIds}
      onSelectSkill={(skill) => {
        setSelectedLibrarySkillId(skill.id);
        setSelectedFilePath(
          skill.files.find((file) => file.path === 'SKILL.md')?.path ||
            skill.files[0]?.path ||
            '',
        );
      }}
      onToggleFavorite={toggleFavorite}
      onInstallToggle={handleInstallToggle}
      onReinstall={openInstallDialog}
      onSelectFile={handleFileSelect}
      expandedFolders={expandedFolders}
      onToggleFolder={handleToggleFolder}
      editing={editing}
      draftValue={fileKey ? fileDrafts[fileKey] : undefined}
      onToggleEdit={() => setEditing((prev) => !prev)}
      onSave={() => handleSaveFile(selectedSkill, selectedFile)}
      onChangeDraft={updateDraft}
      mode="agents"
    />
  );
};

export default AgentsPage;
