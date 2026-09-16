const path = require('path');
const { POLICY, normalizeFinding } = require('../policyEngine');

const SCRIPT_EXTENSIONS = new Set([
  'bash', 'html', 'js', 'jsx', 'mjs', 'cjs', 'ps1', 'py', 'sh', 'svg', 'ts', 'tsx', 'zsh',
]);
const INSTRUCTION_EXTENSIONS = new Set(['md', 'mdx', 'txt', 'rst']);

const lowerSeverity = (severity) => ({
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'info',
  info: 'info',
}[severity] || severity);

const isCommentOnly = (line, extension, inBlockComment) => {
  const trimmed = line.trim();
  if (!trimmed) return { comment: true, inBlockComment };
  if (inBlockComment) {
    return { comment: true, inBlockComment: !trimmed.includes('*/') };
  }
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'].includes(extension)) {
    if (trimmed.startsWith('/*')) {
      return { comment: true, inBlockComment: !trimmed.includes('*/') };
    }
    return { comment: trimmed.startsWith('//'), inBlockComment: false };
  }
  if (['py', 'sh', 'bash', 'zsh', 'ps1'].includes(extension)) {
    return { comment: trimmed.startsWith('#'), inBlockComment: false };
  }
  return { comment: false, inBlockComment: false };
};

const buildFinding = ({ rule, filePath, line, lineIndex, match, severity, confidence }) =>
  normalizeFinding({
    ...rule,
    filePath,
    severity: severity || rule.severity,
    confidence: confidence || rule.confidence,
    startLine: lineIndex + 1,
    endLine: lineIndex + 1,
    startColumn: (match?.index || 0) + 1,
    endColumn: (match?.index || 0) + String(match?.[0] || '').length + 1,
    evidence: line,
  });

