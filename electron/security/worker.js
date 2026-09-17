const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { parentPort } = require('worker_threads');
const { analyzeTextFileDetailed } = require('./analyzers');
const { POLICY, normalizeFinding } = require('./policyEngine');

const isInside = (targetPath, rootPath) => {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const hashFile = (filePath, countLines = false) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  let lineBreaks = 0;
  const stream = fs.createReadStream(filePath);
  stream.on('data', (chunk) => {
    hash.update(chunk);
    if (countLines) {
      let offset = -1;
      while ((offset = chunk.indexOf(10, offset + 1)) >= 0) lineBreaks += 1;
    }
  });
  stream.on('error', reject);
  stream.on('end', () => resolve({ digest: hash.digest('hex'), lineBreaks }));
});

const looksBinary = (buffer) => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) return true;
  let controlCount = 0;
  for (const value of sample) {
    if (value < 9 || (value > 13 && value < 32)) controlCount += 1;
  }
  return sample.length > 0 && controlCount / sample.length > 0.08;
};

const isSemanticDocument = (filePath) => {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return ['md', 'mdx', 'txt', 'rst'].includes(extension)
    || path.basename(filePath).toUpperCase() === 'SKILL.MD';
};

const readSampledText = async (filePath, size) => {
  const sampleBytes = POLICY.limits.sampleBytes;
  const handle = await fsp.open(filePath, 'r');
  try {
    const headSize = Math.min(sampleBytes, size);
    const tailSize = Math.min(sampleBytes, Math.max(0, size - headSize));
    const head = Buffer.alloc(headSize);
    await handle.read(head, 0, headSize, 0);
    if (!tailSize) return { head, tail: Buffer.alloc(0) };
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, size - tailSize);
    return { head, tail };
  } finally {
    await handle.close();
  }
};

const unknownBinaryFinding = (file) => normalizeFinding({
  ruleId: 'FILE_UNKNOWN_BINARY',
  title: '未知二进制文件无法完整审查',
  category: 'scan-coverage',
  severity: 'low',
  confidence: 'high',
  filePath: file.relativePath,
  evidence: `${file.relativePath} (${file.size} bytes)`,
  message: '文件不是可识别的文本或静态资源，第一期无法分析其内部行为。',
  remediation: '移除不必要的二进制文件，或提供可审查源码和可验证的来源。',
});

const analyzeFile = async (job) => {
  const rootPath = await fsp.realpath(job.rootPath);
  const sourceStat = await fsp.lstat(job.file.fullPath);
  if (sourceStat.isSymbolicLink()) throw new Error('security-file-became-symlink');
  const realPath = await fsp.realpath(job.file.fullPath);
  if (!isInside(realPath, rootPath)) throw new Error('security-file-outside-root');
  const stat = await fsp.stat(realPath);
  if (!stat.isFile()) throw new Error('security-entry-not-file');
  const oversized = stat.size > POLICY.limits.maxFullTextBytes;
  const uncachedRead = job.cached || job.metadataOnly
    ? null
    : oversized
      ? readSampledText(realPath, stat.size)
      : fsp.readFile(realPath);
  const { digest, lineBreaks } = await hashFile(realPath, oversized);
  if (job.cached && job.cached.digest === digest) {
    return {
      filePath: job.file.relativePath,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      digest,
      coverage: job.cached.coverage,
      findings: [
        ...(job.cached.deterministicFindings || []),
        ...(job.cached.instructionFindings || []),
      ],
      deterministicFindings: job.cached.deterministicFindings || [],
      instructionFindings: job.cached.instructionFindings || [],
      semanticEligible: isSemanticDocument(job.file.relativePath),
      cacheHit: true,
    };
  }
  if (job.metadataOnly) {
    return {
      filePath: job.file.relativePath,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      digest,
      coverage: job.metadataCoverage || 'complete',
      findings: [],
      deterministicFindings: [],
      instructionFindings: [],
      semanticEligible: false,
    };
  }
  const sampled = uncachedRead || (oversized
    ? await readSampledText(realPath, stat.size)
    : await fsp.readFile(realPath));
  const resolvedSample = await sampled;
  const binarySample = oversized
    ? Buffer.concat([resolvedSample.head, resolvedSample.tail])
    : resolvedSample;
  const binary = looksBinary(binarySample);
  if (binary) {
    return {
      filePath: job.file.relativePath,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      digest,
      coverage: 'incomplete',
      findings: [unknownBinaryFinding(job.file)],
      deterministicFindings: [unknownBinaryFinding(job.file)],
      instructionFindings: [],
      semanticEligible: false,
    };
  }

  const deterministicFindings = [];
  const instructionFindings = [];
  if (oversized) {
    const headContent = resolvedSample.head.toString('utf8');
    const tailContent = resolvedSample.tail.toString('utf8');
    const tailLineCount = (tailContent.match(/\n/g) || []).length + 1;
    const tailLineOffset = Math.max(0, lineBreaks + 1 - tailLineCount);
    const headAnalysis = analyzeTextFileDetailed({
      filePath: job.file.relativePath,
      content: headContent,
    });
    const tailAnalysis = analyzeTextFileDetailed({
      filePath: job.file.relativePath,
      content: tailContent,
    });
    deterministicFindings.push(
      ...headAnalysis.deterministicFindings,
      ...tailAnalysis.deterministicFindings.map((finding) => ({
        ...finding,
        startLine: finding.startLine + tailLineOffset,
        endLine: finding.endLine + tailLineOffset,
      })),
    );
    instructionFindings.push(
      ...headAnalysis.instructionFindings,
      ...tailAnalysis.instructionFindings.map((finding) => ({
        ...finding,
        startLine: finding.startLine + tailLineOffset,
        endLine: finding.endLine + tailLineOffset,
      })),
    );
  } else {
    const analysis = analyzeTextFileDetailed({
      filePath: job.file.relativePath,
      content: resolvedSample.toString('utf8'),
    });
    deterministicFindings.push(...analysis.deterministicFindings);
    instructionFindings.push(...analysis.instructionFindings);
  }
  if (oversized) {
    deterministicFindings.push(normalizeFinding({
      ruleId: 'FILE_TEXT_TOO_LARGE',
      title: '大文本文件仅扫描首尾片段',
      category: 'scan-coverage',
      severity: 'low',
      confidence: 'high',
      filePath: job.file.relativePath,
      evidence: `${job.file.relativePath} (${stat.size} bytes)`,
      message: `文件超过 ${POLICY.limits.maxFullTextBytes} 字节，中间内容未完成深度扫描。`,
      remediation: '拆分文件或移除不必要的大块内容后重新扫描。',
    }));
  }
  const findings = [...deterministicFindings, ...instructionFindings];
  return {
    filePath: job.file.relativePath,
    size: stat.size,
    mtimeMs: Math.round(stat.mtimeMs),
    digest,
    coverage: oversized ? 'incomplete' : 'complete',
    findings,
    deterministicFindings,
    instructionFindings,
    semanticEligible: isSemanticDocument(job.file.relativePath),
  };
};

if (parentPort) {
  parentPort.on('message', async (message) => {
    if (message?.type !== 'analyze') return;
    try {
      const result = await analyzeFile(message.job);
      parentPort.postMessage({ type: 'result', id: message.id, result });
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        id: message.id,
        error: String(error?.message || error),
      });
    }
  });
}

module.exports = { analyzeFile, looksBinary };
