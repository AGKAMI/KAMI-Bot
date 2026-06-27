/**
 * Global Cleanup System
 * Aggressive cleanup to prevent ENOSPC on small 1GB servers
 */

const fs = require('fs');
const path = require('path');
const { getTempDir } = require('./tempManager');
const config = require('../config');

// Run every 2 minutes
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

// Delete files older than 2 minutes (Baileys enc files should be done by then)
const FILE_AGE_THRESHOLD_MS = 2 * 60 * 1000;

// HARD LIMIT: 150MB — on a 1GB server, video files can be 300MB+
const SIZE_LIMIT_BYTES = 150 * 1024 * 1024;
const SIZE_TARGET_BYTES = 50 * 1024 * 1024;

// Session directory name (must NEVER be cleaned)
const SESSION_DIR_NAME = config.sessionName || 'session';

let cleanupInterval = null;

/**
 * Aggressively clean up ALL temp files
 * Deletes everything in temp except session dir
 * Called after every media send
 */
function cleanupTempFiles() {
  try {
    const tempDir = getTempDir();
    if (!fs.existsSync(tempDir)) return;

    const now = Date.now();
    let deletedCount = 0;
    let totalSizeFreed = 0;

    const files = fs.readdirSync(tempDir);

    for (const file of files) {
      const filePath = path.join(tempDir, file);

      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          if (file === SESSION_DIR_NAME || filePath.includes(SESSION_DIR_NAME)) {
            continue;
          }
          // Delete empty subdirs
          try { fs.rmdirSync(filePath); } catch(e) {}
          continue;
        }

        // Delete ALL files in temp — they're all disposable
        const fileSize = stats.size;
        fs.unlinkSync(filePath);
        deletedCount++;
        totalSizeFreed += fileSize;
      } catch (error) {
        if (!error.message.includes('ENOENT') && !error.message.includes('EBUSY')) {
          // Silent — files in use during send are expected
        }
      }
    }

    if (deletedCount > 0) {
      const sizeMB = (totalSizeFreed / (1024 * 1024)).toFixed(2);
      console.log(`🧹 Cleanup: Deleted ${deletedCount} temp file(s), freed ${sizeMB} MB`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

/**
 * Size-based emergency cleanup
 * If temp dir exceeds SIZE_LIMIT_BYTES, nuke everything down to SIZE_TARGET_BYTES
 */
function cleanupBySize() {
  try {
    const tempDir = getTempDir();
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    let totalBytes = 0;
    const fileStats = [];

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && file !== SESSION_DIR_NAME) {
          totalBytes += stats.size;
          fileStats.push({ path: filePath, size: stats.size, mtime: stats.mtimeMs });
        }
      } catch(e) {}
    }

    if (totalBytes > SIZE_LIMIT_BYTES) {
      console.log(`🚨 Size emergency: temp at ${(totalBytes/(1024*1024)).toFixed(1)}MB, nuking oldest...`);
      fileStats.sort((a, b) => a.mtime - b.mtime);
      let freed = 0;
      for (const f of fileStats) {
        if (totalBytes - freed <= SIZE_TARGET_BYTES) break;
        try { fs.unlinkSync(f.path); freed += f.size; } catch(e) {}
      }
      console.log(`🧹 Size cleanup: freed ${(freed/(1024*1024)).toFixed(1)}MB`);
    }
  } catch(e) {}
}

/**
 * Start the cleanup system
 */
function startCleanup() {
  console.log('🧹 Starting aggressive temp cleanup system...');
  cleanupTempFiles();
  cleanupBySize();

  cleanupInterval = setInterval(() => {
    cleanupTempFiles();
    cleanupBySize();
  }, CLEANUP_INTERVAL_MS);

  console.log(`✅ Cleanup system started (runs every ${CLEANUP_INTERVAL_MS / 1000 / 60} min, size limit ${SIZE_LIMIT_BYTES / 1024 / 1024}MB)`);
}

/**
 * Stop the cleanup system
 */
function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Cleanup system stopped');
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  stopCleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopCleanup();
  process.exit(0);
});

module.exports = {
  cleanupTempFiles,
  cleanupBySize,
  startCleanup,
  stopCleanup
};
