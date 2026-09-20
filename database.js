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
  const number = (jid || '').replace(/@.*$/, '');
  const raw = (jid || '').replace(/@.*$/, '');
  const ownerNumbers = (config.ownerNumber || []).map(n => n.replace(/[\+\-\s]/g, ''));
  if (ownerNumbers.includes(number) || ownerNumbers.includes(raw)) return true;
  const admins = getTeamAdmins();
  return admins.includes(number) || admins.includes(raw);
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
  const team = getTeam(groupJid);
  if (!team.roles || team.roles.length === 0) {
    // Default roles if none configured
    return ['member', 'officer', 'co-leader', 'leader'];
  }
  return team.roles;
};

// Set custom roles for a group
const setCustomRoles = (groupJid, roles) => {
  const team = getTeam(groupJid);
  team.roles = roles;
  return updateTeam(groupJid, team);
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
  getCrewMember,
  getCrewMembers,
  addCrewEvent,
  getCrewEvents,
  removeCrewEvent,
  addApplicant,
    getApplicants,
    removeApplicant,
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
  pruneTeamAdmins
};
