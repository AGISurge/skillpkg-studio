const crypto = require('crypto');

const ensureSecuritySchema = (db) => {
  db.run(`
  CREATE TABLE IF NOT EXISTS security_scan_task (
    id TEXT PRIMARY KEY,
    libraryPath TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    stateJson TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    completedAt TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_security_task_library
    ON security_scan_task(libraryPath, startedAt DESC);

  CREATE TABLE IF NOT EXISTS security_report (
    id TEXT PRIMARY KEY,
    libraryPath TEXT NOT NULL,
    skillId TEXT NOT NULL,
    name TEXT NOT NULL,
    rootPath TEXT NOT NULL,
    baseLevel TEXT NOT NULL,
    effectiveLevel TEXT NOT NULL,
    coverage TEXT NOT NULL,
    findingCount INTEGER NOT NULL,
    severityCountsJson TEXT NOT NULL,
    digest TEXT NOT NULL,
    policyVersion TEXT NOT NULL,
    analyzerVersion TEXT NOT NULL,
    scannerVersion TEXT NOT NULL,
    scannedAt TEXT NOT NULL,
    runId TEXT NOT NULL,
    UNIQUE(libraryPath, skillId)
  );
  CREATE INDEX IF NOT EXISTS idx_security_report_library
    ON security_report(libraryPath, scannedAt DESC);

  CREATE TABLE IF NOT EXISTS security_finding (
    id TEXT PRIMARY KEY,
    reportId TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    ruleId TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence TEXT NOT NULL,
    filePath TEXT NOT NULL,
    startLine INTEGER NOT NULL,
    startColumn INTEGER NOT NULL,
    endLine INTEGER NOT NULL,
    endColumn INTEGER NOT NULL,
    evidence TEXT NOT NULL,
    message TEXT NOT NULL,
    remediation TEXT NOT NULL,
    featuresJson TEXT NOT NULL,
    fileDigest TEXT NOT NULL,
    policyVersion TEXT NOT NULL,
    analyzerVersion TEXT NOT NULL,
    scannerVersion TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_security_finding_report
    ON security_finding(reportId, severity, filePath, startLine);

  CREATE TABLE IF NOT EXISTS security_file_cache (
    libraryPath TEXT NOT NULL,
    skillId TEXT NOT NULL,
    filePath TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtimeMs INTEGER NOT NULL,
    digest TEXT NOT NULL,
    coverage TEXT NOT NULL,
    findingsJson TEXT NOT NULL,
    policyVersion TEXT NOT NULL,
    analyzerVersion TEXT NOT NULL,
    scannedAt TEXT NOT NULL,
    PRIMARY KEY(libraryPath, skillId, filePath)
  );
  `);
  const findingColumns = new Set(
    (db.exec('PRAGMA table_info(security_finding);')[0]?.values || [])
      .map((row) => row[1]),
  );
  [
    ['fileDigest', "TEXT NOT NULL DEFAULT ''"],
    ['policyVersion', "TEXT NOT NULL DEFAULT ''"],
    ['analyzerVersion', "TEXT NOT NULL DEFAULT ''"],
    ['scannerVersion', "TEXT NOT NULL DEFAULT ''"],
  ].forEach(([name, definition]) => {
    if (!findingColumns.has(name)) {
      db.run(`ALTER TABLE security_finding ADD COLUMN ${name} ${definition};`);
    }
  });
};

