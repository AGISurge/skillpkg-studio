import type { Skill, SkillFile } from '../types/models';
import SkillsPage from './SkillsPage';

type FavoritesPageProps = {
  skills: Skill[];
  selectedSkillId: string;
  selectedSkill: Skill | null;
  selectedFile: SkillFile | null;
  selectedFilePath: string;
  favorites: Set<string>;
  onSelectSkill: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onSelectFile: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  editing: boolean;
  draftValue: string | undefined;
  onToggleEdit: () => void;
  onSave: () => void;
  onChangeDraft: (value: string) => void;
};

const FavoritesPage = (props: FavoritesPageProps) => (
  <SkillsPage
    {...props}
    title="收藏技能"
    subtitle="已收藏的技能清单"
    mode="favorites"
  />
);

export default FavoritesPage;
