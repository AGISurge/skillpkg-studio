const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

global.setImmediate = global.setImmediate || ((callback, ...args) => setTimeout(callback, 0, ...args));

const {
  hasSkillMarkdown,
  loadSkillsFromPath,
  parseSkillMarkdownMetadata,
} = require('../../electron/skillScanner');
const {
  importSkillSource,
  normalizeGitSource,
  scanImportCandidates,
} = require('../../electron/importService');
const { getFilePolicy } = require('../../electron/filePolicy');
const { unhostAgentSkillLink } = require('../../electron/agentService');
const { resolveAgentSkillPath } = require('../../electron/agentCatalog');
const { getDefaultSkillLibraryPath } = require('../../electron/pathUtils');
const {
  buildSkillpkgSkillDetailPath,
  buildSkillpkgSkillDownloadPath,
  buildSkillpkgSkillsPath,
  getSkillpkgSkillDetail,
  getSkillpkgSkillDownloadUrl,
  listSkillpkgSkills,
} = require('../../electron/skillpkgApi');

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

  test('marks agent links to the default skill library as managed', async () => {
    const homeDirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
    try {
      const libraryRoot = path.join(tmpDir, '.skillpkg', 'skills');
      const agentRoot = path.join(tmpDir, 'agent');
      const managedSkill = path.join(libraryRoot, 'managed');
      await fs.mkdir(managedSkill, { recursive: true });
      await fs.mkdir(agentRoot, { recursive: true });
      await fs.writeFile(path.join(managedSkill, 'SKILL.md'), '# Managed');
      await fs.symlink(managedSkill, path.join(agentRoot, 'managed'), 'dir');

      const [skill] = await loadSkillsFromPath(agentRoot, {
        mode: 'agent',
        agentId: 'claude',
      });

      expect(skill).toEqual(expect.objectContaining({
        id: 'managed',
        source: 'managed',
        managed: true,
      }));
    } finally {
      homeDirSpy.mockRestore();
    }
  });

  test('marks double symlinks through the managed library as managed', async () => {
    const libraryRoot = path.join(tmpDir, 'library');
    const agentRoot = path.join(tmpDir, 'agent');
    const originalSkill = path.join(agentRoot, 'originals', 'browse');
    const libraryLink = path.join(libraryRoot, 'browse');
    const agentLink = path.join(agentRoot, 'browse');
    await fs.mkdir(originalSkill, { recursive: true });
    await fs.mkdir(libraryRoot, { recursive: true });
    await fs.writeFile(path.join(originalSkill, 'SKILL.md'), '# Browse');
    await fs.symlink(originalSkill, libraryLink, 'dir');
    await fs.symlink(libraryLink, agentLink, 'dir');

    const [skill] = await loadSkillsFromPath(agentRoot, {
      mode: 'agent',
      agentId: 'claude',
      installPath: libraryRoot,
    });

    const originalSkillRealPath = await fs.realpath(originalSkill);
    expect({
      id: skill.id,
      source: skill.source,
      managed: skill.managed,
      linkTarget: skill.linkTarget,
      realPath: skill.realPath,
    }).toEqual({
      id: 'browse',
      source: 'managed',
      managed: true,
      linkTarget: libraryLink,
      realPath: originalSkillRealPath,
    });
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
      expect.objectContaining({
        path: 'SKILL.md',
        content: '# Large Skill',
        contentLoaded: true,
        kind: 'text',
      }),
      expect.objectContaining({
        path: 'assets/large.txt',
        content: '',
        contentLoaded: false,
        kind: 'text',
      }),
    ]);
  });

  test('classifies previewable images, editable text, and blocked binary files', async () => {
    const policyRoot = path.join(tmpDir, 'policy');
    const skillRoot = path.join(policyRoot, 'mixed');
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, 'SKILL.md'), '# Mixed');
    await fs.writeFile(path.join(skillRoot, 'notes.txt'), 'editable');
    await fs.writeFile(path.join(skillRoot, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await fs.writeFile(path.join(skillRoot, 'archive.zip'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const [skill] = await loadSkillsFromPath(policyRoot);

    expect(skill.files.find((file) => file.path === 'notes.txt')).toEqual(
      expect.objectContaining({
        content: 'editable',
        contentLoaded: true,
        kind: 'text',
      }),
    );
    expect(skill.files.find((file) => file.path === 'logo.png')).toEqual(
      expect.objectContaining({
        contentLoaded: true,
        kind: 'image',
        mimeType: 'image/png',
      }),
    );
    expect(skill.files.find((file) => file.path === 'archive.zip')).toEqual(
      expect.objectContaining({
        content: '',
        contentLoaded: true,
        kind: 'binary',
        loadReason: 'unsupported-file-type',
      }),
    );
    expect(getFilePolicy('large.bin', 128).canLoad).toBe(false);
  });

  test('unhosts a managed skill by replacing the symlink with a local copy', async () => {
    const libraryRoot = path.join(tmpDir, 'library');
    const agentRoot = path.join(tmpDir, 'agent');
    const managedSkill = path.join(libraryRoot, 'managed');
    const agentLink = path.join(agentRoot, 'managed');
    await fs.mkdir(managedSkill, { recursive: true });
    await fs.mkdir(agentRoot, { recursive: true });
    await fs.writeFile(path.join(managedSkill, 'SKILL.md'), '# Managed');
    await fs.writeFile(path.join(managedSkill, 'notes.txt'), 'library-copy');
    await fs.symlink(managedSkill, agentLink, 'dir');

    const result = await unhostAgentSkillLink({
      agent: {
        id: 'test-agent',
        name: 'Test Agent',
        pathMac: agentRoot,
        pathWindows: agentRoot,
      },
      skillId: 'managed',
      installPath: libraryRoot,
    });

    expect(result).toEqual({ ok: true, removed: true });
    const localStats = await fs.lstat(agentLink);
    expect(localStats.isSymbolicLink()).toBe(false);
    expect(localStats.isDirectory()).toBe(true);
    await expect(fs.readFile(path.join(agentLink, 'notes.txt'), 'utf-8')).resolves.toBe('library-copy');
    await expect(fs.readFile(path.join(managedSkill, 'notes.txt'), 'utf-8')).resolves.toBe('library-copy');
  });

  test('resolves macOS agent skill paths', () => {
    expect(resolveAgentSkillPath('claude')).toBe(path.join(os.homedir(), '.claude', 'skills'));
    expect(resolveAgentSkillPath('codex')).toBe(path.join(os.homedir(), '.codex', 'skills'));
    expect(resolveAgentSkillPath('cursor')).toBe(path.join(os.homedir(), '.cursor', 'skills'));
  });
});