const queryRows = (db, sql, values = []) => {
  const statement = db.prepare(sql);
  try {
    statement.bind(values);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
};

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const reportIdFor = (libraryPath, skillId) => crypto
  .createHash('sha256')
  .update(`${libraryPath}\0${skillId}`)
  .digest('hex');

const mapReport = (row) => ({
  id: row.id,
  libraryPath: row.libraryPath,
  skillId: row.skillId,
  name: row.name,
  rootPath: row.rootPath,
  baseLevel: row.baseLevel,
  effectiveLevel: row.effectiveLevel,
  coverage: row.coverage,
  findingCount: Number(row.findingCount) || 0,
  severityCounts: parseJson(row.severityCountsJson, {}),
  digest: row.digest,
  policyVersion: row.policyVersion,
  analyzerVersion: row.analyzerVersion,
  scannerVersion: row.scannerVersion,
  scannedAt: row.scannedAt,
  runId: row.runId,
});

const mapFinding = (row) => ({
  id: row.id,
  fingerprint: row.fingerprint,
  ruleId: row.ruleId,
  title: row.title,
  category: row.category,
  severity: row.severity,
  confidence: row.confidence,
  filePath: row.filePath,
  startLine: Number(row.startLine) || 1,
  startColumn: Number(row.startColumn) || 1,
  endLine: Number(row.endLine) || 1,
  endColumn: Number(row.endColumn) || 1,
  evidence: row.evidence,
  message: row.message,
  remediation: row.remediation,
  features: parseJson(row.featuresJson, []),
  fileDigest: row.fileDigest || '',
  policyVersion: row.policyVersion || '',
  analyzerVersion: row.analyzerVersion || '',
  scannerVersion: row.scannerVersion || '',
});

const createSecurityStore = ({ getDatabase, withWrite }) => {
  const database = () => {
    const db = getDatabase();
    if (!db) throw new Error('数据库不可用。');
    return db;
  };

  const saveTask = (task) => withWrite((db) => {
    db.run(`
      INSERT INTO security_scan_task
        (id, libraryPath, mode, status, stateJson, startedAt, completedAt, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        stateJson = excluded.stateJson,
        completedAt = excluded.completedAt,
        error = excluded.error;
    `, [
      task.id,
      task.libraryPath,
      task.mode,
      task.status,
      JSON.stringify(task),
      task.startedAt,
      task.completedAt || null,
      task.error || null,
    ]);
  });

  const getLatestTask = (libraryPath) => {
    const rows = queryRows(database(), `
      SELECT stateJson FROM security_scan_task
      WHERE libraryPath = ? ORDER BY startedAt DESC LIMIT 1;
    `, [libraryPath]);
    return rows.length ? parseJson(rows[0].stateJson, null) : null;
  };

  const listReports = (libraryPath) => queryRows(database(), `
    SELECT * FROM security_report WHERE libraryPath = ? ORDER BY name COLLATE NOCASE;
  `, [libraryPath]).map(mapReport);

  const getReport = (libraryPath, skillId) => {
    const rows = queryRows(database(), `
      SELECT * FROM security_report WHERE libraryPath = ? AND skillId = ? LIMIT 1;
    `, [libraryPath, skillId]);
    if (!rows.length) return null;
    const report = mapReport(rows[0]);
    const findings = queryRows(database(), `
      SELECT * FROM security_finding WHERE reportId = ?
      ORDER BY CASE severity
        WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
        WHEN 'low' THEN 3 ELSE 4 END, filePath, startLine;
    `, [report.id]).map(mapFinding);
    return { ...report, findings };
  };

  const getFileCache = (libraryPath, skillId, filePath) => {
    const rows = queryRows(database(), `
      SELECT * FROM security_file_cache
      WHERE libraryPath = ? AND skillId = ? AND filePath = ? LIMIT 1;
    `, [libraryPath, skillId, filePath]);
    if (!rows.length) return null;
    const row = rows[0];
    return {
      libraryPath: row.libraryPath,
      skillId: row.skillId,
      filePath: row.filePath,
      size: Number(row.size),
      mtimeMs: Number(row.mtimeMs),
      digest: row.digest,
      coverage: row.coverage,
      findings: parseJson(row.findingsJson, []),
      policyVersion: row.policyVersion,
      analyzerVersion: row.analyzerVersion,
      scannedAt: row.scannedAt,
    };
  };

  const saveReport = (report, fileResults) => withWrite((db) => {
    const reportId = reportIdFor(report.libraryPath, report.skillId);
    db.run('DELETE FROM security_finding WHERE reportId = ?;', [reportId]);
    db.run(`
      INSERT INTO security_report
        (id, libraryPath, skillId, name, rootPath, baseLevel, effectiveLevel,
         coverage, findingCount, severityCountsJson, digest, policyVersion,
         analyzerVersion, scannerVersion, scannedAt, runId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(libraryPath, skillId) DO UPDATE SET
        id = excluded.id,
        name = excluded.name,
        rootPath = excluded.rootPath,
        baseLevel = excluded.baseLevel,
        effectiveLevel = excluded.effectiveLevel,
        coverage = excluded.coverage,
        findingCount = excluded.findingCount,
        severityCountsJson = excluded.severityCountsJson,
        digest = excluded.digest,
        policyVersion = excluded.policyVersion,
        analyzerVersion = excluded.analyzerVersion,
        scannerVersion = excluded.scannerVersion,
        scannedAt = excluded.scannedAt,
        runId = excluded.runId;
    `, [
      reportId, report.libraryPath, report.skillId, report.name, report.rootPath,
      report.baseLevel, report.effectiveLevel, report.coverage, report.findingCount,
      JSON.stringify(report.severityCounts || {}), report.digest, report.policyVersion,
      report.analyzerVersion, report.scannerVersion, report.scannedAt, report.runId,
    ]);

    report.findings.forEach((finding, index) => {
      db.run(`
        INSERT INTO security_finding
          (id, reportId, fingerprint, ruleId, title, category, severity, confidence,
           filePath, startLine, startColumn, endLine, endColumn, evidence, message,
           remediation, featuresJson, fileDigest, policyVersion, analyzerVersion,
           scannerVersion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `, [
        `${reportId}:${index}:${finding.fingerprint}`,
        reportId,
        finding.fingerprint,
        finding.ruleId,
        finding.title,
        finding.category,
        finding.severity,
        finding.confidence,
        finding.filePath,
        finding.startLine,
        finding.startColumn,
        finding.endLine,
        finding.endColumn,
        finding.evidence,
        finding.message,
        finding.remediation,
        JSON.stringify(finding.features || []),
        finding.fileDigest || '',
        finding.policyVersion || report.policyVersion,
        finding.analyzerVersion || report.analyzerVersion,
        finding.scannerVersion || report.scannerVersion,
      ]);
    });

    const currentPaths = new Set(fileResults.map((result) => result.filePath));
    queryRows(db, `
      SELECT filePath FROM security_file_cache WHERE libraryPath = ? AND skillId = ?;
    `, [report.libraryPath, report.skillId]).forEach((row) => {
      if (!currentPaths.has(row.filePath)) {
        db.run(`DELETE FROM security_file_cache
          WHERE libraryPath = ? AND skillId = ? AND filePath = ?;`,
        [report.libraryPath, report.skillId, row.filePath]);
      }
    });
    fileResults.forEach((result) => {
      db.run(`
        INSERT INTO security_file_cache
          (libraryPath, skillId, filePath, size, mtimeMs, digest, coverage,
           findingsJson, policyVersion, analyzerVersion, scannedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(libraryPath, skillId, filePath) DO UPDATE SET
          size = excluded.size,
          mtimeMs = excluded.mtimeMs,
          digest = excluded.digest,
          coverage = excluded.coverage,
          findingsJson = excluded.findingsJson,
          policyVersion = excluded.policyVersion,
          analyzerVersion = excluded.analyzerVersion,
          scannedAt = excluded.scannedAt;
      `, [
        report.libraryPath,
        report.skillId,
        result.filePath,
        result.size,
        result.mtimeMs,
        result.digest,
        result.coverage,
        JSON.stringify(result.findings || []),
        report.policyVersion,
        report.analyzerVersion,
        report.scannedAt,
      ]);
    });

    return { ...report, id: reportId };
  });

  const removeMissingReports = (libraryPath, skillIds) => withWrite((db) => {
    const keep = new Set(skillIds);
    queryRows(db, 'SELECT id, skillId FROM security_report WHERE libraryPath = ?;', [libraryPath])
      .forEach((row) => {
        if (keep.has(row.skillId)) return;
        db.run('DELETE FROM security_finding WHERE reportId = ?;', [row.id]);
        db.run('DELETE FROM security_report WHERE id = ?;', [row.id]);
        db.run('DELETE FROM security_file_cache WHERE libraryPath = ? AND skillId = ?;', [libraryPath, row.skillId]);
      });
  });

  return {
    getFileCache,
    getLatestTask,
    getReport,
    listReports,
    removeMissingReports,
    saveReport,
    saveTask,
  };
};

module.exports = {
  createSecurityStore,
  ensureSecuritySchema,
};
