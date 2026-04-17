import type { Skill, SkillFile } from '../types/models';
import SkillsPage from './SkillsPage';

type LocalPageProps = {
  skills: Skill[];
  selectedSkillId: string;
  selectedSkill: Skill | null;
  selectedFile: SkillFile | null;
  selectedFilePath: string;
  favorites: Set<string>;
  onSelectSkill: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
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

const LocalPage = (props: LocalPageProps) => (
  <SkillsPage
    {...props}
    title="本地技能库"
    subtitle="统一存放于本地路径"
    mode="local"
  />
);

export default LocalPage;
