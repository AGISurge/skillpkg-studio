// A large corpus needs more bounded requests, not a larger context or an
// arbitrarily short whole-Skill deadline. Keep parent and child budgets identical.
const resolveSkillTimeoutMs = ({ chunkCount, chunkTimeoutMs, skillTimeoutMs }) => (
  Math.min(2 ** 31 - 1, Math.max(skillTimeoutMs, chunkCount * chunkTimeoutMs))
);

module.exports = { resolveSkillTimeoutMs };
