import { Router } from 'express';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { requireCap } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const MAX_BACKUPS = 5;

/** Check if we're running inside Docker */
function isInsideDocker(): boolean {
  return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
}

/** Check if pg_dump is available locally */
function hasPgDumpLocally(): boolean {
  try {
    execFileSync('pg_dump', ['--version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Detect the Docker Compose service name for the DB container */
function getDbContainerService(): string {
  return process.env.DB_DOCKER_SERVICE || 'db';
}

/** Ensure backup directory exists */
async function ensureBackupDir(): Promise<void> {
  try {
    await fs.promises.access(BACKUP_DIR);
  } catch {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  }
}

/** Parse DATABASE_URL to extract connection params */
function parseDatabaseUrl(): { host: string; port: string; user: string; password: string; db: string } {
  const url = process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: u.port || '5432',
      user: u.username || 'postgres',
      password: u.password || '',
      db: u.pathname.replace(/^\//, '') || 'finance',
    };
  } catch {
    // Fallback
    return { host: 'localhost', port: '5432', user: 'postgres', password: '', db: 'finance' };
  }
}

/** Auto-rotate: keep only last N backups */
async function rotateBackups(): Promise<void> {
  await ensureBackupDir();
  const entries = await fs.promises.readdir(BACKUP_DIR);
  const sqlGzFiles = entries.filter((f) => f.endsWith('.sql.gz'));

  const filesWithTime: Array<{ name: string; time: number }> = [];
  for (const f of sqlGzFiles) {
    const stat = await fs.promises.stat(path.join(BACKUP_DIR, f));
    filesWithTime.push({ name: f, time: stat.mtime.getTime() });
  }

  filesWithTime.sort((a, b) => b.time - a.time);

  // Remove oldest if exceeding MAX_BACKUPS
  const toRemove = filesWithTime.slice(MAX_BACKUPS);
  for (const f of toRemove) {
    try {
      await fs.promises.unlink(path.join(BACKUP_DIR, f.name));
      logger.info(`Backup rotated: deleted ${f.name}`);
    } catch (err) {
      logger.error({ err }, `Failed to delete backup ${f.name}`);
    }
  }
}

/** Spawn a command pipeline and return a promise */
function spawnPipeline(
  dumpCmd: string,
  dumpArgs: readonly string[],
  compressCmd: string,
  compressArgs: readonly string[],
  outputPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dumper = spawn(dumpCmd, dumpArgs as string[], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const compressor = spawn(compressCmd, compressArgs as string[], { stdio: ['pipe', 'pipe', 'pipe'] });
    const outStream = fs.createWriteStream(outputPath);

    let dumpStderr = '';

    dumper.stderr.on('data', (chunk: Buffer) => { dumpStderr += chunk.toString(); });
    compressor.stderr.on('data', () => { /* drain stderr so the child never blocks on a full pipe */ });

    dumper.stdout.pipe(compressor.stdin);
    compressor.stdout.pipe(outStream);

    let settled = false;
    const timer = setTimeout(() => {
      dumper.kill('SIGTERM');
      compressor.kill('SIGTERM');
      finish(new Error(`${dumpCmd} timed out`));
    }, timeoutMs);

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    dumper.on('error', (err) => finish(new Error(`${dumpCmd} spawn error: ${err.message}`)));
    compressor.on('error', (err) => finish(new Error(`${compressCmd} spawn error: ${err.message}`)));
    outStream.on('error', (err) => finish(new Error(`File write error: ${err.message}`)));
    dumper.on('close', (code) => { if (code !== 0) finish(new Error(`${dumpCmd} exited ${code}: ${dumpStderr}`)); });
    outStream.on('finish', () => finish());
  });
}

/** Spawn a decompress | restore pipeline and return a promise */
function spawnRestorePipeline(
  decompressCmd: string,
  decompressArgs: readonly string[],
  restoreCmd: string,
  restoreArgs: readonly string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const decompressor = spawn(decompressCmd, decompressArgs as string[], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const restorer = spawn(restoreCmd, restoreArgs as string[], { env, stdio: ['pipe', 'pipe', 'pipe'] });

    let decompStderr = '';
    let restoreStderr = '';

    decompressor.stderr.on('data', (chunk: Buffer) => { decompStderr += chunk.toString(); });
    restorer.stderr.on('data', (chunk: Buffer) => { restoreStderr += chunk.toString(); });

    decompressor.stdout.pipe(restorer.stdin);

    let settled = false;
    const timer = setTimeout(() => {
      decompressor.kill('SIGTERM');
      restorer.kill('SIGTERM');
      finish(new Error(`restore timed out`));
    }, timeoutMs);

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    decompressor.on('error', (err) => finish(new Error(`${decompressCmd} error: ${err.message}`)));
    restorer.on('error', (err) => finish(new Error(`${restoreCmd} error: ${err.message}`)));
    decompressor.on('close', (code) => { if (code !== 0) finish(new Error(`${decompressCmd} exited ${code}: ${decompStderr}`)); });
    restorer.on('close', (code) => { if (code !== 0) finish(new Error(`${restoreCmd} exited ${code}: ${restoreStderr}`)); else finish(); });
  });
}

/** Build backup command args based on environment (Docker vs local) */
function buildDumpCommand(host: string, port: string, user: string, db: string): { cmd: string; args: string[] } {
  const pgFlags = ['--no-owner', '--no-privileges', '--clean', '--if-exists'];
  if (isInsideDocker() || hasPgDumpLocally()) {
    return { cmd: 'pg_dump', args: ['-h', host, '-p', port, '-U', user, '-d', db, ...pgFlags] };
  }
  // Run pg_dump inside Docker container
  const svc = getDbContainerService();
  return { cmd: 'docker', args: ['compose', 'exec', '-T', svc, 'pg_dump', '-U', user, '-d', db, ...pgFlags] };
}

/** Build restore command args based on environment (Docker vs local) */
function buildRestoreCommand(host: string, port: string, user: string, db: string): { cmd: string; args: string[] } {
  if (isInsideDocker() || hasPgDumpLocally()) {
    return { cmd: 'psql', args: ['-h', host, '-p', port, '-U', user, '-d', db] };
  }
  const svc = getDbContainerService();
  return { cmd: 'docker', args: ['compose', 'exec', '-T', svc, 'psql', '-U', user, '-d', db] };
}

// GET /api/backup/list — list backup files
router.get('/list', async (_req, res) => {
  try {
    await ensureBackupDir();
    const entries = await fs.promises.readdir(BACKUP_DIR);
    const sqlGzFiles = entries.filter((f) => f.endsWith('.sql.gz'));

    const files: Array<{ filename: string; size: number; date: string }> = [];
    for (const f of sqlGzFiles) {
      const stat = await fs.promises.stat(path.join(BACKUP_DIR, f));
      files.push({
        filename: f,
        size: stat.size,
        date: stat.mtime.toISOString(),
      });
    }

    files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.json(files);
  } catch (error) {
    logger.error({ error }, 'GET /backup/list error');
    return res.status(500).json({ error: 'Gagal membaca daftar backup.' });
  }
});

// POST /api/backup/create — trigger pg_dump
router.post('/create', async (_req, res) => {
  try {
    await ensureBackupDir();
    const { host, port, user, password, db } = parseDatabaseUrl();

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:\-T]/g, '').replace(/\..+$/, '').slice(0, 15);
    const filename = `backup-${timestamp}.sql.gz`;
    const filepath = path.join(BACKUP_DIR, filename);

    const env = { ...process.env, PGPASSWORD: password };
    const { cmd: dumpCmd, args: dumpArgs } = buildDumpCommand(host, port, user, db);

    await spawnPipeline(dumpCmd, dumpArgs, 'gzip', [], filepath, env, 120_000);

    // Verify file was created
    try {
      await fs.promises.access(filepath);
    } catch {
      return res.status(500).json({ error: 'Backup gagal: file tidak terbuat.' });
    }

    const stat = await fs.promises.stat(filepath);

    // Auto-rotate
    await rotateBackups();

    return res.json({
      filename,
      size: stat.size,
      date: stat.mtime.toISOString(),
    });
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'POST /backup/create error');
    return res.status(500).json({ error: 'Gagal membuat backup. Silakan coba lagi atau hubungi administrator.' });
  }
});