describe('skillpkg external api client', () => {
  test('builds default skill list query params', () => {
    expect(buildSkillpkgSkillsPath({
      page: 1,
      pageSize: 20,
    })).toBe('/api/v1/skills?page=1&pageSize=20');
  });

  test('builds combined featured search and multi-category query params', () => {
    expect(buildSkillpkgSkillsPath({
      categoryPublicIds: ['cat_a', 'cat_b'],
      q: ' code ',
      isFeatured: true,
      page: 2,
      pageSize: 20,
    })).toBe('/api/v1/skills?categoryPublicIds=cat_a%2Ccat_b&q=code&isFeatured=true&page=2&pageSize=20');
  });

  test('builds skill detail and download paths from public id', () => {
    expect(buildSkillpkgSkillDetailPath('skill_public_1')).toBe('/api/v1/skills/skill_public_1');
    expect(buildSkillpkgSkillDownloadPath('skill_public_1')).toBe('/api/v1/skills/skill_public_1/download');
  });

  test('requests paged skills without requiring a type field', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          docs: [
            {
              publicId: 'skill_public_1',
              slug: 'code-review',
              name: 'Code Review',
              description: 'Review code changes',
              category: null,
              author: { slug: 'author', displayName: 'Author' },
              isFeatured: true,
            },
          ],
          meta: {
            totalDocs: 1,
            totalPages: 1,
            page: 1,
            limit: 20,
          },
        },
      }),
    });

    const result = await listSkillpkgSkills({
      apiKey: 'skp_test',
      baseUrl: 'https://example.test',
      fetchImpl,
      categoryPublicIds: ['cat_a'],
      page: 1,
      pageSize: 20,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v1/skills?categoryPublicIds=cat_a&page=1&pageSize=20',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer skp_test',
        },
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      docs: [
        expect.objectContaining({
          publicId: 'skill_public_1',
          name: 'Code Review',
        }),
      ],
    }));
  });

  test('requests skill detail by public id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          publicId: 'skill_public_1',
          slug: 'code-review',
          name: 'Code Review',
          skillMd: '# Code Review',
          fileStructure: [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file', bytes: 32 }],
          downloadCount: 5,
          publisher: null,
        },
      }),
    });

    const result = await getSkillpkgSkillDetail({
      apiKey: 'skp_test',
      baseUrl: 'https://example.test',
      fetchImpl,
      publicId: 'skill_public_1',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v1/skills/skill_public_1',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer skp_test',
        },
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      detail: expect.objectContaining({
        publicId: 'skill_public_1',
        skillMd: '# Code Review',
      }),
    }));
  });

  test('requests skill download url by public id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          url: 'https://example.test/downloads/skill.zip?signature=test',
        },
      }),
    });

    const result = await getSkillpkgSkillDownloadUrl({
      apiKey: 'skp_test',
      baseUrl: 'https://example.test',
      fetchImpl,
      publicId: 'skill_public_1',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/v1/skills/skill_public_1/download',
      expect.any(Object),
    );
    expect(result).toEqual({
      ok: true,
      url: 'https://example.test/downloads/skill.zip?signature=test',
    });
  });
});

