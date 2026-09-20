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
  resolveTeam
};
