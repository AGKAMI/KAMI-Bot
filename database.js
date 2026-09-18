/**
 * Simple JSON-based Database for Group Settings
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const DB_PATH = path.join(__dirname, 'database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const MODS_DB = path.join(DB_PATH, 'mods.json');

const GLOBAL_DB = path.join(DB_PATH, 'global.json');

// Initialize database directory
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

// Initialize database files
const initDB = (filePath, defaultData = {}) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

initDB(GROUPS_DB, {});
initDB(USERS_DB, {});
initDB(WARNINGS_DB, {});
initDB(MODS_DB, { moderators: [] });
initDB(GLOBAL_DB, { selfMode: false, approvedNumbers: [] });

// Read database
const readDB = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading database: ${error.message}`);
    return {};
  }
};

// Write database
const writeDB = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing database: ${error.message}`);
    return false;
  }
};

// Group Settings
const getGroupSettings = (groupId) => {
  const groups = readDB(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    writeDB(GROUPS_DB, groups);
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = readDB(GROUPS_DB);
  groups[groupId] = { ...groups[groupId], ...settings };
  return writeDB(GROUPS_DB, groups);
};

// User Data
const getUser = (userId) => {
  const users = readDB(USERS_DB);
  if (!users[userId]) {
    users[userId] = {
      registered: Date.now(),
      premium: false,
      banned: false
    };
    writeDB(USERS_DB, users);
  }
  return users[userId];
};

const updateUser = (userId, data) => {
  const users = readDB(USERS_DB);
  users[userId] = { ...users[userId], ...data };
  return writeDB(USERS_DB, users);
};

// Warnings System
const getWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  return warnings[key] || { count: 0, warnings: [] };
};

const addWarning = (groupId, userId, reason) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (!warnings[key]) {
    warnings[key] = { count: 0, warnings: [] };
  }
  
  warnings[key].count++;
  warnings[key].warnings.push({
    reason,
    date: Date.now()
  });
  
  writeDB(WARNINGS_DB, warnings);
  return warnings[key];
};

const removeWarning = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (warnings[key] && warnings[key].count > 0) {
    warnings[key].count--;
    warnings[key].warnings.pop();
    writeDB(WARNINGS_DB, warnings);
    return true;
  }
  return false;
};

const clearWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  delete warnings[key];
  return writeDB(WARNINGS_DB, warnings);
};

// Moderators System
const getModerators = () => {
  const mods = readDB(MODS_DB);
  return mods.moderators || [];
};

const addModerator = (userId) => {
  const mods = readDB(MODS_DB);
  if (!mods.moderators) mods.moderators = [];
  if (!mods.moderators.includes(userId)) {
    mods.moderators.push(userId);
    return writeDB(MODS_DB, mods);
  }
  return false;
};

const removeModerator = (userId) => {
  const mods = readDB(MODS_DB);
  if (mods.moderators) {
    mods.moderators = mods.moderators.filter(id => id !== userId);
    return writeDB(MODS_DB, mods);
  }
  return false;
};

const isModerator = (userId) => {
  const mods = getModerators();
  return mods.includes(userId);
};

// Global Settings
const getGlobalSettings = () => {
  return readDB(GLOBAL_DB);
};

const updateGlobalSettings = (settings) => {
  const current = readDB(GLOBAL_DB);
  const updated = { ...current, ...settings };
  return writeDB(GLOBAL_DB, updated);
};

// Approved Numbers (for DM blocker)
const getApprovedNumbers = () => {
  const settings = getGlobalSettings();
  return settings.approvedNumbers || [];
};

const addApprovedNumber = (number) => {
  const settings = getGlobalSettings();
  if (!settings.approvedNumbers) settings.approvedNumbers = [];
  // Normalize: remove +, spaces, dashes
  const normalized = number.replace(/[\+\-\s]/g, '');
  if (!settings.approvedNumbers.includes(normalized)) {
    settings.approvedNumbers.push(normalized);
    return writeDB(GLOBAL_DB, settings);
  }
  return false;
};

const removeApprovedNumber = (number) => {
  const settings = getGlobalSettings();
  if (!settings.approvedNumbers) return false;
  const normalized = number.replace(/[\+\-\s]/g, '');
  settings.approvedNumbers = settings.approvedNumbers.filter(n => n !== normalized);
  return writeDB(GLOBAL_DB, settings);
};

const isApprovedNumber = (jid) => {
  const settings = getGlobalSettings();
  if (!settings.selfMode) return true; // Not in private mode, everyone allowed
  
  // Normalize JID (resolve @lid to phone number)
  const { normalizeJidWithLid } = require('./utils/jidHelper');
  const normalized = normalizeJidWithLid(jid);
  const number = (normalized || jid).replace(/@.*$/, '');
  const rawNumber = jid.replace(/@.*$/, '');
  
  const approved = settings.approvedNumbers || [];
  // Owner is always approved
  const ownerNumbers = (config.ownerNumber || []).map(n => n.replace(/[\+\-\s]/g, ''));
  if (ownerNumbers.includes(number) || ownerNumbers.includes(rawNumber)) return true;
  return approved.includes(number) || approved.includes(rawNumber);
};

module.exports = {
  getGroupSettings,
  updateGroupSettings,
  getUser,
  updateUser,
  getWarnings,
  addWarning,
  removeWarning,
  clearWarnings,
  getModerators,
  addModerator,
  removeModerator,
  isModerator,
  getGlobalSettings,
  updateGlobalSettings,
  getApprovedNumbers,
  addApprovedNumber,
  removeApprovedNumber,
  isApprovedNumber
};