describe('default skill library paths', () => {
  test('uses ~/.skillpkg/skills on macOS and Linux', () => {
    expect(getDefaultSkillLibraryPath({
      platform: 'darwin',
      homeDir: '/Users/example',
    })).toBe(path.join('/Users/example', '.skillpkg', 'skills'));
    expect(getDefaultSkillLibraryPath({
      platform: 'linux',
      homeDir: '/home/example',
    })).toBe(path.join('/home/example', '.skillpkg', 'skills'));
  });

  test('uses AppData/skillpkg/skills on Windows', () => {
    expect(getDefaultSkillLibraryPath({
      platform: 'win32',
      homeDir: 'C:\\Users\\Example',
      appDataPath: 'C:\\Users\\Example\\AppData\\Roaming',
    })).toBe(path.join('C:\\Users\\Example\\AppData\\Roaming', 'skillpkg', 'skills'));
  });

  test('falls back to the Windows roaming AppData path when appData is missing', () => {
    expect(getDefaultSkillLibraryPath({
      platform: 'win32',
      homeDir: 'C:\\Users\\Example',
      env: { APPDATA: '' },
    })).toBe(path.join('C:\\Users\\Example', 'AppData', 'Roaming', 'skillpkg', 'skills'));
  });
});

const createZip = async (zipPath, files) => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillpkg-zip-src-'));
  try {
    await Promise.all(
      Object.entries(files).map(async ([filePath, content]) => {
        const target = path.join(sourceDir, ...filePath.split('/'));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
      }),
    );
    execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir });
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
};

