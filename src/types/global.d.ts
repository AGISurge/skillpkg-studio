import type { Skill } from './models';

declare global {
  interface Window {
    skillpkg?: {
      selectInstallPath: () => Promise<string | null>;
      loadSkills: (installPath: string) => Promise<Skill[]>;
      installSkill: (payload: { installPath: string; skill: Skill }) => Promise<boolean>;
      detectAgents: (
        names: string | readonly string[]
      ) => Promise<{ name: string; installed: boolean }[]>;
      saveSkillFile: (payload: {
        installPath: string;
        skillId: string;
        filePath: string;
        content: string;
      }) => Promise<boolean>;
    };
  }
}

export {};
