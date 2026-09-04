import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SkillGroupDialog, { SkillMultiSelect } from './SkillGroupDialog';
import SwitchSkillGroupButton from './SwitchSkillGroupButton';
import type { Agent, Skill, SkillGroup } from '../types/models';

const mockContext = {
  groups: [] as SkillGroup[], loading: false, error: '', refresh: jest.fn(async () => {}),
  save: jest.fn(async (_draft: unknown): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
  remove: jest.fn(async (_id: string) => ({ ok: true })),
  switchGroup: jest.fn(async (_agent: string, _group: SkillGroup): Promise<{ ok: boolean; error?: string; reason?: string }> => ({ ok: true })),
};
jest.mock('../SkillGroupsContext', () => ({ useSkillGroups: () => mockContext }));
const skills: Skill[] = Array.from({ length: 45 }, (_, i) => ({
  id: `skill-${i}`, name: `Skill ${i}`, description: i === 44 ? 'special-description-keyword' : `Description ${i}`,
  version: '1', author: 'Local', tags: [], files: [], type: 'skill', source: 'library',
}));
const group: SkillGroup = { id: 'group', name: 'Design', skillIds: ['skill-0'], createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const agent = { id: 'codex', name: 'Codex', skillPath: '/test/agent/skills' } as Agent;
beforeEach(() => {
  jest.clearAllMocks();
  mockContext.groups = [group];
  mockContext.save.mockResolvedValue({ ok: true });
  mockContext.remove.mockResolvedValue({ ok: true });
  mockContext.refresh.mockResolvedValue(undefined);
  mockContext.switchGroup.mockResolvedValue({ ok: true });
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

test('searches all skills by description, loads more and retains checked state across filters', () => {
  const Harness = () => {
    const [selected, setSelected] = useState(new Set<string>());
    return <SkillMultiSelect skills={skills} selected={selected} onToggle={(id) => setSelected((current) => {
      const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
    })} />;
  };
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /选择技能/ }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(20);
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(40);
  fireEvent.change(screen.getByRole('textbox', { name: '筛选本地技能' }), { target: { value: 'special-description' } });
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByText('Skill 44')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '筛选本地技能' }), { target: { value: '' } });
  expect(screen.getAllByRole('checkbox')).toHaveLength(20);
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
});
test('rejects invalid names, duplicates and empty selections, excludes solutions', async () => {
  render(<SkillGroupDialog group={null} skills={[...skills, { ...skills[0], id: 'solution', name: 'Solution', type: 'solution' }]} onClose={jest.fn()} />);
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(screen.getByRole('alert')).toHaveTextContent('不能为空');
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: ' design ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(screen.getByRole('alert')).toHaveTextContent('已存在');
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: 'New' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(screen.getByRole('alert')).toHaveTextContent('至少');
  fireEvent.click(screen.getByRole('button', { name: /选择技能/ }));
  fireEvent.change(screen.getByRole('textbox', { name: '筛选本地技能' }), { target: { value: 'Solution' } });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(mockContext.save).not.toHaveBeenCalled();
});
test('tag removal and checkbox selection stay synchronized', () => {
  render(<SkillGroupDialog group={group} skills={skills} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '移除 Skill 0' }));
  expect(screen.getByLabelText('已选技能')).not.toHaveTextContent('Skill 0');
  fireEvent.click(screen.getByRole('button', { name: /选择技能/ }));
  expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  expect(screen.getByLabelText('已选技能')).toHaveTextContent('Skill 0');
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  expect(screen.getByLabelText('已选技能')).not.toHaveTextContent('Skill 0');
});
test('save failure preserves the draft and successful save closes the editor', async () => {
  const close = jest.fn();
  mockContext.save.mockResolvedValueOnce({ ok: false, error: 'disk error' });
  render(<SkillGroupDialog group={group} skills={skills} onClose={close} />);
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: ' New Name ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('disk error'));
  expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue(' New Name ');
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockContext.save).toHaveBeenLastCalledWith({ id: group.id, name: 'New Name', skillIds: ['skill-0'] });
});
test('cancel with edits requires discard confirmation; returning to original values is clean', () => {
  const close = jest.fn();
  render(<SkillGroupDialog group={group} skills={skills} onClose={close} />);
  const name = screen.getByRole('textbox', { name: '名称' });
  fireEvent.change(name, { target: { value: 'Edited' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('dialog', { name: '放弃未保存的修改？' })).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
  fireEvent.change(name, { target: { value: 'Design' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(close).toHaveBeenCalledTimes(1);
});
test('delete requires confirmation and only deletes the group', async () => {
  const close = jest.fn();
  render(<SkillGroupDialog group={group} skills={skills} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  expect(mockContext.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockContext.remove).toHaveBeenCalledWith('group');
  expect(mockContext.switchGroup).not.toHaveBeenCalled();
});
test('switch offers ten groups initially, searches all, disables empty groups and cancellation never switches', () => {
  mockContext.groups = Array.from({ length: 23 }, (_, i) => ({ ...group, id: `group-${i}`, name: `Group ${i}`, skillIds: i ? ['skill-0'] : [] }));
  render(<SwitchSkillGroupButton agent={agent} skills={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '切换技能组' }));
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  expect(screen.getAllByRole('radio')[0]).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(screen.getAllByRole('radio')).toHaveLength(20);
  fireEvent.change(screen.getByRole('textbox', { name: '筛选技能组' }), { target: { value: 'Group 22' } });
  fireEvent.click(screen.getByRole('radio'));
  const dialog = screen.getByRole('dialog', { name: '确认切换技能组' });
  expect(dialog).toHaveTextContent('非托管技能会先保存到本地库');
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(mockContext.switchGroup).not.toHaveBeenCalled();
});
test('confirmation switches once with the displayed group snapshot', async () => {
  render(<SwitchSkillGroupButton agent={agent} skills={skills.slice(0, 2)} />);
  fireEvent.click(screen.getByRole('button', { name: '切换技能组' }));
  fireEvent.click(screen.getByRole('radio'));
  fireEvent.click(screen.getByRole('button', { name: '确认切换' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已切换'));
  expect(mockContext.switchGroup).toHaveBeenCalledTimes(1);
  expect(mockContext.switchGroup).toHaveBeenCalledWith('codex', group);
});