describe('electron import service', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillpkg-import-test-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('imports a zip with SKILL.md at the archive root', async () => {
    const zipPath = path.join(tmpDir, 'root-skill.zip');
    const installPath = path.join(tmpDir, 'library');
    await createZip(zipPath, {
      'SKILL.md': '# Root Skill',
      'notes.txt': 'from zip',
    });

    const result = await importSkillSource({
      kind: 'zip',
      zipPath,
      installPath,
      tempRoot: path.join(tmpDir, 'imports'),
    });

    expect(result.ok).toBe(true);
    expect(result.skill).toEqual(expect.objectContaining({
      id: 'root-skill',
      name: 'Root Skill',
    }));
    await expect(fs.readFile(path.join(installPath, 'root-skill', 'notes.txt'), 'utf-8')).resolves.toBe('from zip');
  });

  test('imports a single skill from a zip subdirectory', async () => {
    const zipPath = path.join(tmpDir, 'bundle.zip');
    await createZip(zipPath, {
      'skills/child/SKILL.md': '# Child Skill',
    });

    const result = await importSkillSource({
      kind: 'zip',
      zipPath,
      installPath: path.join(tmpDir, 'library'),
      tempRoot: path.join(tmpDir, 'imports'),
    });

    expect(result.ok).toBe(true);
    expect(result.skill).toEqual(expect.objectContaining({
      id: 'child',
      name: 'Child Skill',
    }));
  });

  test('returns candidates when a source contains multiple skills', async () => {
    const rootPath = path.join(tmpDir, 'multi');
    await fs.mkdir(path.join(rootPath, 'one'), { recursive: true });
    await fs.mkdir(path.join(rootPath, 'two'), { recursive: true });
    await fs.writeFile(path.join(rootPath, 'one', 'SKILL.md'), '# One');
    await fs.writeFile(path.join(rootPath, 'two', 'SKILL.md'), '# Two');

    const scan = await scanImportCandidates({ rootPath });

    expect(scan.ok).toBe(true);
    expect(scan.candidates.map((candidate) => candidate.skillId)).toEqual(['one', 'two']);
  });

  test('does not scan nested skills inside a detected skill directory', async () => {
    const rootPath = path.join(tmpDir, 'nested');
    await fs.mkdir(path.join(rootPath, 'parent', 'child'), { recursive: true });
    await fs.writeFile(path.join(rootPath, 'parent', 'SKILL.md'), '# Parent');
    await fs.writeFile(path.join(rootPath, 'parent', 'child', 'SKILL.md'), '# Child');

    const scan = await scanImportCandidates({ rootPath });

    expect(scan.ok).toBe(true);
    expect(scan.candidates.map((candidate) => candidate.skillId)).toEqual(['parent']);
  });

  test('limits import candidate scanning to three directory levels', async () => {
    const rootPath = path.join(tmpDir, 'depth');
    await fs.mkdir(path.join(rootPath, 'one', 'two', 'three'), { recursive: true });
    await fs.mkdir(path.join(rootPath, 'one', 'two', 'three', 'four'), { recursive: true });
    await fs.writeFile(path.join(rootPath, 'one', 'two', 'three', 'SKILL.md'), '# Third Level');
    await fs.writeFile(path.join(rootPath, 'one', 'two', 'three', 'four', 'SKILL.md'), '# Fourth Level');

    const scan = await scanImportCandidates({ rootPath });

    expect(scan.ok).toBe(true);
    expect(scan.candidates.map((candidate) => candidate.name)).toEqual(['Third Level']);
  });

  test('marks id and name conflicts against local library skills', async () => {
    const installPath = path.join(tmpDir, 'library');
    const rootPath = path.join(tmpDir, 'incoming');
    await fs.mkdir(path.join(installPath, 'existing-id'), { recursive: true });
    await fs.mkdir(path.join(installPath, 'other-id'), { recursive: true });
    await fs.mkdir(path.join(rootPath, 'existing-id'), { recursive: true });
    await fs.writeFile(path.join(installPath, 'existing-id', 'SKILL.md'), '# Existing ID');
    await fs.writeFile(path.join(installPath, 'other-id', 'SKILL.md'), '# Duplicate Name');
    await fs.writeFile(path.join(rootPath, 'existing-id', 'SKILL.md'), '# Duplicate Name');

    const scan = await scanImportCandidates({ rootPath, installPath });

    expect(scan.ok).toBe(true);
    expect(scan.candidates[0]).toEqual(expect.objectContaining({
      skillId: 'existing-id',
      idConflict: true,
      nameConflict: true,
      existingSkillId: 'other-id',
    }));
  });

  test('imports only selected candidates from a multi-skill session', async () => {
    const zipPath = path.join(tmpDir, 'bundle.zip');
    const installPath = path.join(tmpDir, 'library');
    const tempRoot = path.join(tmpDir, 'imports');
    await createZip(zipPath, {
      'skills/one/SKILL.md': '# One',
      'skills/two/SKILL.md': '# Two',
    });

    const candidatesResult = await importSkillSource({
      kind: 'zip',
      zipPath,
      installPath,
      tempRoot,
    });

    expect(candidatesResult).toEqual(expect.objectContaining({
      ok: false,
      reason: 'multiple-candidates',
    }));

    const one = candidatesResult.candidates.find((candidate) => candidate.skillId === 'one');
    const importResult = await importSkillSource({
      kind: 'session',
      installPath,
      tempRoot,
      sessionId: candidatesResult.sessionId,
      candidateIds: [one.id],
    });

    expect(importResult.ok).toBe(true);
    expect(importResult.skills.map((skill) => skill.id)).toEqual(['one']);
    await expect(fs.readFile(path.join(installPath, 'one', 'SKILL.md'), 'utf-8')).resolves.toContain('One');
    await expect(fs.access(path.join(installPath, 'two'))).rejects.toThrow();
  });

  test('downloads and imports a SkillPkg cloud zip into the library', async () => {
    const zipPath = path.join(tmpDir, 'cloud-skill.zip');
    const installPath = path.join(tmpDir, 'library');
    await createZip(zipPath, {
      'SKILL.md': '# Cloud Skill',
      'notes.txt': 'from cloud',
    });
    const zipBuffer = await fs.readFile(zipPath);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            url: 'https://download.example.test/cloud-skill.zip?signature=test',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          zipBuffer.buffer.slice(
            zipBuffer.byteOffset,
            zipBuffer.byteOffset + zipBuffer.byteLength,
          ),
      });

    const result = await importSkillSource({
      kind: 'skillpkg',
      publicId: 'skill_public_1',
      apiKey: 'skp_test',
      baseUrl: 'https://example.test',
      installPath,
      tempRoot: path.join(tmpDir, 'imports'),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://example.test/api/v1/skills/skill_public_1/download',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer skp_test',
        },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://download.example.test/cloud-skill.zip?signature=test',
    );
    expect(result.ok).toBe(true);
    expect(result.skill).toEqual(expect.objectContaining({
      id: 'cloud-skill',
      name: 'Cloud Skill',
    }));
    await expect(fs.readFile(path.join(installPath, 'cloud-skill', 'notes.txt'), 'utf-8')).resolves.toBe('from cloud');
  });

  test('reports no-skill-found for archives without SKILL.md', async () => {
    const zipPath = path.join(tmpDir, 'empty.zip');
    await createZip(zipPath, {
      'README.md': '# No Skill',
    });

    const result = await importSkillSource({
      kind: 'zip',
      zipPath,
      installPath: path.join(tmpDir, 'library'),
      tempRoot: path.join(tmpDir, 'imports'),
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      reason: 'no-skill-found',
    }));
  });

  test('rejects invalid git URLs', async () => {
    expect(normalizeGitSource('not a url')).toBeNull();
    await expect(importSkillSource({
      kind: 'git',
      url: 'not a url',
      installPath: path.join(tmpDir, 'library'),
      tempRoot: path.join(tmpDir, 'imports'),
    })).resolves.toEqual(expect.objectContaining({
      ok: false,
      reason: 'invalid-git-url',
    }));
  });
});
