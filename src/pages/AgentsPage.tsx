import type { Skill, SkillFile } from '../types/models';
import SkillsPage from './SkillsPage';

type AgentsPageProps = {
  skills: Skill[];
  selectedSkillId: string;
  selectedSkill: Skill | null;
  selectedFile: SkillFile | null;
  selectedFilePath: string;
  favorites: Set<string>;
  currentAgentName: string;
  installedSkillIds: Set<string>;
  onSelectSkill: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onInstallToggle: (skillId: string) => void;
  onReinstall: (skill: Skill) => void;
  onSelectFile: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  editing: boolean;
  draftValue: string | undefined;
  onToggleEdit: () => void;
  onSave: () => void;
  onChangeDraft: (value: string) => void;
};

const AgentsPage = ({ currentAgentName, installedSkillIds, ...rest }: AgentsPageProps) => (
  <SkillsPage
    {...rest}
    title="本地技能库"
    subtitle={`当前 Agent：${currentAgentName}`}
    mode="agents"
    installedSkillIds={installedSkillIds}
  />
);

export default AgentsPage;
