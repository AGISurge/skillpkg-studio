const crypto = require('crypto');
const { normalizeFinding, redactEvidence } = require('./policyEngine');

const SEMANTIC_MODEL_ID = 'qwen3.5-2b-q4_k_m';
const SEMANTIC_POLICY_VERSION = '1.0.0';
const SEMANTIC_PROMPT_VERSION = '1.1.0';
const SEMANTIC_SCHEMA_VERSION = '1.1.0';
const SEMANTIC_CONFIDENCE_THRESHOLD = 0.6;

const SEMANTIC_DIMENSIONS = Object.freeze([
  'prompt_injection',
  'instruction_override',
  'authorization_bypass',
  'sensitive_data_access',
  'data_exfiltration',
  'destructive_actions',
  'privilege_escalation',
  'security_control_bypass',
  'persistence',
  'remote_code_execution',
  'unexpected_network_access',
  'remote_code_download',
  'stealth_behavior',
  'obfuscation',
  'scope_expansion',
  'behavior_description_mismatch',
]);

const MEDIUM_SEVERITY_DIMENSIONS = new Set([
  'prompt_injection',
  'instruction_override',
  'unexpected_network_access',
  'remote_code_download',
  'stealth_behavior',
  'behavior_description_mismatch',
]);

const DIMENSION_METADATA = {
  prompt_injection: {
    title: '提示词注入',
    category: 'prompt-injection',
    message: '说明文本试图伪造高优先级消息、工具结果或可信上下文。',
    remediation: '将外部内容明确标记为数据，删除伪造角色、工具结果或授权状态的指令。',
    features: ['prompt-override'],
  },
  instruction_override: {
    title: '试图覆盖上层指令',
    category: 'prompt-injection',
    message: '说明文本要求忽略、覆盖或绕过更高优先级的指令或安全规则。',
    remediation: '删除覆盖指令，只保留完成 Skill 目标所需的步骤。',
    features: ['prompt-override'],
  },
  authorization_bypass: {
    title: '绕过确认或授权',
    category: 'authorization',
    message: '说明文本要求在缺少用户确认或权限时继续执行有副作用的操作。',
    remediation: '为破坏性操作、外部发送和高权限操作保留明确确认。',
    features: ['approval-bypass', 'silent-operation'],
  },
  sensitive_data_access: {
    title: '读取敏感信息',
    category: 'sensitive-data',
    message: '说明文本要求读取凭据、私钥、浏览器数据或 Agent 内部上下文。',
    remediation: '只读取用户明确提供且完成任务必需的数据。',
    features: ['sensitive-source'],
  },
  data_exfiltration: {
    title: '将本地或敏感数据发送到外部',
    category: 'data-exfiltration',
    message: '说明文本要求把本地文件、凭据或私密上下文发送到外部目标。',
    remediation: '删除外传步骤，或明确限定数据、目标并要求用户确认。',
    features: ['network-sink'],
  },
  destructive_actions: {
    title: '执行破坏性操作',
    category: 'destructive-action',
    message: '说明文本要求删除、覆盖或不可逆地修改用户或系统数据。',
    remediation: '缩小操作范围，提供预览、备份和明确确认。',
    features: ['broad-delete'],
  },
  privilege_escalation: {
    title: '提升系统权限',
    category: 'privilege',
    message: '说明文本要求获取管理员权限或放宽访问控制。',
    remediation: '使用普通用户权限，并限制到完成任务必需的资源。',
    features: ['privilege'],
  },
  security_control_bypass: {
    title: '绕过安全控制',
    category: 'privilege',
    message: '说明文本要求关闭、规避或削弱平台安全控制。',
    remediation: '保留系统安全控制，不得以完成 Skill 为由关闭防护。',
    features: ['security-disable', 'privilege'],
  },
  persistence: {
    title: '建立持久化运行',
    category: 'persistence',
    message: '说明文本要求创建登录、启动或定时执行的持久化入口。',
    remediation: '删除持久化步骤，必要安装应拆成用户可见且可卸载的操作。',
    features: ['persistence'],
  },
  remote_code_execution: {
    title: '执行远程或不可信代码',
    category: 'dynamic-code',
    message: '说明文本要求执行远程、不可信或动态生成的代码。',
    remediation: '只执行固定、可审查的本地代码，并校验来源与摘要。',
    features: ['execute'],
  },
  unexpected_network_access: {
    title: '未说明的网络访问',
    category: 'network',
    message: '说明文本要求与 Skill 描述没有合理关系的网络访问。',
    remediation: '删除无关网络访问，或明确说明目标、数据和用途。',
    features: ['network-sink'],
  },
  remote_code_download: {
    title: '下载远程代码或可执行内容',
    category: 'network',
    message: '说明文本要求下载代码、脚本、二进制或其他可执行内容。',
    remediation: '固定来源和摘要，下载后先校验，不得直接执行。',
    features: ['download'],
  },
  stealth_behavior: {
    title: '隐瞒操作或结果',
    category: 'concealment',
    message: '说明文本要求对用户隐瞒操作、结果或审计记录。',
    remediation: '向用户说明所有副作用，并保留操作记录。',
    features: ['concealment', 'silent-operation'],
  },
  obfuscation: {
    title: '隐藏真实行为',
    category: 'obfuscation',
    message: '说明文本要求编码、混淆或以其他方式隐藏真实操作。',
    remediation: '使用可审查的明文步骤，不得隐藏载荷或执行路径。',
    features: ['obfuscation'],
  },
  scope_expansion: {
    title: '操作范围超出 Skill 目标',
    category: 'scope',
    message: '说明文本要求访问或修改与 Skill 目标无关的广泛资源。',
    remediation: '将路径、项目、账号和数据范围限制到任务所需的最小集合。',
    features: ['scope-drift'],
  },
  behavior_description_mismatch: {
    title: '行为与描述不一致',
    category: 'scope',
    message: '说明文本要求的行为与 frontmatter description 明显不一致。',
    remediation: '删除无关行为，或准确更新 description 并让用户重新审查。',
    features: ['scope-drift'],
  },
};

