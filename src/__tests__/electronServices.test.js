const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  hasSkillMarkdown,
  loadSkillsFromPath,
  parseSkillMarkdownMetadata,
} = require('../../electron/skillScanner');
const { resolveAgentSkillPath } = require('../../electron/agentCatalog');

describe('electron skill services', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillpkg-test-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('recognizes only folders with uppercase SKILL.md', async () => {
    const validDir = path.join(tmpDir, 'valid');
    const invalidDir = path.join(tmpDir, 'invalid');
    await fs.mkdir(validDir);
    await fs.mkdir(invalidDir);
    await fs.writeFile(path.join(validDir, 'SKILL.md'), '# Valid');
    await fs.writeFile(path.join(invalidDir, 'skill.md'), '# Invalid');

    await expect(hasSkillMarkdown(validDir)).resolves.toBe(true);
    await expect(hasSkillMarkdown(invalidDir)).resolves.toBe(false);
  });

  test('parses frontmatter and heading metadata from SKILL.md', () => {
    expect(
      parseSkillMarkdownMetadata([
        '---',
        'name: "Repo Analyst"',
        "description: 'Analyzes repositories'",
        'version: 1.2.3',
        '---',
        '',
        '# Ignored Heading',
      ].join('\n')),
    ).toEqual({
      name: 'Repo Analyst',
      description: 'Analyzes repositories',
      version: '1.2.3',
    });

    expect(parseSkillMarkdownMetadata('# Heading Name\n\nBody')).toEqual({
      name: 'Heading Name',
    });
  });

  test('parses block scalar descriptions from SKILL.md frontmatter', () => {
    const metadata = parseSkillMarkdownMetadata([
      '---',
      'name: khazix-writer',
      'description: |',
      '  数字生命卡兹克（Khazix）的公众号长文写作skill。',
      '  当用户需要撰写公众号文章、写稿子、续写文章、根据素材产出长文时使用。',
      'version: 0.1.0',
      '---',
      '',
      '# Khazix Writer',
    ].join('\n'));

    expect(metadata).toEqual({
      name: 'khazix-writer',
      description: [
        '数字生命卡兹克（Khazix）的公众号长文写作skill。',
        '当用户需要撰写公众号文章、写稿子、续写文章、根据素材产出长文时使用。',
      ].join('\n'),
      version: '0.1.0',
    });
  });

  test('marks agent skills as managed only when symlink targets the library', async () => {
    const libraryRoot = path.join(tmpDir, 'library');
    const agentRoot = path.join(tmpDir, 'agent');
    const managedSkill = path.join(libraryRoot, 'managed');
    const ownSkill = path.join(agentRoot, 'own');
    await fs.mkdir(managedSkill, { recursive: true });
    await fs.mkdir(ownSkill, { recursive: true });
    await fs.writeFile(path.join(managedSkill, 'SKILL.md'), '# Managed');
    await fs.writeFile(path.join(ownSkill, 'SKILL.md'), '# Own');
    await fs.symlink(managedSkill, path.join(agentRoot, 'managed'), 'dir');

    const skills = await loadSkillsFromPath(agentRoot, {
      mode: 'agent',
      agentId: 'claude',
      installPath: libraryRoot,
    });

    expect(skills.map((skill) => [skill.id, skill.source, skill.managed])).toEqual([
      ['managed', 'managed', true],
      ['own', 'agent', false],
    ]);
  });

  test('loads only SKILL.md content for agent skill scans', async () => {
    const agentRoot = path.join(tmpDir, 'agent');
    const skillRoot = path.join(agentRoot, 'large-skill');
    await fs.mkdir(path.join(skillRoot, 'assets'), { recursive: true });
    await fs.writeFile(path.join(skillRoot, 'SKILL.md'), '# Large Skill');
    await fs.writeFile(path.join(skillRoot, 'assets', 'large.txt'), 'large-content');

    const [skill] = await loadSkillsFromPath(agentRoot, {
      mode: 'agent',
      agentId: 'claude',
      installPath: path.join(tmpDir, 'library'),
    });

    expect(skill.files).toEqual([
      { path: 'SKILL.md', content: '# Large Skill', contentLoaded: true },
      { path: 'assets/large.txt', content: '', contentLoaded: false },
    ]);
  });

  test('resolves macOS agent skill paths', () => {
    expect(resolveAgentSkillPath('claude')).toBe(path.join(os.homedir(), '.claude', 'skills'));
    expect(resolveAgentSkillPath('codex')).toBe(path.join(os.homedir(), '.codex', 'skills'));
    expect(resolveAgentSkillPath('cursor')).toBe(path.join(os.homedir(), '.cursor', 'skills'));
  });
});