const safetyNegationPrefix = /(?:do\s+not|don't|never|不要|不得|禁止|切勿)[^,.!?;:，。！？；：]{0,24}$/i;
const defensiveHeadingPattern = /(?:安全|防护|拒绝|禁止|不支持|风险)(?:规则|要求|策略|边界|范围|事项)?|(?:safety|security|guardrails?|refusal|prohibited|disallowed)/i;
const defensiveOutcomeHeadingPattern = /(?:拒绝|严禁|禁止|不予(?:执行|处理|受理)|不得(?:执行|处理|操作)|不支持)|(?:refus(?:e|al)|reject(?:ed|ion)?|prohibit(?:ed|ion)?|disallow(?:ed)?|blocked?)/i;
const negatedDefensiveOutcomePattern = /(?:不要|不得|禁止|切勿|无需|无须|不必|不可)\s*(?:直接|立即|严格|一律)?\s*(?:拒绝|严禁|禁止|不予执行)|(?:do\s+not|don't|never|must\s+not)\s+(?:refuse|reject|prohibit|block)/i;
const defensiveLeadPattern = /(?:遇到|出现|发现|检测到|识别到|命中|以下|下列).{0,60}(?:直接)?(?:拒绝|拦截|不调用|不执行|不响应|不得执行|视为普通文本)|(?:refuse|reject|block).{0,40}(?:the following|these requests?|requests? that)|(?:if|when|whenever|the following).{0,100}(?:refuse|reject|block|do not (?:call|execute|follow|run|respond))/i;
const markdownListItemPattern = /^\s*(?:[-+*]|\d+[.)])\s+/;
const instructionExamplePrefixPattern = /(?:如|例如|比如|举例|出现|包含|模式|示例|such as|for example|e\.g\.)[^。！？.!?]{0,48}$/i;
const defensiveExampleSuffixPattern = /(?:一律|应当|必须|直接)?(?:忽略|拒绝|拦截|视为普通文本)|(?:不|不得|不要|禁止)(?:响应|执行|遵循|采纳)|(?:ignore|refuse|reject|block|do not (?:execute|follow|obey|respond))/i;

const headingDefinesDefensiveOutcome = (heading) => (
  heading.length <= 120
  && defensiveOutcomeHeadingPattern.test(heading)
  && !negatedDefensiveOutcomePattern.test(heading)
);

const getDefensiveExampleLines = (content) => {
  const lines = content.split(/\r?\n/);
  const headings = [];
  lines.forEach((line, index) => {
    const match = /^\s*(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) return;
    headings.push({
      index,
      level: match[1].length,
      text: match[2].replace(/[`*_~]/g, '').trim(),
    });
  });

  const defensiveLines = new Set();
  headings.forEach((heading, headingIndex) => {
    const headingActsAsLead = headingDefinesDefensiveOutcome(heading.text);
    if (!headingActsAsLead && !defensiveHeadingPattern.test(heading.text)) return;
    const nextPeer = headings.slice(headingIndex + 1)
      .find((candidate) => candidate.level <= heading.level);
    const sectionEnd = nextPeer?.index ?? lines.length;
    const leadIndex = headingActsAsLead
      ? heading.index
      : lines.findIndex((line, index) => (
        index > heading.index
        && index < sectionEnd
        && defensiveLeadPattern.test(line)
      ));
    if (leadIndex < 0) return;

    let previousWasDefensive = false;
    for (let index = leadIndex + 1; index < sectionEnd; index += 1) {
      const line = lines[index];
      if (markdownListItemPattern.test(line)) {
        defensiveLines.add(index);
        previousWasDefensive = true;
        continue;
      }
      if (previousWasDefensive && /^\s{2,}\S/.test(line)) {
        defensiveLines.add(index);
        continue;
      }
      if (line.trim()) previousWasDefensive = false;
    }
  });
  return defensiveLines;
};

const findRuleMatch = (rule, value) => {
  if (rule.safePattern) {
    rule.safePattern.lastIndex = 0;
    if (rule.safePattern.test(value)) return null;
  }
  rule.pattern.lastIndex = 0;
  return rule.pattern.exec(value);
};

const scanLines = ({ content, defensiveExampleLines, filePath, rules, mode }) => {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const lines = content.split(/\r?\n/);
  const findings = [];
  let fenced = false;
  let inBlockComment = false;

  lines.forEach((line, lineIndex) => {
    if (mode === 'instruction' && /^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (mode === 'instruction' && defensiveExampleLines.has(lineIndex)) return;
    let commentOnly = false;
    if (mode === 'script') {
      const commentState = isCommentOnly(line, extension, inBlockComment);
      commentOnly = commentState.comment;
      inBlockComment = commentState.inBlockComment;
      if (commentOnly) return;
    }
    rules.forEach((rule) => {
      const match = findRuleMatch(rule, line);
      if (!match) return;
      if (
        mode === 'instruction'
        && match.index > 0
        && safetyNegationPrefix.test(line.slice(0, match.index))
      ) return;
      if (
        mode === 'instruction'
        && instructionExamplePrefixPattern.test(line.slice(0, match.index))
        && defensiveExampleSuffixPattern.test(line.slice(match.index + String(match[0]).length))
      ) return;
      const exampleOnly = mode === 'instruction' && fenced;
      findings.push(buildFinding({
        rule,
        filePath,
        line,
        lineIndex,
        match,
        severity: exampleOnly ? lowerSeverity(rule.severity) : rule.severity,
        confidence: exampleOnly ? 'low' : rule.confidence,
      }));
    });
  });
  return findings;
};

const executionRequestPattern = /(?:run|execute|paste|copy).{0,24}(?:following|below|command|script|terminal)|(?:运行|执行|复制|粘贴).{0,20}(?:以下|下列|命令|脚本|终端)|^\s*(?:run|execute)\b|^\s*(?:运行|执行)(?:\s|[:：])/i;

const scanMarkdownCodeBlocks = (filePath, content, defensiveExampleLines) => {
  const lines = content.split(/\r?\n/);
  const findings = [];
  let fenced = false;
  let executableExample = false;
  lines.forEach((line, lineIndex) => {
    if (/^\s*```/.test(line)) {
      if (!fenced) {
        executableExample = executionRequestPattern.test(
          lines.slice(Math.max(0, lineIndex - 3), lineIndex).join(' '),
        );
      } else {
        executableExample = false;
      }
      fenced = !fenced;
      return;
    }
    if (defensiveExampleLines.has(lineIndex)) return;
    const inlineExecution = !fenced && executionRequestPattern.test(line);
    if (!fenced && !inlineExecution) return;
    POLICY.scriptRules.forEach((rule) => {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(line);
      if (!match) return;
      findings.push(buildFinding({
        rule,
        filePath,
        line,
        lineIndex,
        match,
        severity: executableExample || inlineExecution ? rule.severity : lowerSeverity(rule.severity),
        confidence: executableExample || inlineExecution ? rule.confidence : 'low',
      }));
    });
  });
  return findings;
};

const scanHiddenHtmlInstructions = (filePath, content) => {
  const findings = [];
  const commentPattern = /<!--[\s\S]*?-->/g;
  let comment;
  while ((comment = commentPattern.exec(content))) {
    const rule = POLICY.instructionRules.find((candidate) => {
      return Boolean(findRuleMatch(candidate, comment[0]));
    });
    if (!rule) continue;
    const prefix = content.slice(0, comment.index);
    const startLine = prefix.split(/\r?\n/).length;
    findings.push(normalizeFinding({
      ...rule,
      ruleId: 'CONTENT_HIDDEN_HTML_INSTRUCTION',
      title: 'HTML 注释中隐藏可疑指令',
      category: 'obfuscation',
      severity: 'high',
      confidence: 'high',
      filePath,
      startLine,
      endLine: startLine + comment[0].split(/\r?\n/).length - 1,
      evidence: comment[0],
      message: `HTML 注释中的隐藏内容命中“${rule.title}”规则。`,
      features: [...(rule.features || []), 'obfuscation'],
    }));
  }
  return findings;
};

const scanHiddenUnicode = (filePath, content) => {
  const lines = content.split(/\r?\n/);
  const findings = [];
  lines.forEach((line, lineIndex) => {
    const leadingBomLength = lineIndex === 0 && line.startsWith('\uFEFF') ? 1 : 0;
    const visibleLine = line.slice(leadingBomLength);
    const match = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/.exec(visibleLine);
    if (!match) return;
    findings.push(normalizeFinding({
      ruleId: 'CONTENT_HIDDEN_UNICODE',
      title: '包含隐藏或双向 Unicode 字符',
      category: 'obfuscation',
      severity: 'medium',
      confidence: 'high',
      filePath,
      startLine: lineIndex + 1,
      endLine: lineIndex + 1,
      startColumn: match.index + leadingBomLength + 1,
      endColumn: match.index + leadingBomLength + 2,
      evidence: visibleLine.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '[HIDDEN]'),
      message: '文件中存在肉眼难以看见或可改变文本显示顺序的字符。',
      remediation: '删除隐藏字符，使指令和代码以可见形式保存。',
      features: ['obfuscation'],
    }));
  });
  return findings;
};

const scanEncodedInstructions = (filePath, content) => {
  const findings = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    const encoded = line.match(/(?:^|[^A-Za-z0-9+/])([A-Za-z0-9+/]{40,}={0,2})(?:$|[^A-Za-z0-9+/=])/);
    if (encoded) {
      try {
        const decoded = Buffer.from(encoded[1], 'base64').toString('utf8');
        if (/^[\x09\x0A\x0D\x20-\x7E\u4E00-\u9FFF]+$/.test(decoded)) {
          const rule = POLICY.instructionRules.find((candidate) => {
            return Boolean(findRuleMatch(candidate, decoded));
          });
          if (rule) {
            findings.push(normalizeFinding({
              ...rule,
              ruleId: 'CONTENT_ENCODED_INSTRUCTION',
              title: '编码内容中隐藏可疑指令',
              severity: 'high',
              confidence: 'high',
              filePath,
              startLine: lineIndex + 1,
              endLine: lineIndex + 1,
              startColumn: line.indexOf(encoded[1]) + 1,
              endColumn: line.indexOf(encoded[1]) + encoded[1].length + 1,
              evidence: line,
              message: `Base64 解码后命中“${rule.title}”规则。`,
              features: [...(rule.features || []), 'obfuscation'],
            }));
          }
        }
      } catch (_error) {}
    }

    const escaped = line.match(/(?:(?:\\x[0-9a-fA-F]{2}){8,}|(?:\\u[0-9a-fA-F]{4}){5,})/);
    if (escaped) {
      const decoded = escaped[0]
        .replace(/\\x([0-9a-fA-F]{2})/g, (_whole, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_whole, hex) => String.fromCharCode(parseInt(hex, 16)));
      const rule = POLICY.instructionRules.find((candidate) => {
        return Boolean(findRuleMatch(candidate, decoded));
      });
      if (rule) {
        findings.push(normalizeFinding({
          ...rule,
          ruleId: 'CONTENT_ESCAPED_INSTRUCTION',
          title: '转义编码中隐藏可疑指令',
          severity: 'high',
          confidence: 'high',
          filePath,
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          startColumn: line.indexOf(escaped[0]) + 1,
          endColumn: line.indexOf(escaped[0]) + escaped[0].length + 1,
          evidence: line,
          message: `转义序列解码后命中“${rule.title}”规则。`,
          features: [...(rule.features || []), 'obfuscation'],
        }));
      }
    }

    const plainHex = line.match(/(?:^|[^0-9a-fA-F])([0-9a-fA-F]{40,})(?:$|[^0-9a-fA-F])/);
    if (!plainHex || plainHex[1].length % 2 !== 0) return;
    const decodedHex = Buffer.from(plainHex[1], 'hex').toString('utf8');
    const hexRule = POLICY.instructionRules.find((candidate) => {
      return Boolean(findRuleMatch(candidate, decodedHex));
    });
    if (!hexRule) return;
    findings.push(normalizeFinding({
      ...hexRule,
      ruleId: 'CONTENT_HEX_INSTRUCTION',
      title: 'Hex 编码中隐藏可疑指令',
      severity: 'high',
      confidence: 'high',
      filePath,
      startLine: lineIndex + 1,
      endLine: lineIndex + 1,
      startColumn: line.indexOf(plainHex[1]) + 1,
      endColumn: line.indexOf(plainHex[1]) + plainHex[1].length + 1,
      evidence: line,
      message: `Hex 解码后命中“${hexRule.title}”规则。`,
      features: [...(hexRule.features || []), 'obfuscation'],
    }));
  });
  return findings;
};

const scanPackageManifest = (filePath, content) => {
  if (path.basename(filePath).toLowerCase() !== 'package.json') return [];
  try {
    const value = JSON.parse(content);
    const findings = [];
    const scripts = value?.scripts || {};
    ['preinstall', 'install', 'postinstall', 'prepare'].forEach((name) => {
      if (!scripts[name]) return;
      const lineIndex = content.split(/\r?\n/).findIndex((line) => line.includes(`"${name}"`));
      findings.push(normalizeFinding({
        ruleId: 'MANIFEST_INSTALL_HOOK',
        title: '包含安装生命周期脚本',
        category: 'supply-chain',
        severity: 'high',
        confidence: 'high',
        filePath,
        startLine: Math.max(0, lineIndex) + 1,
        endLine: Math.max(0, lineIndex) + 1,
        startColumn: 1,
        endColumn: 1,
        evidence: `${name}: ${scripts[name]}`,
        message: `package.json 在 ${name} 阶段会自动执行脚本。`,
        remediation: '移除自动安装钩子，将必要操作改为用户可见、可确认的手动步骤。',
        features: ['execute'],
      }));
      POLICY.scriptRules.forEach((rule) => {
        rule.pattern.lastIndex = 0;
        const match = rule.pattern.exec(String(scripts[name]));
        if (!match) return;
        findings.push(buildFinding({
          rule,
          filePath,
          line: `${name}: ${scripts[name]}`,
          lineIndex: Math.max(0, lineIndex),
          match,
        }));
      });
    });
    return findings;
  } catch (_error) {
    return [normalizeFinding({
      ruleId: 'MANIFEST_PARSE_FAILED',
      title: '依赖清单无法解析',
      category: 'scan-coverage',
      severity: 'medium',
      confidence: 'high',
      filePath,
      evidence: content.slice(0, 300),
      message: 'package.json 不是有效 JSON，无法完成安装脚本检查。',
      remediation: '修复 package.json 格式后重新扫描。',
    })];
  }
};

const analyzeTextFile = ({ filePath, content }) => {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const defensiveExampleLines = getDefensiveExampleLines(content);
  const findings = [
    ...scanHiddenUnicode(filePath, content),
    ...scanEncodedInstructions(filePath, content),
    ...scanPackageManifest(filePath, content),
  ];
  if (INSTRUCTION_EXTENSIONS.has(extension) || path.basename(filePath).toUpperCase() === 'SKILL.MD') {
    findings.push(...scanHiddenHtmlInstructions(filePath, content));
    findings.push(...scanMarkdownCodeBlocks(filePath, content, defensiveExampleLines));
    findings.push(...scanLines({
      content,
      defensiveExampleLines,
      filePath,
      rules: POLICY.instructionRules,
      mode: 'instruction',
    }));
  }
  if (SCRIPT_EXTENSIONS.has(extension)) {
    findings.push(...scanLines({
      content,
      filePath,
      rules: POLICY.scriptRules,
      mode: 'script',
    }));
  }
  return findings;
};

module.exports = {
  analyzeTextFile,
};