const SEMANTIC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...SEMANTIC_DIMENSIONS],
  properties: Object.fromEntries(SEMANTIC_DIMENSIONS.map((dimension) => [dimension, {
    type: 'object',
    additionalProperties: false,
    required: ['detected', 'confidence', 'evidence', 'reason'],
    properties: {
      detected: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      evidence: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['filePath', 'startLine', 'endLine', 'quote'],
          properties: {
            filePath: { type: 'string' },
            startLine: { type: 'integer', minimum: 1 },
            endLine: { type: 'integer', minimum: 1 },
            quote: { type: 'string', maxLength: 800 },
          },
        },
      },
      reason: { type: 'string', maxLength: 240 },
    },
  }])),
};

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const validateAssessmentShape = (value) => {
  if (!isPlainObject(value)) return null;
  if (
    typeof value.detected !== 'boolean'
    || typeof value.confidence !== 'number'
    || !Number.isFinite(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
    || !Array.isArray(value.evidence)
    || value.evidence.length > 2
    || typeof value.reason !== 'string'
  ) return null;
  const evidence = [];
  for (const item of value.evidence) {
    if (
      !isPlainObject(item)
      || typeof item.filePath !== 'string'
      || !Number.isInteger(item.startLine)
      || !Number.isInteger(item.endLine)
      || item.startLine < 1
      || item.endLine < item.startLine
      || typeof item.quote !== 'string'
    ) return null;
    evidence.push({
      filePath: item.filePath,
      startLine: item.startLine,
      endLine: item.endLine,
      quote: item.quote,
    });
  }
  return {
    detected: value.detected,
    confidence: value.confidence,
    evidence,
    reason: value.reason,
  };
};

const parseSemanticAssessments = (value) => {
  if (!isPlainObject(value)) return { ok: false, reason: 'schema-invalid' };
  const keys = Object.keys(value);
  if (
    keys.length !== SEMANTIC_DIMENSIONS.length
    || keys.some((key) => !SEMANTIC_DIMENSIONS.includes(key))
  ) return { ok: false, reason: 'schema-invalid' };
  const assessments = {};
  for (const dimension of SEMANTIC_DIMENSIONS) {
    const assessment = validateAssessmentShape(value[dimension]);
    if (!assessment) return { ok: false, reason: 'schema-invalid' };
    assessments[dimension] = assessment;
  }
  return { ok: true, assessments };
};

const validateSemanticEvidence = (assessments, documents) => {
  const documentsByPath = new Map(documents.map((document) => [
    document.filePath,
    String(document.content).split(/\r?\n/),
  ]));
  const validated = {};
  for (const dimension of SEMANTIC_DIMENSIONS) {
    const assessment = assessments[dimension];
    if (assessment.detected && assessment.evidence.length === 0) {
      return { ok: false, reason: 'evidence-invalid' };
    }
    const evidence = [];
    for (const item of assessment.evidence) {
      const lines = documentsByPath.get(item.filePath);
      if (!lines || item.endLine > lines.length) {
        return { ok: false, reason: 'evidence-invalid' };
      }
      const quote = lines.slice(item.startLine - 1, item.endLine).join('\n');
      if (quote !== item.quote) return { ok: false, reason: 'evidence-invalid' };
      evidence.push({ ...item, quote: redactEvidence(item.quote) });
    }
    validated[dimension] = {
      ...assessment,
      evidence,
      reason: redactEvidence(assessment.reason).slice(0, 240),
    };
  }
  return { ok: true, assessments: validated };
};

const emptySemanticAssessments = () => Object.fromEntries(
  SEMANTIC_DIMENSIONS.map((dimension) => [dimension, {
    detected: false,
    confidence: 0,
    evidence: [],
    reason: '',
  }]),
);

const mergeSemanticAssessments = (chunks) => {
  const merged = emptySemanticAssessments();
  for (const dimension of SEMANTIC_DIMENSIONS) {
    const hits = chunks
      .map((chunk) => chunk[dimension])
      .filter((assessment) => assessment.detected);
    if (!hits.length) {
      const highest = chunks
        .map((chunk) => chunk[dimension])
        .sort((left, right) => right.confidence - left.confidence)[0];
      if (highest) merged[dimension] = { ...highest, detected: false, evidence: [] };
      continue;
    }
    const highest = [...hits].sort((left, right) => right.confidence - left.confidence)[0];
    const evidence = [];
    const seen = new Set();
    for (const item of hits.flatMap((assessment) => assessment.evidence)) {
      const key = `${item.filePath}\0${item.startLine}\0${item.endLine}\0${item.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push(item);
      if (evidence.length === 2) break;
    }
    merged[dimension] = { ...highest, detected: true, evidence };
  }
  return merged;
};

const assessmentsToFindings = (assessments) => SEMANTIC_DIMENSIONS.flatMap((dimension) => {
  const assessment = assessments[dimension];
  if (!assessment.detected || assessment.confidence < SEMANTIC_CONFIDENCE_THRESHOLD) return [];
  const metadata = DIMENSION_METADATA[dimension];
  const evidence = assessment.evidence[0];
  return [normalizeFinding({
    ruleId: `LLM_${dimension.toUpperCase()}`,
    title: metadata.title,
    category: metadata.category,
    severity: MEDIUM_SEVERITY_DIMENSIONS.has(dimension) ? 'medium' : 'high',
    confidence: assessment.confidence >= 0.85 ? 'high' : 'medium',
    confidenceScore: assessment.confidence,
    detector: 'model',
    filePath: evidence?.filePath || '',
    startLine: evidence?.startLine || 1,
    endLine: evidence?.endLine || evidence?.startLine || 1,
    evidence: evidence?.quote || '',
    message: assessment.reason || metadata.message,
    remediation: metadata.remediation,
    features: metadata.features,
  })];
});

const createSemanticCacheKey = ({
  corpusDigest,
  modelSha256,
  promptVersion = SEMANTIC_PROMPT_VERSION,
  schemaVersion = SEMANTIC_SCHEMA_VERSION,
  policyVersion = SEMANTIC_POLICY_VERSION,
}) => crypto.createHash('sha256').update([
  corpusDigest,
  modelSha256,
  promptVersion,
  schemaVersion,
  policyVersion,
].join('\0')).digest('hex');

module.exports = {
  SEMANTIC_CONFIDENCE_THRESHOLD,
  SEMANTIC_DIMENSIONS,
  SEMANTIC_JSON_SCHEMA,
  SEMANTIC_MODEL_ID,
  SEMANTIC_POLICY_VERSION,
  SEMANTIC_PROMPT_VERSION,
  SEMANTIC_SCHEMA_VERSION,
  assessmentsToFindings,
  createSemanticCacheKey,
  emptySemanticAssessments,
  mergeSemanticAssessments,
  parseSemanticAssessments,
  validateSemanticEvidence,
};
