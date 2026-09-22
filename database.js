/**
 * Simple JSON-based Database for Group Settings
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { buildComparableIds } = require('./utils/jidHelper');

const DB_PATH = path.join(__dirname, 'database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const MODS_DB = path.join(DB_PATH, 'mods.json');
const CREW_DB = path.join(DB_PATH, 'crew.json');
const GLOBAL_DB = path.join(DB_PATH, 'global.json');
const OWNER_PROMOTED_DB = path.join(DB_PATH, 'ownerPromotedAdmins.json');
const OWNER_ADDED_DB = path.join(DB_PATH, 'ownerAddedMembers.json');
const AUDIT_DB = path.join(DB_PATH, 'audit.json');

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
initDB(CREW_DB, { groups: {}, teamMap: {} });
initDB(GLOBAL_DB, { selfMode: false, approvedNumbers: [] });
initDB(OWNER_PROMOTED_DB, {});
initDB(OWNER_ADDED_DB, {});

// ── In-memory cache layer ────────────────────────────────────────
// All reads hit memory. Writes go to memory + debounced disk flush.
// Eliminates 9+ synchronous fs.readFileSync calls per message.
const _cache = new Map();
const _dirty = new Set(); // filePaths that need disk write
const FLUSH_INTERVAL_MS = 2000; // flush dirty files every 2 seconds

function _loadToCache(filePath) {
  if (_cache.has(filePath)) return _cache.get(filePath);
  let data;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  } catch (e) {
    data = {};
  }
  _cache.set(filePath, data);
  return data;
}

// Load all DBs into memory at startup
_loadToCache(GROUPS_DB);
_loadToCache(USERS_DB);
_loadToCache(WARNINGS_DB);
_loadToCache(MODS_DB);
_loadToCache(CREW_DB);
_loadToCache(GLOBAL_DB);
_loadToCache(OWNER_PROMOTED_DB);
_loadToCache(OWNER_ADDED_DB);
_loadToCache(AUDIT_DB);

// Periodic disk flush — write only dirty files
setInterval(() => {
  if (_dirty.size === 0) return;
  const toFlush = [..._dirty];
  _dirty.clear();
  for (const filePath of toFlush) {
    const data = _cache.get(filePath);
    if (data === undefined) continue;
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`[DB-FLUSH] Error writing ${path.basename(filePath)}: ${e.message}`);
    }
  }
}, FLUSH_INTERVAL_MS);

// Read database — from memory cache
const readDB = (filePath) => {
  return _loadToCache(filePath);
};

// Write database — to memory + mark dirty for disk flush
const writeDB = (filePath, data) => {
  _cache.set(filePath, data);
  _dirty.add(filePath);
  return true;
};

// Flush all dirty files to disk (call on shutdown)
const flushAll = () => {
  for (const filePath of _dirty) {
    const data = _cache.get(filePath);
    if (data === undefined) continue;
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {}
  }
  _dirty.clear();
};

// Force re-read from disk (for external edits)
const reloadDB = (filePath) => {
  _cache.delete(filePath);
  return _loadToCache(filePath);
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

const addWarning = (groupId, userId, reason, warnedBy = null) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (!warnings[key]) {
    warnings[key] = { count: 0, warnings: [] };
  }
  
  warnings[key].count++;
  warnings[key].warnings.push({
    reason,
    date: Date.now(),
    warnedBy
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

// ==================== Team Admin Approval ====================
// SEPARATE from the DM-blocker "approve" list. This grants SS team group admins
// DM access to ONLY .crew accept / .crew deny while applications are pending.
// The owner always counts as a team admin.

const getTeamAdmins = () => {
  const settings = getGlobalSettings();
  return settings.teamAdmins || [];
};

const addTeamAdmin = (number) => {
  const settings = getGlobalSettings();
  if (!settings.teamAdmins) settings.teamAdmins = [];
  const normalized = number.replace(/[\+\-\s]/g, '');
  if (!settings.teamAdmins.includes(normalized)) {
    settings.teamAdmins.push(normalized);
    return writeDB(GLOBAL_DB, settings);
  }
  return false;
};

const removeTeamAdmin = (number) => {
  const settings = getGlobalSettings();
  if (!settings.teamAdmins) return false;
  const normalized = number.replace(/[\+\-\s]/g, '');
  settings.teamAdmins = settings.teamAdmins.filter(n => n !== normalized);
  return writeDB(GLOBAL_DB, settings);
};

const isTeamAdmin = (jid) => {
  if (!jid) return false;
  // Owner always counts
  const fullNumber = (jid || '').split('@')[0];        // 1234567890:0
  const bareNumber = fullNumber.split(':')[0];           // 1234567890
  const ownerNumbers = (config.ownerNumber || []).map(n => n.replace(/[\+\-\s]/g, ''));
  if (ownerNumbers.includes(fullNumber) || ownerNumbers.includes(bareNumber)) return true;
  const admins = getTeamAdmins();
  // Check both formats — teamAdmins may store with or without :device suffix
  return admins.includes(fullNumber) || admins.includes(bareNumber);
};

// ==================== Crew Functions ====================

const getCrew = () => readDB(CREW_DB);

const updateCrew = (data) => writeDB(CREW_DB, data);

// Get team data for a specific group
const getTeam = (groupJid) => {
  const crew = getCrew();
  if (!crew.groups) crew.groups = {};
  if (!crew.groups[groupJid]) {
    crew.groups[groupJid] = { members: {}, events: {}, applicants: {} };
    writeDB(CREW_DB, crew);
  }
  return crew.groups[groupJid];
};

// Update team data for a specific group
const updateTeam = (groupJid, data) => {
  const crew = getCrew();
  if (!crew.groups) crew.groups = {};
  if (!crew.groups[groupJid]) {
    crew.groups[groupJid] = { members: {}, events: {}, applicants: {} };
  }
  crew.groups[groupJid] = { ...crew.groups[groupJid], ...data };
  return writeDB(CREW_DB, crew);
};

// Add member to a specific group's roster
const addCrewMember = (groupJid, memberJid, data) => {
  const team = getTeam(groupJid);
  if (!team.members) team.members = {};
  team.members[memberJid] = {
    role: data.role || 'member',
    joined: data.joined || Date.now(),
    addedBy: data.addedBy || '',
    ...data
  };
  return updateTeam(groupJid, team);
};

// Remove member from a specific group's roster
const removeCrewMember = (groupJid, memberJid) => {
  const team = getTeam(groupJid);
  if (!team.members || !team.members[memberJid]) return false;
  delete team.members[memberJid];
  return updateTeam(groupJid, team);
};

// Update fields on an existing crew member
const updateCrewMember = (groupJid, memberJid, data) => {
  const team = getTeam(groupJid);
  if (!team.members || !team.members[memberJid]) return false;
  Object.assign(team.members[memberJid], data);
  return updateTeam(groupJid, team);
};

// Get member from a specific group
const getCrewMember = (groupJid, memberJid) => {
  const team = getTeam(groupJid);
  return team.members?.[memberJid] || null;
};

// Get all members in a specific group
const getCrewMembers = (groupJid) => {
  const team = getTeam(groupJid);
  return team.members || {};
};

// Add event to a specific group
const addCrewEvent = (groupJid, eventId, data) => {
  const team = getTeam(groupJid);
  if (!team.events) team.events = {};
  team.events[eventId] = {
    name: data.name,
    time: data.time,
    createdBy: data.createdBy,
    attendees: [],
    results: null,
    created: Date.now()
  };
  return updateTeam(groupJid, team);
};

// Get events for a specific group
const getCrewEvents = (groupJid) => {
  const team = getTeam(groupJid);
  return team.events || {};
};

// Remove event from a specific group
const removeCrewEvent = (groupJid, eventId) => {
  const team = getTeam(groupJid);
  if (!team.events || !team.events[eventId]) return false;
  delete team.events[eventId];
  return updateTeam(groupJid, team);
};

// Add applicant to a specific group (keyed by short unique UID)
const addApplicant = (groupJid, applicantJid, data) => {
  const team = getTeam(groupJid);
  if (!team.applicants) team.applicants = {};
  const uid = data.appUid || generateAppUid();
  team.applicants[uid] = {
    jid: applicantJid,
    groupJid: groupJid,
    team: data.team,
    answers: data.answers,
    appliedAt: Date.now(),
    status: 'pending',
    appUid: uid
  };
  updateTeam(groupJid, team);
  return team.applicants[uid];
};

// Generate a short unique application ID (e.g. SS-4FK2X)
const generateAppUid = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 confusion
  let uid;
  do {
    uid = 'SS-' + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (getApplicantByUid(uid));
  return uid;
};

// Look up an application by UID across all teams
const getApplicantByUid = (uid) => {
  const crew = getCrew();
  const key = uid.toUpperCase();
  for (const [groupJid, team] of Object.entries(crew.groups || {})) {
    if (team.applicants && team.applicants[key]) return team.applicants[key];
  }
  return null;
};

// Get applicants for a specific group
const getApplicants = (groupJid) => {
  const team = getTeam(groupJid);
  return team.applicants || {};
};

// Remove applicant by key within a group
const removeApplicant = (groupJid, applicantKey) => {
  const team = getTeam(groupJid);
  if (!team.applicants || !team.applicants[applicantKey]) return false;
  delete team.applicants[applicantKey];
  return updateTeam(groupJid, team);
};

// Track a processed (accepted/denied) application so we can tell admins what happened
const trackProcessedApp = (groupJid, appUid, data) => {
  const team = getTeam(groupJid);
  if (!team.processedApps) team.processedApps = {};
  team.processedApps[appUid] = {
    action: data.action,       // 'accepted' or 'denied'
    admin: data.admin,         // JID of admin who processed it
    role: data.role || null,   // role assigned (accept only)
    reason: data.reason || null, // reason (deny only)
    processedAt: Date.now(),
    applicantJid: data.applicantJid,
    team: data.team,
  };
  return updateTeam(groupJid, team);
};

// Look up a processed application by UID across all groups
const getProcessedApp = (uid) => {
  const crew = getCrew();
  const key = uid.toUpperCase();
  for (const [groupJid, team] of Object.entries(crew.groups || {})) {
    if (team.processedApps && team.processedApps[key]) {
      return { ...team.processedApps[key], groupJid };
    }
  }
  return null;
};

// Remove pending applications older than maxAgeMs (default 7 days)
// Returns list of expired apps for notification
const expireOldPendingApps = (maxAgeMs = 7 * 24 * 60 * 60 * 1000) => {
  const crew = getCrew();
  const now = Date.now();
  const expired = [];
  for (const [groupJid, team] of Object.entries(crew.groups || {})) {
    if (!team.applicants) continue;
    for (const [uid, app] of Object.entries(team.applicants)) {
      if (app.status === 'pending' && (now - app.appliedAt) > maxAgeMs) {
        expired.push({ ...app, groupJid, appUid: uid });
        delete team.applicants[uid];
        // Track as expired-processed
        if (!team.processedApps) team.processedApps = {};
        team.processedApps[uid] = {
          action: 'expired',
          admin: 'system',
          processedAt: now,
          applicantJid: app.jid,
          team: app.team,
        };
      }
    }
  }
  if (expired.length > 0) writeDB(CREW_DB, crew);
  return expired;
};

// Does this user have any pending application anywhere?
// Used to exempt applicants from the DM blocker during the application window.
const hasPendingApplication = (jid) => {
  const crew = getCrew();
  if (!jid) return false;
  const inputVariants = buildComparableIds(jid);
  for (const team of Object.values(crew.groups || {})) {
    if (!team.applicants) continue;
    for (const app of Object.values(team.applicants)) {
      if (app.status === 'pending') {
        const appVariants = buildComparableIds(app.jid);
        if (appVariants.some(v => inputVariants.includes(v))) {
          return true;
        }
      }
    }
  }
  return false;
};

// Get all teams overview
const getAllTeams = () => {
  const crew = getCrew();
  return crew.groups || {};
};

// ==================== Team Mapping Functions ====================

// Set team abbreviation mapping: "SSRS" → group JID
const setTeamMap = (abbrev, groupJid, teamName) => {
  const crew = getCrew();
  if (!crew.teamMap) crew.teamMap = {};
  crew.teamMap[abbrev.toUpperCase()] = {
    jid: groupJid,
    name: teamName || abbrev.toUpperCase()
  };
  return writeDB(CREW_DB, crew);
};

// Remove team abbreviation mapping
const removeTeamMap = (abbrev) => {
  const crew = getCrew();
  if (!crew.teamMap || !crew.teamMap[abbrev.toUpperCase()]) return false;
  delete crew.teamMap[abbrev.toUpperCase()];
  return writeDB(CREW_DB, crew);
};

// Get team map (all abbreviations)
const getTeamMap = () => {
  const crew = getCrew();
  return crew.teamMap || {};
};

// Resolve abbreviation to group JID
const resolveTeam = (abbrev) => {
  const crew = getCrew();
  const upper = abbrev.toUpperCase();
  
  // Direct match
  if (crew.teamMap?.[upper]) {
    return { jid: crew.teamMap[upper].jid, name: crew.teamMap[upper].name };
  }
  
  // Case-insensitive search
  for (const [key, val] of Object.entries(crew.teamMap || {})) {
    if (key.toLowerCase() === abbrev.toLowerCase()) {
      return { jid: val.jid, name: val.name };
    }
  }
  
  return null;
};

// Resolve abbreviation to group JID — checks teamMap first, falls back to config.crewTeams
const resolveTeamWithConfig = (abbrev) => {
  const upper = abbrev.toUpperCase();
  
  // Try runtime teamMap first
  const fromMap = resolveTeam(upper);
  if (fromMap) return fromMap;
  
  // Fall back to hardcoded config.crewTeams
  try {
    const config = require('./config');
    if (config.crewTeams?.[upper]) {
      return { jid: config.crewTeams[upper].jid, name: config.crewTeams[upper].name };
    }
  } catch (e) {}
  
  return null;
};

// ==================== Pending Application Checks ====================

// Check if a specific team has pending applications
const hasPendingApplicationsForTeam = (groupJid) => {
  const team = getTeam(groupJid);
  if (!team.applicants) return false;
  return Object.values(team.applicants).some(a => a.status === 'pending');
};

// Track which teams each team admin belongs to (auto-populated on startup)
const addTeamAdminTeam = (adminNumber, teamKey) => {
  const settings = getGlobalSettings();
  if (!settings.teamAdminTeams) settings.teamAdminTeams = {};
  if (!settings.teamAdminTeams[adminNumber]) settings.teamAdminTeams[adminNumber] = [];
  if (!settings.teamAdminTeams[adminNumber].includes(teamKey)) {
    settings.teamAdminTeams[adminNumber].push(teamKey);
    return writeDB(GLOBAL_DB, settings);
  }
  return false;
};

const removeTeamAdminTeam = (adminNumber, teamKey) => {
  const settings = getGlobalSettings();
  if (!settings.teamAdminTeams?.[adminNumber]) return false;
  const before = settings.teamAdminTeams[adminNumber].length;
  settings.teamAdminTeams[adminNumber] = settings.teamAdminTeams[adminNumber].filter(t => t !== teamKey);
  if (settings.teamAdminTeams[adminNumber].length === 0) {
    delete settings.teamAdminTeams[adminNumber];
  }
  if (settings.teamAdminTeams[adminNumber]?.length < before) {
    return writeDB(GLOBAL_DB, settings);
  }
  return false;
};

// Check if any team this person admins has pending applications
const hasPendingApplicationsForAnyTeam = (adminJid) => {
  const settings = getGlobalSettings();
  const adminNumber = (adminJid || '').replace(/@.*$/, '');
  const teamAdminTeams = settings.teamAdminTeams || {};
  const teams = teamAdminTeams[adminNumber] || [];
  
  for (const teamKey of teams) {
    // Check both config.crewTeams and teamMap
    let teamJid = null;
    if (config.crewTeams?.[teamKey]?.jid) {
      teamJid = config.crewTeams[teamKey].jid;
    } else {
      const crew = getCrew();
      if (crew.teamMap?.[teamKey]?.jid) {
        teamJid = crew.teamMap[teamKey].jid;
      }
    }
    if (teamJid && hasPendingApplicationsForTeam(teamJid)) {
      return true;
    }
  }
  
  // Fallback: if no team mapping exists, check ALL teams
  // (handles edge case where mapping wasn't populated yet)
  if (teams.length === 0) {
    try {
      for (const [key, info] of Object.entries(config.crewTeams || {})) {
        if (hasPendingApplicationsForTeam(info.jid)) return true;
      }
    } catch (e) {}
    const crew = getCrew();
    for (const [groupJid, teamData] of Object.entries(crew.groups || {})) {
      if (hasPendingApplicationsForTeam(groupJid)) return true;
    }
  }
  
  return false;
};

// ==================== Auto-Unblock Tracking ====================

// Track team admins who were auto-unblocked due to pending applications
const getAutoUnblockedTeamAdmins = () => {
  const settings = getGlobalSettings();
  return settings.autoUnblockedTeamAdmins || [];
};

const addAutoUnblockedTeamAdmin = (jid) => {
  const settings = getGlobalSettings();
  if (!settings.autoUnblockedTeamAdmins) settings.autoUnblockedTeamAdmins = [];
  const number = (jid || '').replace(/@.*$/, '');
  if (!settings.autoUnblockedTeamAdmins.includes(number)) {
    settings.autoUnblockedTeamAdmins.push(number);
    return writeDB(GLOBAL_DB, settings);
  }
  return false;
};

const removeAutoUnblockedTeamAdmin = (jid) => {
  const settings = getGlobalSettings();
  if (!settings.autoUnblockedTeamAdmins) return false;
  const number = (jid || '').replace(/@.*$/, '');
  const before = settings.autoUnblockedTeamAdmins.length;
  settings.autoUnblockedTeamAdmins = settings.autoUnblockedTeamAdmins.filter(n => n !== number);
  if (settings.autoUnblockedTeamAdmins.length < before) {
    return writeDB(GLOBAL_DB, settings);
  }
  return false;
};

const isAutoUnblockedTeamAdmin = (jid) => {
  const autoUnblocked = getAutoUnblockedTeamAdmins();
  const number = (jid || '').replace(/@.*$/, '');
  return autoUnblocked.includes(number);
};

// ==================== Auto-Detect Team Admins ====================

// Auto-detect team admins from WhatsApp group metadata
// Called on startup and when group metadata changes
const syncTeamAdminsFromGroup = (groupJid, participants) => {
  if (!participants || !Array.isArray(participants)) return [];
  
  const added = [];
  for (const p of participants) {
    const jid = p.id || p.jid;
    if (!jid) continue;
    if (p.admin === 'admin' || p.admin === 'superadmin') {
      const number = jid.replace(/@.*$/, '');
      const result = addTeamAdmin(number);
      if (result) added.push(number);
    }
  }
  return added;
};

// Prune teamAdmins — remove anyone who is no longer a WhatsApp admin in ANY crew group
const pruneTeamAdmins = (currentAdminsByGroup) => {
  const settings = getGlobalSettings();
  if (!settings.teamAdmins) return 0;
  
  // Build set of all current WhatsApp admins across all crew groups
  const allCurrentAdmins = new Set();
  for (const admins of Object.values(currentAdminsByGroup)) {
    for (const adminJid of admins) {
      const number = adminJid.replace(/@.*$/, '');
      allCurrentAdmins.add(number);
    }
  }
  
  // Also always keep owner numbers
  const ownerNumbers = (config.ownerNumber || []).map(n => n.replace(/[\+\-\s]/g, ''));
  for (const num of ownerNumbers) {
    allCurrentAdmins.add(num);
  }
  
  const before = settings.teamAdmins.length;
  settings.teamAdmins = settings.teamAdmins.filter(n => allCurrentAdmins.has(n));
  if (settings.teamAdmins.length < before) {
    writeDB(GLOBAL_DB, settings);
    return before - settings.teamAdmins.length;
  }
  return 0;
};

// Get custom roles for a group (ordered by hierarchy)
const getCustomRoles = (groupJid) => {
  // 1. Check config.crewTeams for team-specific ranks (keyed by teamKey)
  const configTeams = require('./config').crewTeams || {};
  for (const [key, info] of Object.entries(configTeams)) {
    if (info.jid === groupJid && info.ranks && info.ranks.length > 0) {
      return info.ranks;
    }
  }

  // 2. Fall back to teamMap roles
  const team = getTeam(groupJid);
  if (team.roles && team.roles.length > 0) {
    return team.roles;
  }

  // 3. Default fallback
  return ['member', 'officer', 'co-leader', 'leader'];
};

// Set custom roles for a group
const setCustomRoles = (groupJid, roles) => {
  const team = getTeam(groupJid);
  team.roles = roles;
  return updateTeam(groupJid, team);
};

// ── Owner-Promoted Admin Protection ──────────────────────────
// Structure: { "groupJid": { "adminJid": { promotedBy, demoteAttempts, date } } }

const getOwnerPromotedAdmins = (groupJid) => {
  const data = readDB(OWNER_PROMOTED_DB);
  return data[groupJid] || {};
};

const addOwnerPromotedAdmin = (groupJid, adminJid, ownerJid) => {
  const data = readDB(OWNER_PROMOTED_DB);
  if (!data[groupJid]) data[groupJid] = {};
  data[groupJid][adminJid] = {
    promotedBy: ownerJid,
    demoteAttempts: 0,
    date: Date.now(),
  };
  return writeDB(OWNER_PROMOTED_DB, data);
};

const isOwnerPromotedAdmin = (groupJid, adminJid) => {
  const data = readDB(OWNER_PROMOTED_DB);
  const group = data[groupJid];
  if (!group) return false;
  const num = _normalizeJid(adminJid);
  return Object.keys(group).some(k => _normalizeJid(k) === num);
};

const getOwnerPromotedAdmin = (groupJid, adminJid) => {
  const data = readDB(OWNER_PROMOTED_DB);
  const group = data[groupJid];
  if (!group) return null;
  const num = _normalizeJid(adminJid);
  for (const [key, val] of Object.entries(group)) {
    if (_normalizeJid(key) === num) return val;
  }
  return null;
};

const incrementDemoteAttempts = (groupJid, adminJid) => {
  const data = readDB(OWNER_PROMOTED_DB);
  const group = data[groupJid];
  if (!group) return 0;
  const num = _normalizeJid(adminJid);
  for (const [key, val] of Object.entries(group)) {
    if (_normalizeJid(key) === num) {
      val.demoteAttempts = (val.demoteAttempts || 0) + 1;
      writeDB(OWNER_PROMOTED_DB, data);
      return val.demoteAttempts;
    }
  }
  return 0;
};

const removeOwnerPromotedAdmin = (groupJid, adminJid) => {
  const data = readDB(OWNER_PROMOTED_DB);
  if (data[groupJid]) {
    const num = _normalizeJid(adminJid);
    for (const key of Object.keys(data[groupJid])) {
      if (_normalizeJid(key) === num) {
        delete data[groupJid][key];
      }
    }
    if (Object.keys(data[groupJid]).length === 0) {
      delete data[groupJid];
    }
    writeDB(OWNER_PROMOTED_DB, data);
  }
};

// ── Owner-Added Member Protection ───────────────────────────
// Tracks anyone added by the owner (via .crew accept, .crew add, .promote)
// Structure: { "groupJid": { "memberJid": { addedBy, date } } }

// Normalize JID to phone number for comparison (handles 12345:12@, 12345@, 12345@lid)
const _normalizeJid = (jid) => {
  if (!jid) return '';
  return jid.split(':')[0].split('@')[0].replace(/\D/g, '');
};

const isOwnerAddedMember = (groupJid, memberJid) => {
  const data = readDB(OWNER_ADDED_DB);
  const group = data[groupJid];
  if (!group) return false;
  const num = _normalizeJid(memberJid);
  return Object.keys(group).some(k => _normalizeJid(k) === num);
};

const addOwnerAddedMember = (groupJid, memberJid, ownerJid) => {
  const data = readDB(OWNER_ADDED_DB);
  if (!data[groupJid]) data[groupJid] = {};
  data[groupJid][memberJid] = {
    addedBy: ownerJid,
    date: Date.now(),
  };
  return writeDB(OWNER_ADDED_DB, data);
};

const removeOwnerAddedMember = (groupJid, memberJid) => {
  const data = readDB(OWNER_ADDED_DB);
  if (data[groupJid]) {
    const num = _normalizeJid(memberJid);
    for (const key of Object.keys(data[groupJid])) {
      if (_normalizeJid(key) === num) {
        delete data[groupJid][key];
      }
    }
    if (Object.keys(data[groupJid]).length === 0) {
      delete data[groupJid];
    }
    writeDB(OWNER_ADDED_DB, data);
  }
};

// ── Combined protection check ───────────────────────────────
const isOwnerProtected = (groupJid, memberJid) => {
  return isOwnerPromotedAdmin(groupJid, memberJid) || isOwnerAddedMember(groupJid, memberJid);
};

// ── Audit Log ─────────────────────────────────────────────────
// Tracks every command execution, protection event, and admin action.
// Structure: { entries: [...], capped at 500 most recent }

const AUDIT_MAX = 500;

const _readAudit = () => {
  try {
    return JSON.parse(fs.readFileSync(AUDIT_DB, 'utf8'));
  } catch {
    return { entries: [] };
  }
};

const _writeAudit = (data) => {
  // Keep only the last AUDIT_MAX entries
  if (data.entries.length > AUDIT_MAX) {
    data.entries = data.entries.slice(-AUDIT_MAX);
  }
  return writeDB(AUDIT_DB, data);
};

// Log a command execution
const logCommand = (data) => {
  const audit = _readAudit();
  audit.entries.push({
    type: 'command',
    command: data.command,
    args: data.args || '',
    user: data.user,
    userName: data.userName || null,
    group: data.group || null,
    isOwner: data.isOwner || false,
    isAdmin: data.isAdmin || false,
    success: data.success !== false,
    error: data.error || null,
    timestamp: Date.now(),
  });
  return _writeAudit(audit);
};

// Log a protection event (kick/demote attempt on protected member)
const logProtection = (data) => {
  const audit = _readAudit();
  audit.entries.push({
    type: 'protection',
    action: data.action,        // 'kick' or 'demote'
    target: data.target,        // JID of protected member
    targetName: data.targetName || null,
    triggeredBy: data.triggeredBy, // JID of who tried it
    triggerName: data.triggerName || null,
    group: data.group,
    result: data.result,        // 're-added', 're-promoted', 'blocked'
    timestamp: Date.now(),
  });
  return _writeAudit(audit);
};

// Log an admin action (accept/deny/cancel/reroll)
const logAdminAction = (data) => {
  const audit = _readAudit();
  audit.entries.push({
    type: 'admin_action',
    action: data.action,        // 'accepted', 'denied', 'cancelled', 'rerolled', 'expired'
    appUid: data.appUid,
    team: data.team,
    admin: data.admin,
    adminName: data.adminName || null,
    applicant: data.applicant || null,
    applicantName: data.applicantName || null,
    reason: data.reason || null,
    role: data.role || null,
    timestamp: Date.now(),
  });
  return _writeAudit(audit);
};

// Get audit entries with optional filters
const getAuditLog = (filters = {}) => {
  const audit = _readAudit();
  let entries = audit.entries || [];

  if (filters.type) entries = entries.filter(e => e.type === filters.type);
  if (filters.user) entries = entries.filter(e => e.user === filters.user || e.admin === filters.user);
  if (filters.command) entries = entries.filter(e => e.command === filters.command);
  if (filters.since) entries = entries.filter(e => e.timestamp >= filters.since);
  if (filters.limit) entries = entries.slice(-filters.limit);

  return entries;
};

// Get a summary of admin activity
const getAdminActivity = (days = 7) => {
  const since = Date.now() - (days * 24 * 60 * 60 * 1000);
  const entries = getAuditLog({ since });
  const activity = {};

  for (const entry of entries) {
    const admin = entry.admin || entry.user;
    if (!admin) continue;
    if (!activity[admin]) {
      activity[admin] = { accepted: 0, denied: 0, cancelled: 0, rerolled: 0, commands: 0 };
    }
    if (entry.type === 'admin_action') {
      if (entry.action === 'accepted') activity[admin].accepted++;
      else if (entry.action === 'denied') activity[admin].denied++;
      else if (entry.action === 'cancelled') activity[admin].cancelled++;
      else if (entry.action === 'rerolled') activity[admin].rerolled++;
    }
    if (entry.type === 'command') activity[admin].commands++;
  }

  return activity;
};

// ── Prefix Persistence ────────────────────────────────────
// Saves prefix to database so it survives git reset on deploy

const getPrefix = () => {
  const settings = readDB(GLOBAL_DB);
  return settings.prefix || null; // null = use config.js default
};

const setPrefix = (newPrefix) => {
  const settings = readDB(GLOBAL_DB);
  settings.prefix = newPrefix;
  writeDB(GLOBAL_DB, settings);
  return true;
};

// ── Member Lifecycle ──────────────────────────────────────

// Get activity stats for a member in a group
const getMemberActivity = (groupJid, memberJid) => {
  const statsPath = path.join(DB_PATH, 'groupStats.json');
  let stats;
  try {
    stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  } catch {
    return { totalMessages: 0, daysActive: 0, lastActive: null, avgPerDay: 0 };
  }

  const groupStats = stats[groupJid];
  if (!groupStats) return { totalMessages: 0, daysActive: 0, lastActive: null, avgPerDay: 0 };

  let totalMessages = 0;
  let daysActive = 0;
  let lastActive = null;

  for (const [date, dayData] of Object.entries(groupStats)) {
    if (dayData.users && dayData.users[memberJid]) {
      const count = dayData.users[memberJid];
      totalMessages += count;
      daysActive++;
      const dateTs = new Date(date).getTime();
      if (!lastActive || dateTs > lastActive) {
        lastActive = dateTs;
      }
    }
  }

  const avgPerDay = daysActive > 0 ? (totalMessages / daysActive).toFixed(1) : 0;

  return { totalMessages, daysActive, lastActive, avgPerDay: Number(avgPerDay) };
};

// Get all members with their activity stats for a group
const getGroupMemberActivity = (groupJid) => {
  const team = getTeam(groupJid);
  const members = team.members || {};
  const result = {};

  for (const [memberJid, memberData] of Object.entries(members)) {
    const activity = getMemberActivity(groupJid, memberJid);
    result[memberJid] = {
      ...memberData,
      ...activity,
      inactive: activity.lastActive
        ? (Date.now() - activity.lastActive) > (30 * 24 * 60 * 60 * 1000) // 30 days
        : true,
    };
  }

  return result;
};

// Get inactive members (no messages in X days)
const getInactiveMembers = (groupJid, days = 30) => {
  const all = getGroupMemberActivity(groupJid);
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const inactive = {};

  for (const [jid, data] of Object.entries(all)) {
    if (!data.lastActive || data.lastActive < cutoff) {
      inactive[jid] = data;
    }
  }

  return inactive;
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
  isApprovedNumber,
  getTeamAdmins,
  addTeamAdmin,
  removeTeamAdmin,
  isTeamAdmin,

  // Crew functions
  getCrew,
  updateCrew,
  getTeam,
  updateTeam,
  addCrewMember,
  removeCrewMember,
  updateCrewMember,
  getCrewMember,
  getCrewMembers,
  addCrewEvent,
  getCrewEvents,
  removeCrewEvent,
  addApplicant,
    getApplicants,
    removeApplicant,
    trackProcessedApp,
    getProcessedApp,
    expireOldPendingApps,
    hasPendingApplication,
    getAllTeams,
    generateAppUid,
    getApplicantByUid,

  // Custom roles
  getCustomRoles,
  setCustomRoles,

  // Team mapping
  setTeamMap,
  removeTeamMap,
  getTeamMap,
  resolveTeam,
  resolveTeamWithConfig,

  // Pending application checks
  hasPendingApplicationsForTeam,
  hasPendingApplicationsForAnyTeam,
  addTeamAdminTeam,
  removeTeamAdminTeam,

  // Auto-unblock tracking
  getAutoUnblockedTeamAdmins,
  addAutoUnblockedTeamAdmin,
  removeAutoUnblockedTeamAdmin,
  isAutoUnblockedTeamAdmin,

  // Auto-detect team admins
  syncTeamAdminsFromGroup,
  pruneTeamAdmins,

  // Owner-promoted admin protection
  getOwnerPromotedAdmins,
  addOwnerPromotedAdmin,
  isOwnerPromotedAdmin,
  getOwnerPromotedAdmin,
  incrementDemoteAttempts,
  removeOwnerPromotedAdmin,

  // Owner-added member protection
  isOwnerAddedMember,
  addOwnerAddedMember,
  removeOwnerAddedMember,
  isOwnerProtected,

  // Audit log
  logCommand,
  logProtection,
  logAdminAction,
  getAuditLog,
  getAdminActivity,

  // Prefix persistence
  getPrefix,
  setPrefix,

  // Member lifecycle
  getMemberActivity,
  getGroupMemberActivity,
  getInactiveMembers,

  // Cache management
  flushAll,
  reloadDB,
};