// GET /api/backup/download/:filename — download a backup file
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename as string;

    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith('.sql.gz')) {
      return res.status(400).json({ error: 'Format file tidak valid.' });
    }

    const filepath = path.join(BACKUP_DIR, sanitized);
    try {
      await fs.promises.access(filepath);
    } catch {
      return res.status(404).json({ error: 'File backup tidak ditemukan.' });
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitized}"`);

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
  } catch (error) {
    logger.error({ error }, 'GET /backup/download error');
    return res.status(500).json({ error: 'Gagal mengunduh backup.' });
  }
});

// POST /api/backup/upload — upload backup file from external source
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await ensureBackupDir();
      cb(null, BACKUP_DIR);
    },
    filename: (_req, file, cb) => {
      // Keep original filename if .sql.gz, otherwise prefix with upload-
      const name = file.originalname.endsWith('.sql.gz')
        ? file.originalname
        : `upload-${Date.now()}.sql.gz`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.sql.gz') || file.mimetype === 'application/gzip' || file.mimetype === 'application/x-gzip') {
      cb(null, true);
    } else {
      cb(new Error('Hanya file .sql.gz yang diperbolehkan.'));
    }
  },
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File backup tidak ditemukan dalam request.' });
    }

    const filename = req.file.filename;
    const size = req.file.size;

    logger.info({ filename, size }, 'Backup file uploaded');
    return res.json({
      message: `File ${filename} diunggah.`,
      filename,
      size,
    });
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'POST /backup/upload error');
    return res.status(500).json({ error: 'Gagal mengupload file backup.' });
  }
});

// POST /api/backup/restore — restore from backup
router.post('/restore', requireCap('doc.cancel'), async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Parameter filename wajib diisi.' });
    }

    // Sanitize filename
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith('.sql.gz')) {
      return res.status(400).json({ error: 'Format file tidak valid.' });
    }

    const filepath = path.join(BACKUP_DIR, sanitized);
    try {
      await fs.promises.access(filepath);
    } catch {
      return res.status(404).json({ error: 'File backup tidak ditemukan.' });
    }

    const { host, port, user, password, db } = parseDatabaseUrl();
    const env = { ...process.env, PGPASSWORD: password };
    const { cmd: restoreCmd, args: restoreArgs } = buildRestoreCommand(host, port, user, db);

    await spawnRestorePipeline('gunzip', ['-c', filepath], restoreCmd, restoreArgs, env, 300_000);

    logger.info(`Backup restored: ${sanitized}`);
    return res.json({ message: `Backup dipulihkan dari ${sanitized}.` });
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'POST /backup/restore error');
    return res.status(500).json({ error: 'Gagal restore backup. Silakan coba lagi atau hubungi administrator.' });
  }
});

export default router;
