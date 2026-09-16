const crypto = require('crypto');

const POLICY_VERSION = '2.0.1';
const ANALYZER_VERSION = '1.0.0';
const SCANNER_VERSION = '1.0.0';

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const POLICY = {
  version: POLICY_VERSION,
  limits: {
    maxFilesPerSkill: 5000,
    maxDepth: 32,
    maxTotalBytes: 512 * 1024 * 1024,
    maxFullTextBytes: 32 * 1024 * 1024,
    sampleBytes: 1024 * 1024,
  },
  instructionRules: [
    {
      ruleId: 'INSTRUCTION_PROMPT_OVERRIDE',
      title: '试图覆盖上层指令',
      category: 'prompt-injection',
      severity: 'high',
      confidence: 'high',
      pattern: /(?<!do not )(?<!don't )(?<!never )(?:ignore|disregard|override|bypass)\s+(?:all\s+)?(?:(?:previous|prior)\s+)?(?:system|developer|user|safety)?\s*(?:instructions?|rules?|prompts?)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:忽略|无视|绕过|覆盖).{0,12}(?:系统|开发者|用户|安全|上述|之前).{0,12}(?:指令|规则|限制)/i,
      message: '内容要求 Agent 忽略或覆盖更高优先级的指令。',
      remediation: '删除覆盖指令，仅保留与技能目标直接相关的步骤。',
      features: ['prompt-override'],
    },
    {
      ruleId: 'INSTRUCTION_SYSTEM_IMPERSONATION',
      title: '伪造系统或工具身份',
      category: 'prompt-injection',
      severity: 'high',
      confidence: 'medium',
      pattern: /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:SYSTEM|DEVELOPER|TOOL|ASSISTANT)(?:\*\*)?\s*:|(?<!do not )(?<!don't )(?<!never )\b(?:pretend|claim|act)\b\s+(?:that\s+)?(?:you|approval|the tool)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:假装|伪造).{0,12}(?:系统|工具|审批|开发者)/i,
      message: '内容可能在伪造系统消息、工具结果或授权状态。',
      remediation: '用普通说明文本替代伪造的角色或工具输出。',
      features: ['impersonation'],
    },
    {
      ruleId: 'INSTRUCTION_CONCEALMENT',
      title: '要求隐瞒操作',
      category: 'concealment',
      severity: 'high',
      confidence: 'high',
      pattern: /(?:do\s+not|don'?t|never)\s+(?:tell|inform|show|mention)\s+(?:the\s+)?user|(?<!do not )(?<!don't )(?<!never )(?:hide|conceal|erase|delete)\s+(?:the\s+)?(?:logs?|history|evidence)|(?:不要|无需|禁止).{0,10}(?:告知|告诉|通知|提示|显示).{0,8}(?:用户|操作者)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:隐瞒|隐藏).{0,8}(?:操作|行为|事实|结果|记录|证据)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:删除|清除|擦除).{0,8}(?:日志|记录|证据|历史)/i,
      message: '内容要求对用户隐瞒操作或清除审计记录。',
      remediation: '所有有副作用的操作都应向用户清晰说明并保留审计记录。',
      features: ['concealment', 'silent-operation'],
    },
    {
      ruleId: 'INSTRUCTION_APPROVAL_BYPASS',
      title: '试图绕过确认或权限',
      category: 'authorization',
      severity: 'high',
      confidence: 'high',
      safePattern: /(?:do\s+not|don't|never)\s+(?:proceed|continue|advance|move\s+forward|act|execute|run|send|delete|modify|change)[^,.!?;:，。！？；：]{0,120}\bwithout\s+(?:user\s+)?(?:approval|confirmation|permission)/i,
      pattern: /without\s+(?:user\s+)?(?:approval|confirmation|permission)|(?<!do not )(?<!don't )(?<!never )(?:skip|bypass)\s+(?:user\s+)?(?:approval|confirmation|permission)|(?:assume|claim).{0,16}(?:approved|authorized)|(?:无需|不用).{0,10}(?:用户)?(?:确认|同意|授权|审批|权限)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:跳过|绕过).{0,10}(?:用户)?(?:确认|同意|授权|审批|权限)/i,
      message: '内容要求在缺少用户确认或授权时继续操作。',
      remediation: '对破坏性、外部发送或高权限操作保留明确确认步骤。',
      features: ['approval-bypass', 'silent-operation'],
    },
    {
      ruleId: 'INSTRUCTION_SENSITIVE_ACCESS',
      title: '要求获取敏感信息',
      category: 'sensitive-data',
      severity: 'high',
      confidence: 'medium',
      pattern: /(?<!do not )(?<!don't )(?<!never )(?:read|collect|extract|find|reveal|print|dump).{0,30}(?:api[_ -]?key|password|token|credential|private\s+key|\.ssh|\.aws|keychain|browser\s+(?:data|cookies?)|system\s+prompt|conversation\s+history)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:读取|获取|导出|显示|收集|查找).{0,24}(?:密码|密钥|令牌|凭据|私钥|系统提示|对话历史|浏览器数据)/i,
      message: '内容要求读取凭据、私钥或 Agent 内部上下文。',
      remediation: '限定为必要的非敏感输入，避免读取用户凭据和内部提示。',
      features: ['sensitive-source'],
    },
    {
      ruleId: 'INSTRUCTION_EXFILTRATION',
      title: '要求将数据发送到外部',
      category: 'data-exfiltration',
      severity: 'high',
      confidence: 'medium',
      pattern: /(?<!do not )(?<!don't )(?<!never )(?:upload|send|post|transmit|exfiltrate).{0,30}(?:secret|token|key|credential|file|data|history).{0,30}(?:https?:\/\/|webhook|server|endpoint|third.party)|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:上传|发送|传输|外传).{0,24}(?:密钥|令牌|凭据|文件|数据|历史).{0,24}(?:网址|服务器|接口|第三方|webhook)/i,
      message: '内容要求将本地或敏感数据发送到外部系统。',
      remediation: '删除外传步骤，或明确限定数据、目标和用户确认。',
      features: ['network-sink'],
    },
    {
      ruleId: 'INSTRUCTION_SCOPE_DRIFT',
      title: '操作范围可能超出技能目标',
      category: 'scope',
      severity: 'medium',
      confidence: 'low',
      pattern: /(?<!do not )(?<!don't )(?<!never )(?:scan|read|modify|delete|access|search).{0,20}(?:(?:the\s+)?(?:entire\s+computer|all\s+(?:home\s+directory|filesystem|repositories|projects|accounts))|(?:unrelated|other)\s+(?:projects?|repositories?|accounts?))|(?<!不要)(?<!不得)(?<!禁止)(?<!切勿)(?:扫描|读取|修改|删除|访问|搜索|操作).{0,12}(?:整台电脑|所有(?:目录|文件|项目|仓库|账号)|(?:其他|无关).{0,8}(?:项目|仓库|目录|账号))/i,
      message: '指令要求操作过广或可能与技能目标无关的资源。',
      remediation: '将路径、项目和账号范围限制为完成当前技能所必需的最小集合。',
      features: ['scope-drift'],
    },
  ],
  scriptRules: [
    {
      ruleId: 'SCRIPT_BROAD_DELETE', title: '广泛或递归删除', category: 'destructive-action',
      severity: 'critical', confidence: 'high',
      pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f?|-[a-zA-Z]*f[a-zA-Z]*r)\s+(?:\/|~|\$HOME|\*|\.\.)|Remove-Item\b[^\n]*(?:-Recurse)[^\n]*(?:-Force)|shutil\.rmtree\s*\(|fs\.(?:rm|rmdir)\s*\([^\n]*recursive\s*:\s*true/i,
      message: '脚本包含广泛或递归删除操作。', remediation: '将删除限制到明确的技能临时目录，并在执行前要求确认。',
      features: ['broad-delete'],
    },
    {
      ruleId: 'SCRIPT_FILE_DELETE', title: '删除文件或目录', category: 'destructive-action',
      severity: 'high', confidence: 'medium',
      pattern: /(?:^|[;&|]\s*)rm\s+(?:-[a-zA-Z]+\s+)?[^\s;|&]+|Remove-Item\b|(?:fs\.)?(?:unlink|unlinkSync|rmdir|rmSync)\s*\(|os\.remove\s*\(|shutil\.rmtree\s*\(/i,
      message: '脚本可以删除本地文件或目录。', remediation: '将删除范围限制到明确的技能临时目录，并在执行前确认目标路径。',
      features: ['file-delete'],
    },
    {
      ruleId: 'SCRIPT_SYSTEM_PATH_WRITE', title: '修改系统级路径或磁盘', category: 'destructive-action',
      severity: 'critical', confidence: 'high',
      pattern: /(?:>\s*|tee\s+)(?:\/etc\/|\/usr\/|\/Library\/)|\b(?:mkfs|diskutil\s+erase|format\.com)\b|\bdd\s+[^\n]*\bof=\/dev\//i,
      message: '脚本可能覆盖系统配置或直接修改磁盘设备。', remediation: '移除系统路径写入和磁盘操作，只写入技能自己的工作目录。',
      features: ['destructive-system-write'],
    },
    {
      ruleId: 'SCRIPT_SENSITIVE_READ', title: '读取敏感路径或凭据', category: 'sensitive-data',
      severity: 'high', confidence: 'high',
      pattern: /(?:\.ssh\/(?:id_|config|known_hosts)|\.aws\/(?:credentials|config)|\.git-credentials|\.netrc|keychain|Login Data|Cookies|api[_-]?key|private[_ -]?key|process\.env\.(?:TOKEN|PASSWORD|SECRET|API_KEY)|\$env:(?:TOKEN|PASSWORD|SECRET|API_KEY))/i,
      message: '脚本访问常见的凭据、私钥或敏感环境变量。', remediation: '只接收用户明确提供的必要凭据，避免扫描用户敏感目录。',
      features: ['sensitive-source'],
    },
    {
      ruleId: 'SCRIPT_ENVIRONMENT_DUMP', title: '批量读取环境变量', category: 'sensitive-data',
      severity: 'high', confidence: 'medium',
      pattern: /(?:^|[;&|]\s*)(?:env|printenv)(?:\s|$)|process\.env\b(?!\s*(?:\.|\[))|os\.environ\b(?!\s*(?:\.|\[))|Get-ChildItem\s+Env:|gci\s+Env:/i,
      message: '脚本读取全部环境变量，其中可能包含令牌和服务凭据。', remediation: '只读取明确列出的非敏感变量，不要记录或上传完整环境。',
      features: ['sensitive-source'],
    },
    {
      ruleId: 'SCRIPT_COMMAND_EXECUTION', title: '执行系统命令', category: 'command-execution',
      severity: 'high', confidence: 'medium',
      pattern: /(?:child_process\.(?:exec|execSync|spawn)|subprocess\.(?:run|Popen|call|check_output)|os\.system\s*\(|shell\s*=\s*True|Invoke-Expression|\biex\s+|Start-Process)/i,
      message: '脚本可以启动外部进程或执行系统命令。', remediation: '使用参数数组和允许列表，禁止将不可信内容拼接到 Shell 命令。',
      features: ['execute'],
    },
    {
      ruleId: 'SCRIPT_DYNAMIC_EXECUTION', title: '动态执行代码', category: 'dynamic-code',
      severity: 'high', confidence: 'high',
      pattern: /\b(?:eval|Function)\s*\(|(?<!\.)\bexec\s*\(|compile\s*\([^\n]*exec|pickle\.loads?\s*\(|yaml\.load\s*\([^\n]*Loader\s*=\s*yaml\.Loader/,
      message: '脚本动态解析或执行内容，可能将数据变成代码。', remediation: '移除动态执行，改用明确的数据格式和固定操作。',
      features: ['execute', 'dynamic-exec'],
    },
    {
      ruleId: 'SCRIPT_DOWNLOAD', title: '下载外部内容', category: 'network',
      severity: 'low', confidence: 'high',
      pattern: /\b(?:curl|wget)\b|Invoke-WebRequest|DownloadString|requests\.(?:get|post)|https?\.(?:get|request)\s*\(|fetch\s*\(/i,
      message: '脚本会从网络下载或请求外部内容。', remediation: '限定可访问的域名，校验内容完整性，不要直接执行下载结果。',
      features: ['download'],
    },
    {
      ruleId: 'SCRIPT_NETWORK_UPLOAD', title: '向外部发送数据', category: 'data-exfiltration',
      severity: 'medium', confidence: 'medium',
      pattern: /(?:requests\.post|axios\.post|fetch\s*\([^\n]*method\s*:\s*['"](?:POST|post)|(?:Invoke-RestMethod|invoke-restmethod)|curl\b[^\n]*(?:-d|--data|--upload-file|-F)|webhook|socket\.connect|\.sendall?\s*\()/,
      message: '脚本具有将数据发送到网络目标的能力。', remediation: '明确限定发送的数据和目标，并在发送前向用户展示。',
      features: ['network-sink'],
    },
    {
      ruleId: 'SCRIPT_DOWNLOAD_EXECUTE', title: '下载并立即执行', category: 'malware-pattern',
      severity: 'critical', confidence: 'high',
      pattern: /(?:curl|wget)[^\n|;]{0,300}(?:\||;|&&)\s*(?:sh|bash|zsh|python|node|powershell)|(?:DownloadString|Invoke-WebRequest)[^\n]{0,300}(?:Invoke-Expression|\biex\b|Start-Process)/i,
      message: '脚本将下载内容直接交给解释器或进程执行。', remediation: '禁止直接执行下载内容；先保存、校验固定摘要并由用户确认。',
      features: ['download', 'execute'],
    },
    {
      ruleId: 'SCRIPT_PERSISTENCE', title: '修改系统持久化配置', category: 'persistence',
      severity: 'high', confidence: 'high',
      pattern: /(?:crontab\b|\/etc\/cron|LaunchAgents?|LaunchDaemons?|schtasks\b|CurrentVersion\\Run|Startup\\|systemctl\s+enable|\.bashrc|\.zshrc|profile\.d)/i,
      message: '脚本修改开机、登录或定时启动配置。', remediation: '移除持久化操作，或将其改为独立、明确确认的安装步骤。',
      features: ['persistence'],
    },
    {
      ruleId: 'SCRIPT_PRIVILEGE_ESCALATION', title: '请求提升权限', category: 'privilege',
      severity: 'high', confidence: 'high',
      pattern: /\bsudo\b|runas\b|Start-Process[^\n]*-Verb\s+RunAs|chmod\s+(?:777|[ugo]*\+s)|chown\s+(?:root|0):/i,
      message: '脚本请求管理员权限或赋予过宽的执行权限。', remediation: '使用普通用户权限，仅对明确文件设置必要权限。',
      features: ['privilege'],
    },
    {
      ruleId: 'SCRIPT_SECURITY_DISABLE', title: '关闭系统安全控制', category: 'privilege',
      severity: 'critical', confidence: 'high',
      pattern: /spctl\s+--master-disable|csrutil\s+disable|Set-MpPreference[^\n]*DisableRealtimeMonitoring[^\n]*(?:true|1)|(?:ufw|firewall-cmd)\s+(?:disable|--panic-on)|Disable-WindowsOptionalFeature[^\n]*Defender/i,
      message: '脚本尝试关闭恶意软件防护、防火墙或平台安全控制。', remediation: '删除关闭安全控制的步骤，并在普通用户权限下运行技能。',
      features: ['privilege', 'security-disable'],
    },
    {
      ruleId: 'SCRIPT_REVERSE_SHELL', title: '反向 Shell 或远程控制', category: 'malware-pattern',
      severity: 'critical', confidence: 'high',
      pattern: /\bnc\s+[^\n]*\s-e\s+(?:\/bin\/)?(?:sh|bash)|\/dev\/tcp\/|bash\s+-i\s+>&|socket\.connect\s*\([^\n]+\)[\s\S]{0,300}(?:dup2|pty\.spawn)|powershell[^\n]*(?:TCPClient|Net\.Sockets)/i,
      message: '脚本包含典型的反向 Shell 或远程控制模式。', remediation: '删除远程 Shell 和未经授权的控制通道。',
      features: ['network-sink', 'execute'],
    },
    {
      ruleId: 'SCRIPT_OBFUSCATION', title: '疑似混淆或编码载荷', category: 'obfuscation',
      severity: 'medium', confidence: 'medium',
      pattern: /(?:base64\.(?:b64decode|decodebytes)|Buffer\.from\([^\n]*['"]base64['"]|FromBase64String|xxd\s+-r|certutil\s+-decode|[A-Za-z0-9+/]{160,}={0,2})/i,
      message: '脚本解码或包含长编码载荷，可能在隐藏真实行为。', remediation: '使用可审查的明文资源，不要将解码结果交给动态执行入口。',
      features: ['obfuscation'],
    },
  ],
};

const redactEvidence = (value) => String(value || '')
  .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
  .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*["']?)[^\s"']{5,}/gi, '$1[REDACTED]')
  .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g, '[REDACTED TOKEN]')
  .replace(/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED AWS ACCESS KEY]')
  .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED JWT]')
  .split(/\r?\n/)
  .slice(0, 3)
  .join('\n')
  .slice(0, 600);

const createFingerprint = (finding) => crypto
  .createHash('sha256')
  .update([
    finding.ruleId,
    finding.filePath || '',
    finding.startLine || 0,
    String(finding.evidence || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  ].join('\0'))
  .digest('hex');

const normalizeFinding = (finding) => {
  const normalized = {
    ruleId: finding.ruleId,
    title: finding.title,
    category: finding.category || 'general',
    severity: finding.severity || 'medium',
    confidence: finding.confidence || 'medium',
    filePath: finding.filePath || '',
    startLine: Number(finding.startLine) || 1,
    startColumn: Number(finding.startColumn) || 1,
    endLine: Number(finding.endLine) || Number(finding.startLine) || 1,
    endColumn: Number(finding.endColumn) || Number(finding.startColumn) || 1,
    evidence: redactEvidence(finding.evidence),
    message: finding.message || '',
    remediation: finding.remediation || '',
    features: Array.from(new Set(finding.features || [])),
    fileDigest: finding.fileDigest || '',
    policyVersion: finding.policyVersion || '',
    analyzerVersion: finding.analyzerVersion || '',
    scannerVersion: finding.scannerVersion || '',
  };
  return { ...normalized, fingerprint: finding.fingerprint || createFingerprint(normalized) };
};

const syntheticFinding = (ruleId, title, message, features) => normalizeFinding({
  ruleId,
  title,
  category: 'combined-risk',
  severity: 'critical',
  confidence: 'high',
  filePath: '',
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
  evidence: '多个风险能力在同一 Skill 中组合出现。',
  message,
  remediation: '删除该能力组合，或将其拆分为需要用户明确确认的独立步骤。',
  features,
});

const aggregateFindings = (rawFindings) => {
  const findings = rawFindings.map(normalizeFinding);
  const featureSet = new Set(findings
    .filter((finding) => finding.confidence !== 'low')
    .flatMap((finding) => finding.features || []));
  const combinations = [
    ['COMBO_SECRET_EXFILTRATION', '敏感信息可能被外传', ['sensitive-source', 'network-sink'], '同时发现敏感信息读取与外部发送能力。'],
    ['COMBO_DOWNLOAD_EXECUTE', '下载内容可能被执行', ['download', 'execute'], '同时发现网络下载与代码或命令执行能力。'],
    ['COMBO_OBFUSCATED_EXECUTION', '混淆载荷可能被执行', ['obfuscation', 'execute'], '同时发现编码或混淆载荷与动态执行能力。'],
    ['COMBO_OVERRIDE_CONCEALMENT', '提示覆盖与隐瞒行为组合', ['prompt-override', 'concealment'], '同时发现覆盖上层指令与隐瞒操作的要求。'],
    ['COMBO_OVERRIDE_PRIVILEGE', '提示覆盖与高权限操作组合', ['prompt-override', 'privilege'], '同时发现覆盖上层指令与提升系统权限的操作。'],
    ['COMBO_BROAD_DELETE', '可能执行广泛递归删除', ['broad-delete'], '发现可对宽泛路径执行递归删除的能力。'],
  ];
  combinations.forEach(([ruleId, title, required, message]) => {
    if (required.every((feature) => featureSet.has(feature))) {
      findings.push(syntheticFinding(ruleId, title, message, required));
    }
  });

  const unique = [];
  const seen = new Set();
  findings.forEach((finding) => {
    if (seen.has(finding.fingerprint)) return;
    seen.add(finding.fingerprint);
    unique.push(finding);
  });
  return unique;
};

const getBaseLevel = (findings) => {
  const dangerous = findings.some((finding) => (
    finding.severity === 'critical' && finding.confidence === 'high'
  ));
  if (dangerous) return 'dangerous';

  const suspicious = findings.some((finding) => (
    finding.confidence !== 'low' && (
      SEVERITY_RANK[finding.severity] >= SEVERITY_RANK.high
      || (finding.severity === 'medium' && finding.confidence === 'high')
    )
  ));
  if (suspicious) return 'suspicious';
  return 'safe';
};

const getEffectiveLevel = (baseLevel) => baseLevel;

const normalizeSecurityLevel = (value) => {
  if (value === 'dangerous') return 'dangerous';
  if (value === 'safe') return 'safe';
  return 'suspicious';
};

module.exports = {
  ANALYZER_VERSION,
  POLICY,
  POLICY_VERSION,
  SCANNER_VERSION,
  SEVERITY_RANK,
  aggregateFindings,
  getBaseLevel,
  getEffectiveLevel,
  normalizeSecurityLevel,
  normalizeFinding,
  redactEvidence,
};
