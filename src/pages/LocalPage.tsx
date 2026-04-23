import type { Skill, SkillFile } from '../types/models';
import SkillsPage from './SkillsPage';

/**
 * 本地技能页参数。
 */
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

/**
 * 本地技能页封装，复用 SkillsPage。
 */
const LocalPage = (props: LocalPageProps) => (
  <SkillsPage
    {...props}
    title="本地技能库"
    subtitle="统一存放于本地路径"
    mode="local"
  />
);

export default LocalPage;
