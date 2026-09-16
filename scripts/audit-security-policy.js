const path = require('path');
const {
  collectSkillInventory,
  discoverSkillEntries,
} = require('../electron/security/inventoryCollector');
const { analyzeFile } = require('../electron/security/worker');
const {
  POLICY_VERSION,
  aggregateFindings,
  getBaseLevel,
} = require('../electron/security/policyEngine');

const coverageRank = { complete: 0, partial: 1, incomplete: 2 };

const worstCoverage = (...values) => values.reduce((worst, value) => (
  coverageRank[value] > coverageRank[worst] ? value : worst
), 'complete');

const metadataCoverage = (kind) => {
  if (kind === 'executable') return 'incomplete';
  if (kind === 'archive') return 'partial';
  return 'complete';
};

const scanSkill = async (skill) => {
  const inventory = await collectSkillInventory(skill);
  const fileResults = [];

  for (const file of inventory.files) {
    const metadataOnly = ['static', 'archive', 'executable'].includes(file.kind);
    fileResults.push(await analyzeFile({
      rootPath: inventory.realPath,
      file,
      metadataOnly,
      metadataCoverage: metadataCoverage(file.kind),
    }));
  }

  const findings = aggregateFindings([
    ...inventory.findings,
    ...fileResults.flatMap((result) => result.findings || []),
  ]);

  return {
    skillId: inventory.skillId,
    name: inventory.name,
    level: getBaseLevel(findings),
    coverage: worstCoverage(
      inventory.coverage,
      ...fileResults.map((result) => result.coverage),
    ),
    findingCount: findings.length,
    findings: findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      confidence: finding.confidence,
      filePath: finding.filePath,
      startLine: finding.startLine,
      evidence: finding.evidence,
    })),
  };
};

const main = async () => {
  const root = process.argv[2];
  if (!root) throw new Error('用法: npm run audit:security-policy -- <技能库目录>');

  const resolvedRoot = path.resolve(root);
  const skills = await discoverSkillEntries(resolvedRoot);
  const reports = [];
  for (const skill of skills) reports.push(await scanSkill(skill));

  const counts = reports.reduce((result, report) => {
    result[report.level] += 1;
    return result;
  }, { safe: 0, suspicious: 0, dangerous: 0 });

  process.stdout.write(`${JSON.stringify({
    policyVersion: POLICY_VERSION,
    root: resolvedRoot,
    skillCount: reports.length,
    counts,
    reports,
  }, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
