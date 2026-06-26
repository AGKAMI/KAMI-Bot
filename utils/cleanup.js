/**
 * Global Cleanup System
 * Automatically cleans up old temp files to prevent ENOSPC errors
 */

const fs = require('fs');
const path = require('path');
const { getTempDir } = require('./tempManager');
const config = require('../config');

// Cleanup interval: 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// File age threshold: 30 minutes
const FILE_AGE_THRESHOLD_MS = 10 * 60 * 1000;

// Session directory name (must NOT be cleaned)
const SESSION_DIR_NAME = config.sessionName || 'session';

let cleanupInterval = null;

/**
 * Clean up old temp files
 * Deletes files older than FILE_AGE_THRESHOLD_MS from temp directory
 * NEVER touches session directory
 */
function cleanupOldFiles() {
  try {
    const tempDir = getTempDir();
    
    // Safety check: ensure we're cleaning the right directory
    if (!fs.existsSync(tempDir)) {
      return;
    }
    
    const now = Date.now();
    let deletedCount = 0;
    let totalSizeFreed = 0;
    
    // Read all files in temp directory
    const files = fs.readdirSync(tempDir);
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      
      try {
        // Skip directories (especially session directory if it somehow got here)
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          // Double-check: never touch session directory
          if (file === SESSION_DIR_NAME || filePath.includes(SESSION_DIR_NAME)) {
            continue;
          }
          continue;
        }
        
        // Check file age
        const fileAge = now - stats.mtimeMs;
        
        if (fileAge > FILE_AGE_THRESHOLD_MS) {
          // File is older than threshold, delete it
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
          totalSizeFreed += fileSize;
        }
      } catch (error) {
        // Skip files that can't be accessed (might be in use)
        // Don't log errors for files that are being used
        if (!error.message.includes('ENOENT') && !error.message.includes('EBUSY')) {
          console.warn(`Error processing file ${filePath}:`, error.message);
        }
      }
    }
    
    if (deletedCount > 0) {
      const sizeMB = (totalSizeFreed / (1024 * 1024)).toFixed(2);
      console.log(`🧹 Cleanup: Deleted ${deletedCount} old temp file(s), freed ${sizeMB} MB`);
    }
  } catch (error) {
    // Don't crash on cleanup errors
    console.error('Error during cleanup:', error.message);
  }
}

/**
 * Start the cleanup system
 * Runs cleanup at startup and then every CLEANUP_INTERVAL_MS
 */
function startCleanup() {
  // Run cleanup immediately at startup
  console.log('🧹 Starting temp file cleanup system...');
  cleanupOldFiles();
    cleanupBySize();
  
  // Set up periodic cleanup
  cleanupInterval = setInterval(() => {
    cleanupOldFiles();
    cleanupBySize();
  }, CLEANUP_INTERVAL_MS);
  
  console.log(`✅ Cleanup system started (runs every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes)`);
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
  cleanupOldFiles,
  startCleanup,
  stopCleanup
};


// === SIZE-BASED CLEANUP ===
// If temp dir exceeds 300MB, delete oldest files until under 200MB
const SIZE_LIMIT_BYTES = 300 * 1024 * 1024;
const SIZE_TARGET_BYTES = 200 * 1024 * 1024;

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
      console.log('🧹 Size cleanup: temp at ' + (totalBytes/(1024*1024)).toFixed(1) + 'MB, trimming...');
      fileStats.sort((a, b) => a.mtime - b.mtime);
      let freed = 0;
      for (const f of fileStats) {
        if (totalBytes - freed <= SIZE_TARGET_BYTES) break;
        try { fs.unlinkSync(f.path); freed += f.size; } catch(e) {}
      }
      console.log('🧹 Size cleanup: freed ' + (freed/(1024*1024)).toFixed(1) + 'MB');
    }
  } catch(e) {}
}
