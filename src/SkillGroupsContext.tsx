import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppContext } from './AppContext';
import type { SkillGroup, SkillGroupResult } from './types/models';

type SkillGroupsValue = {
  groups: SkillGroup[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  save: (draft: { id?: string; name: string; skillIds: string[] }) => Promise<SkillGroupResult>;
  remove: (id: string) => Promise<SkillGroupResult>;
  switchGroup: (agentId: string, group: SkillGroup) => Promise<SkillGroupResult>;
};
const Context = createContext<SkillGroupsValue | null>(null);
export const groupError = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

export const SkillGroupsProvider = ({ children }: { children: ReactNode }) => {
  const { installPath, localSkills, refreshLocalSkills, refreshAgents, setSelectedLibrarySkillId, setSelectedFilePath } = useAppContext();
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    if (!window.skillpkg?.listSkillGroups) return;
    setLoading(true);
    try {
      const result = await window.skillpkg.listSkillGroups({ installPath });
      if (id === request.current) { setGroups(result); setError(''); }
    } catch (failure) {
      if (id === request.current) setError(groupError(failure));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [installPath]);
  useEffect(() => { void refresh(); }, [refresh, localSkills]);
  useEffect(() => window.skillpkg?.onSkillGroupsChanged?.((change) => {
    void refresh();
    if (change.refreshLibrary && installPath) {
      void refreshLocalSkills(installPath).catch((failure) => setError(groupError(failure)));
    }
  }), [installPath, refresh, refreshLocalSkills]);

  const save: SkillGroupsValue['save'] = async (draft) => {
    try {
      if (!window.skillpkg?.saveSkillGroup) throw new Error('当前环境不支持保存技能组。');
      const result = await window.skillpkg.saveSkillGroup({ ...draft, installPath });
      if (result.ok) await refresh();
      return result;
    } catch (failure) { return { ok: false, error: groupError(failure) }; }
  };
  const remove = async (id: string) => {
    try {
      if (!window.skillpkg?.deleteSkillGroup) throw new Error('当前环境不支持删除技能组。');
      const result = await window.skillpkg.deleteSkillGroup({ id });
      if (result.ok) await refresh();
      return result;
    } catch (failure) { return { ok: false, error: groupError(failure) }; }
  };
  const switchGroup = async (agentId: string, group: SkillGroup) => {
    let result: SkillGroupResult;
    try {
      if (!window.skillpkg?.switchAgentSkillGroup) throw new Error('当前环境不支持切换技能组。');
      result = await window.skillpkg.switchAgentSkillGroup({ agentId, groupId: group.id, installPath, expectedGroup: group });
    } catch (failure) { result = { ok: false, error: groupError(failure) }; }
    // A failed switch may still have safely hosted skills in the local library.
    await Promise.allSettled([refresh(), refreshLocalSkills(installPath), refreshAgents()]);
    if (result.ok) {
      setSelectedLibrarySkillId('');
      setSelectedFilePath('');
    }
    return result;
  };
  return <Context.Provider value={{ groups, loading, error, refresh, save, remove, switchGroup }}>{children}</Context.Provider>;
};

export const useSkillGroups = () => {
  const context = useContext(Context);
  if (!context) throw new Error('SkillGroupsProvider is required');
  return context;
};
