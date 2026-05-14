import { getMarkdownContent, stripMarkdownFrontmatter } from './skillUtils';

describe('skillUtils markdown preview', () => {
  test('strips YAML frontmatter before rendering markdown', () => {
    expect(
      stripMarkdownFrontmatter(
        [
          '---',
          'name: preview-test',
          'description: Should not render as content',
          '---',
          '',
          '# Skill Body',
        ].join('\n'),
      ),
    ).toBe('\n# Skill Body');
  });

  test('does not strip markdown without a closing frontmatter fence', () => {
    expect(stripMarkdownFrontmatter('---\n# Real content')).toBe('---\n# Real content');
  });

  test('returns markdown preview content without frontmatter', () => {
    expect(
      getMarkdownContent({
        path: 'SKILL.md',
        content: '---\nname: demo\n---\n\n# Demo',
        kind: 'text',
      }),
    ).toBe('\n# Demo');
  });
});
