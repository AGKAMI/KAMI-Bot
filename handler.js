/**
 * Message Handler - Processes incoming messages and executes commands
 */

const config = require('./config');
const database = require('./database');
const { loadCommands } = require('./utils/commandLoader');
const { addMessage } = require('./utils/groupstats');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { bold, italic, mention, pick, line, greet, lekker, closer, SLANG } = require('./utils/format');
const { buildImage } = require('./utils/imageText');

// Slowmode enforcement (in-memory cooldown tracking)
let slowmodeModule;
try {
  slowmodeModule = require('./commands/admin/slowmode');
} catch (e) { /* slowmode not available */ }

// AFK module
let afkModule;
try {
  afkModule = require('./commands/general/afk');
} catch (e) { /* afk not available */ }

// Antiflood tracking (in-memory)
const floodTracker = new Map(); // key: `group:sender` -> { count, firstMsgTime }

// Group metadata cache to prevent rate limiting
const groupMetadataCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

// Load all commands
const commands = loadCommands();

// Unwrap WhatsApp containers (ephemeral, view once, etc.)
const getMessageContent = (msg) => {
  if (!msg || !msg.message) return null;
  
  let m = msg.message;
  
  // Common wrappers in modern WhatsApp
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  
  // You can add more wrappers if needed later
  return m;
};

// Cached group metadata getter with rate limit handling (for non-admin checks)
const getCachedGroupMetadata = async (sock, groupId) => {
  try {
    // Validate group JID before attempting to fetch
    if (!groupId || !groupId.endsWith('@g.us')) {
      return null;
    }
    
    // Check cache first
    const cached = groupMetadataCache.get(groupId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data; // Return cached data (even if null for forbidden groups)
    }
    
    // Fetch from API
    const metadata = await sock.groupMetadata(groupId);
    
    // Cache it
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    // Handle forbidden (403) errors - cache null to prevent retry storms
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      // Cache null for forbidden groups to prevent repeated attempts
      groupMetadataCache.set(groupId, {
        data: null,
        timestamp: Date.now()
      });
      return null; // Silently return null for forbidden groups
    }
    
    // Handle rate limit errors
    if (error.message && error.message.includes('rate-overlimit')) {
      const cached = groupMetadataCache.get(groupId);
      if (cached) {
        return cached.data;
      }
      return null;
    }
    
    // For other errors, try cached data as fallback
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    
    // Return null instead of throwing to prevent crashes
    return null;
  }
};

// Live group metadata getter (always fresh, no cache) - for admin checks
const getLiveGroupMetadata = async (sock, groupId) => {
  try {
    // Always fetch fresh metadata, bypass cache
    const metadata = await sock.groupMetadata(groupId);
    
    // Update cache for other features (antilink, welcome, etc.)
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    // On error, try cached data as fallback
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    return null;
  }
};

// Alias for backward compatibility (non-admin features use cached)
const getGroupMetadata = getCachedGroupMetadata;

// Resolve a JID to a human-readable name from group metadata
const resolveName = (groupMetadata, jid) => {
  if (!groupMetadata || !groupMetadata.participants || !jid) return null;
  const num = jid.split(':')[0].split('@')[0].replace(/\D/g, '');
  for (const p of groupMetadata.participants) {
    const pNum = p.id.split(':')[0].split('@')[0].replace(/\D/g, '');
    if (pNum === num) return p.name || null;
  }
  return null;
};

// Helper functions
const isOwner = (sender) => {
  if (!sender) return false;
  
  // Extract raw number from sender (handle LID, PN, etc)
  let senderNumber = sender.split('@')[0];
  if (senderNumber.includes(':')) {
    senderNumber = senderNumber.split(':')[0];
  }
  
  // Also try normalized version
  const normalizedSender = normalizeJidWithLid(sender);
  const normalizedSenderNumber = normalizeJid(normalizedSender);
  
  // Check against owner numbers
  const isOwnerResult = config.ownerNumber.some(owner => {
    const ownerNum = owner.replace(/\D/g, ''); // Remove any non-digits
    const senderNum = senderNumber.replace(/\D/g, '');
    const normalizedSenderNum = normalizedSenderNumber ? normalizedSenderNumber.replace(/\D/g, '') : '';
    
    // Check direct match, normalized match, or raw number match
    return owner === senderNumber || 
           owner === normalizedSenderNumber ||
           ownerNum === senderNum ||
           ownerNum === normalizedSenderNum;
  });
  
  if (isOwnerResult) {
    console.log(`Owner verified: ${senderNumber} matched`);
  }
  
  return isOwnerResult;
};

const isMod = (sender) => {
  const number = sender.split('@')[0];
  return database.isModerator(number);
};

// LID mapping cache
const lidMappingCache = new Map();

// Track bot-initiated demotes to skip protection handler
const _botDemoted = new Set();

// Track bot-initiated kicks to skip protection handler
const _botKicked = new Set();

// Helper to normalize JID to just the number part
const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  
  // Remove device ID if present (e.g., "1234567890:0@s.whatsapp.net" -> "1234567890")
  if (jid.includes(':')) {
    return jid.split(':')[0];
  }
  // Remove domain if present (e.g., "1234567890@s.whatsapp.net" -> "1234567890")
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
};

// Get LID mapping value from session files
const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    return lidMappingCache.get(cacheKey);
  }
  
  const sessionPath = path.join(__dirname, config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  
  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
  
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch (error) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

// Normalize JID handling LID conversion
const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    }
    
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    
    if (server === 'hosted') {
      return jidEncode(user, 'hosted');
    }
    return jidEncode(user, 's.whatsapp.net');
  } catch (error) {
    return jid;
  }
};

// Build comparable JID variants (PN + LID) for matching
const buildComparableIds = (jid) => {
  if (!jid) return [];
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return [normalizeJidWithLid(jid)].filter(Boolean);
    }
    
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    variants.add(jidEncode(decoded.user, normalizedServer));
    
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) {
        const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
        variants.add(jidEncode(lidUser, lidServer));
      }
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) {
        const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        variants.add(jidEncode(pnUser, pnServer));
      }
    }
    
    return Array.from(variants);
  } catch (error) {
    return [jid];
  }
};

// Find participant by either PN JID or LID JID
const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  
  if (!targets.length) return null;
  
  return participants.find(participant => {
    if (!participant) return false;
    
    const participantIds = [
      participant.id,
      participant.lid,
      participant.userJid
    ]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

const isAdmin = async (sock, participant, groupId, groupMetadata = null) => {
  if (!participant) return false;
  
  // Early return for non-group JIDs (DMs) - prevents slow sock.groupMetadata() call
  if (!groupId || !groupId.endsWith('@g.us')) {
    return false;
  }
  
  // Always fetch live metadata for admin checks
  let liveMetadata = groupMetadata;
  if (!liveMetadata || !liveMetadata.participants) {
    if (groupId) {
      liveMetadata = await getLiveGroupMetadata(sock, groupId);
    } else {
      return false;
    }
  }
  
  if (!liveMetadata || !liveMetadata.participants) return false;
  
  // Use findParticipant to handle LID matching
  const foundParticipant = findParticipant(liveMetadata.participants, participant);
  if (!foundParticipant) return false;
  
  return foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin';
};

const isBotAdmin = async (sock, groupId, groupMetadata = null) => {
  if (!sock.user || !groupId) return false;
  
  // Early return for non-group JIDs (DMs) - prevents slow sock.groupMetadata() call
  if (!groupId.endsWith('@g.us')) {
    return false;
  }
  
  try {
    // Get bot's JID - Baileys stores it in sock.user.id
    const botId = sock.user.id;
    const botLid = sock.user.lid;
    
    if (!botId) return false;
    
    // Prepare bot JIDs to check - findParticipant will normalize them via buildComparableIds
    const botJids = [botId];
    if (botLid) {
      botJids.push(botLid);
    }
    
    // ALWAYS fetch live metadata for bot admin checks (never use cached)
    const liveMetadata = await getLiveGroupMetadata(sock, groupId);
    
    if (!liveMetadata || !liveMetadata.participants) return false;
    
    const participant = findParticipant(liveMetadata.participants, botJids);
    if (!participant) return false;
    
    return participant.admin === 'admin' || participant.admin === 'superadmin';
  } catch (error) {
    return false;
  }
};

const isUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return urlRegex.test(text);
};

// Format raw number to +country code format (e.g. +27 83 388 2383)
// Normalize text for bad-word matching: lowercase, leetspeak → letters,
// collapse repeated chars (fuckkk → fuck), strip separators (f u c k → fuck).
const normalizeBadword = (text) => {
  if (!text) return '';
  let t = text.toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/2/g, 'z')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/6/g, 'g')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/[\s.\-_*,|\\/]+/g, '');
  // Collapse runs of the same char so fffuuuck → fuck
  t = t.replace(/(.)\1+/g, '$1');
  return t;
};

const formatPhone = (raw) => {
  if (!raw) return '';
  // Reject @lid JIDs — not real phone numbers
  if (raw.includes('@lid')) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return '+' + digits;
  let ccLen = 1;
  if (digits.length >= 11) ccLen = 2;
  if (digits.length >= 12) ccLen = 3;
  const cc = digits.slice(0, ccLen);
  const local = digits.slice(ccLen);
  return `+${cc} ${local}`;
};

// Resolve display name: WhatsApp username > contact name > formatted phone
const resolveDisplayName = (participantJid, participantNumber, participantInfo, sock) => {
  // 1. Try contact store name
  if (sock.store?.contacts?.[participantJid]) {
    const c = sock.store.contacts[participantJid];
    const name = c.notify || c.name;
    if (name && name.trim() && !name.match(/^\d+$/)) return name.trim();
  }
  // 2. Try participantInfo notify/name
  if (participantInfo) {
    if (participantInfo.notify?.trim() && !participantInfo.notify.match(/^\d+$/)) return participantInfo.notify.trim();
    if (participantInfo.name?.trim() && !participantInfo.name.match(/^\d+$/)) return participantInfo.name.trim();
  }
  // 3. If @lid JID, try resolving via getBusinessInfo or contacts
  if (participantJid?.includes('@lid')) {
    // Try all contacts for a match
    if (sock.store?.contacts) {
      for (const [jid, c] of Object.entries(sock.store.contacts)) {
        if (c.lid === participantJid || c.lid === participantNumber) {
          const name = c.notify || c.name;
          if (name && name.trim() && !name.match(/^\d+$/)) return name.trim();
        }
      }
    }
    return 'A member'; // Can't resolve @lid to a name
  }
  // 4. Fall back to formatted phone number
  return formatPhone(participantNumber);
};

const hasGroupLink = (text) => {
  const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i;
  return linkRegex.test(text);
};

// System JID filter - checks if JID is from broadcast/status/newsletter
const isSystemJid = (jid) => {
  if (!jid) return true;
  return jid.includes('@broadcast') || 
         jid.includes('status.broadcast') || 
         jid.includes('@newsletter') ||
         jid.includes('@newsletter.');
};

// Main message handler
const handleMessage = async (sock, msg) => {
  try {
    // Debug logging to see all messages
    // Debug log removed
    
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    
        // System message filter - ignore broadcast/status/newsletter messages
        if (isSystemJid(from)) {
          return; // Silently ignore system messages
        }

        // Interactive button responses — route to registered button handlers
        // BEFORE the DM blocker / prefix gate so button presses always work.
        try {
          const { handleButtonResponse } = require('./utils/buttonHelper');
          if (handleButtonResponse(sock, msg)) return;
        } catch (btnErr) {
          if (!btnErr.message?.includes('Cannot find module')) {
            console.error('[BUTTON] route error:', btnErr.message);
          }
        }

        // 🔒 DM BLOCKER (EARLY - fires on ANY message, command or not, before prefix gate)
        // When selfMode is ON, block DMs from anyone who isn't owner or approved.
        // Team admins: blocked if no pending applications for their teams.
        // Applicants: allowed if they have a pending application.
        if (!from.endsWith('@g.us')) {
          try {
            const dmGlobal = database.getGlobalSettings();
            const dmSender = msg.key.fromMe ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : (msg.key.participant || msg.key.remoteJid);
            if (dmGlobal.selfMode && !msg.key.fromMe && !isOwner(dmSender) && !database.isApprovedNumber(dmSender)) {
              const dmText =
                (msg.message?.conversation) ||
                (msg.message?.extendedTextMessage?.text) ||
                (msg.message?.imageMessage?.caption) ||
                (msg.message?.videoMessage?.caption) ||
                '';
              const dmBody = (dmText || '').trim().toLowerCase();
              const isApplyCmd = dmBody.startsWith('.crew apply') || dmBody.startsWith('.crew applied');

              // Team admin check — allowed only if they have pending applications for their teams
              if (database.isTeamAdmin(dmSender)) {
                if (database.hasPendingApplicationsForAnyTeam(dmSender)) {
                  // Team admin with pending apps — let through (accept/deny restriction at command level)
                } else {
                  // Team admin with NO pending apps — block them
                  try {
                    await sock.sendMessage(from, {
                      text: `🚫 *NO PENDING APPLICATIONS*\n\n` +
                            `There are no pending applications for your teams.\n` +
                            `You'll be unblocked when an application arrives.\n\n` +
                            `⚠️ *Your number will be BLOCKED after this message* ⛔🔒`
                    });
                  } catch (warnErr) {
                    console.error('[DMBLOCKER] admin warning send failed:', warnErr.message);
                  }
                  try {
                    await sock.updateBlockStatus(dmSender, 'block');
                  } catch (blockErr) {
                    console.error('[DMBLOCKER] admin block failed:', blockErr.message);
                  }
                  return;
                }
              }
              // Applicant check — allowed if they have a pending application
              else if (database.hasPendingApplication(dmSender) || isApplyCmd) {
                // Applicant with pending app or starting application — let through
              }
              // Regular user — block
              else {
                try {
                  await sock.sendMessage(from, {
                    text: `🚫 *DO NOT TEXT THIS NUMBER* — this is a *bot* account 🤖\n` +
                          `📲 *Message me on:* 084 082 0712\n` +
                          `⚠️ *Your number will be BLOCKED after this message* ⛔🔒`
                  });
                } catch (warnErr) {
                  console.error('[DMBLOCKER] warning send failed:', warnErr.message);
                }
                try {
                  await sock.updateBlockStatus(dmSender, 'block');
                } catch (blockErr) {
                  console.error('[DMBLOCKER] block failed:', blockErr.message);
                }
                return;
              }
            }
          } catch (dmErr) {
            console.error('[DMBLOCKER] early check error:', dmErr.message);
          }
        }
    
        // Auto-React System
    try {
      // Clear cache to get fresh config values
      delete require.cache[require.resolve('./config')];
      const config = require('./config');

      if (config.autoReact && msg.message && !msg.key.fromMe) {
        const content = msg.message.ephemeralMessage?.message || msg.message;
        const text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          '';

        const jid = msg.key.remoteJid;
        const emojis = ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'];
        
        const mode = config.autoReactMode || 'bot';

        if (mode === 'bot') {
          const prefixList = ['.', '/', '#'];
          if (prefixList.includes(text?.trim()[0])) {
            await sock.sendMessage(jid, {
              react: { text: '⏳', key: msg.key }
            });
          }
        }

        if (mode === 'all') {
          const rand = emojis[Math.floor(Math.random() * emojis.length)];
          await sock.sendMessage(jid, {
            react: { text: rand, key: msg.key }
          });
        }
      }
    } catch (e) {
      console.error('[AutoReact Error]', e.message);
    }
    
    // Unwrap containers first
    const content = getMessageContent(msg);
    // Note: We don't return early if content is null because forwarded status messages might not have content
    
    // Still check for actual message content for regular processing
    let actualMessageTypes = [];
    if (content) {
      const allKeys = Object.keys(content);
      // Filter out protocol/system messages and find actual message content
      const protocolMessages = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
      actualMessageTypes = allKeys.filter(key => !protocolMessages.includes(key));
    }
    
    // We'll check for empty content later after we've processed group messages
    
    // Use the first actual message type (conversation, extendedTextMessage, etc.)
    const messageType = actualMessageTypes[0];
    
    // from already defined above in DM block check
    const sender = msg.key.fromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us'); // Should always be true now due to DM block above
    
    // Fetch group metadata immediately if it's a group
    const groupMetadata = isGroup ? await getGroupMetadata(sock, from) : null;
    
    // Anti-group mention protection (check BEFORE prefix check, as these are non-command messages)
    if (isGroup) {
      // Debug logging to confirm we're trying to call the handler
      const groupSettings = database.getGroupSettings(from);
      // Debug log removed
      if (groupSettings.antigroupmention) {
        // Debug log removed
      }
      try {
        await handleAntigroupmention(sock, msg, groupMetadata);
      } catch (error) {
        console.error('Error in antigroupmention handler:', error);
      }
    }
    
    // Track group message statistics
    if (isGroup) {
      addMessage(from, sender);
    }
    
    // Return early for non-group messages with no recognizable content
    if (!content || actualMessageTypes.length === 0) return;
    
    // 🔹 Button response should also check unwrapped content
    const btn = content.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
    if (btn) {
      const buttonId = btn.selectedButtonId;
      const displayText = btn.selectedDisplayText;
      
      // Handle button clicks by routing to commands
      if (buttonId === 'btn_menu') {
        // Execute menu command
        const menuCmd = commands.get('menu');
        if (menuCmd) {
          await menuCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_ping') {
        // Execute ping command
        const pingCmd = commands.get('ping');
        if (pingCmd) {
          await pingCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_help') {
        // Execute list command again (help)
        const listCmd = commands.get('list');
        if (listCmd) {
          await listCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      }
    }
    
    // Get message body from unwrapped content
    let body = '';
    if (content.conversation) {
      body = content.conversation;
    } else if (content.extendedTextMessage) {
      body = content.extendedTextMessage.text || '';
    } else if (content.imageMessage) {
      body = content.imageMessage.caption || '';
    } else if (content.videoMessage) {
      body = content.videoMessage.caption || '';
    } else if (content.listResponseMessage) {
      // Handle list menu responses - the rowId is the command to execute
      const listResponse = content.listResponseMessage;
      body = listResponse.singleSelectReply?.selectedRowId || '';
      console.log('[LIST] Response:', body);
    }
    
    body = (body || '').trim();
    
    // Check antiall protection (owner only feature)
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.antiall) {
        const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
        const senderIsOwner = isOwner(sender);
        
        if (!senderIsAdmin && !senderIsOwner) {
          const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
          if (botIsAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
          }
        }
      }
      
      // Anti-tag protection (check BEFORE text check, as tagall can have no text)
      if (groupSettings.antitag && !msg.key.fromMe) {
        const ctx = content.extendedTextMessage?.contextInfo;
        const mentionedJids = ctx?.mentionedJid || [];
        
        const messageText = (
          body ||
          content.imageMessage?.caption ||
          content.videoMessage?.caption ||
          ''
        );
        
        const textMentions = messageText.match(/@[\d+\s\-()~.]+/g) || [];
        const numericMentions = messageText.match(/@\d{10,}/g) || [];
        
        const uniqueNumericMentions = new Set();
        numericMentions.forEach((mention) => {
          const numMatch = mention.match(/@(\d+)/);
          if (numMatch) uniqueNumericMentions.add(numMatch[1]);
        });
        
        const mentionedJidCount = mentionedJids.length;
        const numericMentionCount = uniqueNumericMentions.size;
        const totalMentions = Math.max(mentionedJidCount, numericMentionCount);
        
        if (totalMentions >= 3) {
          try {
            const participants = groupMetadata.participants || [];
            const mentionThreshold = Math.max(3, Math.ceil(participants.length * 0.5));
            const hasManyNumericMentions = numericMentionCount >= 10 ||
              (numericMentionCount >= 5 && numericMentionCount >= mentionThreshold);
            
            if (totalMentions >= mentionThreshold || hasManyNumericMentions) {
              const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
              const senderIsOwner = isOwner(sender);
              
              if (!senderIsAdmin && !senderIsOwner) {
                const action = (groupSettings.antitagAction || 'delete').toLowerCase();
                
                if (action === 'delete') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { 
                      text: `🚫 *KAMI SECURITY*\n\n${bold('TAGALL DETECTED!')}\n\n@${sender.split('@')[0]} triggered anti-tagall.\n\n_Automated action._`,
                      mentions: [sender]
                    }, { quoted: msg });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                } else if (action === 'kick') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                  
                  const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
                  if (botIsAdmin) {
                    try {
                      await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    } catch (e) {
                      console.error('Failed to kick for antitag:', e);
                    }
                    const usernames = [`@${sender.split('@')[0]}`];
                    await sock.sendMessage(from, {
                      text: `🚫 *KAMI SECURITY*\n\n${bold('REMOVED')} @${sender.split('@')[0]}\n\n_Reason: mass tagging all members_\n\n_Violations won't be tolerated._`,
                      mentions: [sender],
                    }, { quoted: msg });
                  }
                }
                return;
              }
            }
          } catch (e) {
            console.error('Error during anti-tag enforcement:', e);
          }
        }
      }
    }
    
    // AutoSticker feature - convert images/videos to stickers automatically
    if (isGroup) { // Process all messages in groups (including bot's own messages)
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.autosticker) {
        const mediaMessage = content?.imageMessage || content?.videoMessage;
        
        // Only process if it's an image or video (not documents)
        if (mediaMessage) {
          // Skip if message has a command prefix (let command handle it)
          if (!body.startsWith(config.prefix)) {
            try {
              // Import sticker command logic
              const stickerCmd = commands.get('sticker');
              if (stickerCmd) {
                // Execute sticker conversion silently
                await stickerCmd.execute(sock, msg, [], {
                  from,
                  sender,
                  isGroup,
                  groupMetadata,
                  isOwner: isOwner(sender),
                  isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                  isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                  isMod: isMod(sender),
                  reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                  react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                return; // Don't process as command after auto-converting
              }
  } catch (error) {
              console.error('[AutoSticker Error]:', error);
              // Continue to normal processing if autosticker fails
            }
          }
        }
      }
    }

     // Check for active bomb games (before prefix check)
    try {
      const bombModule = require('./commands/fun/bomb');
      if (bombModule.gameState && bombModule.gameState.has(sender)) {
        const bombCommand = commands.get('bomb');
        if (bombCommand && bombCommand.execute) {
          // User has active game, process input
          await bombCommand.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          return; // Don't process as command
        }
      }
    } catch (e) {
      // Silently ignore if bomb command doesn't exist or has errors
    }
    
    // Check for active tictactoe games (before prefix check)
    try {
      const tictactoeModule = require('./commands/fun/tictactoe');
      if (tictactoeModule.handleTicTacToeMove) {
        // Check if user is in an active game
        const isInGame = Object.values(tictactoeModule.games || {}).some(room => 
          room.id.startsWith('tictactoe') && 
          [room.game.playerX, room.game.playerO].includes(sender) && 
          room.state === 'PLAYING'
        );
        
        if (isInGame) {
          // User has active game, process input
          const handled = await tictactoeModule.handleTicTacToeMove(sock, msg, {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          if (handled) return; // Don't process as command if move was handled
        }
      }
    } catch (e) {
      // Silently ignore if tictactoe command doesn't exist or has errors
    }

    // AFK check — auto-reply when AFK user sends message or someone mentions AFK user
    if (isGroup && afkModule && !msg.key.fromMe) {
      // Check if sender was AFK — notify return
      const senderAfk = afkModule.checkAfk(sender);
      if (senderAfk) {
        const duration = Date.now() - senderAfk.since;
        const mins = Math.floor(duration / 60000);
        const secs = Math.floor((duration % 60000) / 1000);
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        await sock.sendMessage(from, {
          text: `✅ *WELCOME BACK*\n\n@${sender.split('@')[0]} _is no longer AFK_\n⏱️ _Was AFK for ${timeStr}_`,
          mentions: [sender]
        });
        afkModule.clearAfk(sender);
      }
      // Check if message mentions an AFK user
      if (afkModule.isAfkUser) {
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        for (const mentioned of mentions) {
          const afkData = afkModule.checkAfk(mentioned);
          if (afkData) {
            const mins = Math.floor((Date.now() - afkData.since) / 60000);
            const timeStr = mins > 0 ? `${mins}m` : `${Math.floor((Date.now() - afkData.since) / 1000)}s`;
            await sock.sendMessage(from, {
              text: `⚠️ *AFK*\n\n@${mentioned.split('@')[0]} _is AFK_${afkData.reason ? `\n💬 _${afkData.reason}_` : ''}\n⏱️ _For ${timeStr}_`,
              mentions: [mentioned]
            });
          }
        }
      }
    }

    // Antibadword — handle messages with banned words (warn/delete/kick per setting)
        if (isGroup && !msg.key.fromMe) {
          try {
            const groupSettings = database.getGroupSettings(from);
            const badwords = (groupSettings.badwords || []).concat(config.defaultBadwords || []);
            if (groupSettings.antibadword && badwords.length > 0 && body) {
              // Normalize once: lowercase, leetspeak, collapse repeats, strip separators.
              const normBody = normalizeBadword(body);
              for (const word of badwords) {
                const wl = word.toLowerCase().trim();
                if (!wl) continue;
                const normWord = normalizeBadword(wl).replace(/\*/g, '');
                if (!normWord) continue;
                const isWildcard = wl.includes('*');
                const hit = isWildcard
                  ? normBody.includes(normWord)
                  : (normBody.includes(normWord));
                if (hit) {
                  const action = groupSettings.badwordAction || 'delete';
                  // Delete the bad message first for delete/kick
                  try {
                    if (action !== 'warn') await sock.sendMessage(from, { delete: msg.key });
                  } catch (e) {}
                  if (action === 'warn' || action === 'delete') {
                    await sock.sendMessage(from, {
                      text: action === 'warn'
                        ? `⚠️ *BAD WORD*\n\n@${sender.split('@')[0]} _that word's not allowed here, ${pick(SLANG.vibe)}_`
                        : `🚫 *BAD WORD*\n\n@${sender.split('@')[0]} _your message was deleted — bad word detected_`,
                      mentions: [sender]
                    });
                  } else if (action === 'kick') {
                    await sock.sendMessage(from, {
                      text: `🚫 *BAD WORD*\n\n@${sender.split('@')[0]} _kicked — bad word detected_`,
                      mentions: [sender]
                    });
                    try {
                      await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    } catch (e) {}
                  }
                  return;
                }
              }
            }
          } catch (e) {}
        }

    // Antiflood — auto-warn/kick spammers
    if (isGroup && !msg.key.fromMe) {
      try {
        const groupSettings = database.getGroupSettings(from);
        if (groupSettings.antiflood) {
          const limit = groupSettings.antifloodLimit || 5;
          const window = groupSettings.antifloodWindow || 10;
          const action = groupSettings.antifloodAction || 'warn';
          const key = `${from}:${sender}`;
          const now = Date.now();
          const tracker = floodTracker.get(key);

          if (!tracker || (now - tracker.firstMsgTime) > window * 1000) {
            floodTracker.set(key, { count: 1, firstMsgTime: now });
          } else {
            tracker.count++;
            if (tracker.count >= limit) {
              floodTracker.delete(key);
              if (action === 'kick') {
                await sock.sendMessage(from, {
                  text: `🚫 *FLOOD DETECTED*\n\n@${sender.split('@')[0]} _kicked for spamming_`,
                  mentions: [sender]
                });
                try {
                  await sock.groupParticipantsUpdate(from, [sender], 'remove');
                } catch (e) {}
              } else if (action === 'delete') {
                // Delete the offending messages
                try {
                  await sock.sendMessage(from, { delete: msg.key });
                } catch (e) {}
                await sock.sendMessage(from, {
                  text: `🗑️ *FLOOD CLEANED*\n\n@${sender.split('@')[0]} _stop spamming — your messages got cleaned_`,
                  mentions: [sender]
                });
              } else {
                // warn — warn the spammer directly (DM them + group notice)
                try {
                  const warnCmd = commands.get('warn');
                  if (warnCmd) {
                    await warnCmd.execute(sock, msg, ['Auto-warn: flooding'], {
                      from, sender, groupMetadata,
                      isOwner: isOwner(sender),
                      isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                      isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                      reply: (text) => sock.sendMessage(from, { text }, { quoted: msg })
                    });
                  }
                } catch (e) {}
                // Direct DM to the spammer so THEY get the warning personally
                try {
                  const targetJid = sender.startsWith('@lid') || sender.includes('@g.us')
                    ? sender.split('@')[0] + '@s.whatsapp.net'
                    : sender;
                  await sock.sendMessage(targetJid, {
                    text: `⚠️ *FLOOD WARNING*\n\nHey — slow down. You\'re spamming too fast in the group.\n\n_One more burst and you\'re getting kicked, ${pick(SLANG.vibe)}_`
                  });
                } catch (e) {}
              }
              return;
            }
          }
        }
      } catch (e) {}
    }

// Slowmode enforcement (group messages only)
    if (isGroup && slowmodeModule && !msg.key.fromMe) {
      const slowSettings = database.getGroupSettings(from);
      const slowSec = slowSettings.slowmode || 0;
      if (slowSec > 0) {
        const trackMap = slowmodeModule.lastMessageTime;
        const userKey = `${from}:${sender}`;
        const lastTime = trackMap.get(userKey) || 0;
        const elapsed = (Date.now() - lastTime) / 1000;

        if (elapsed < slowSec && lastTime > 0) {
          const remaining = Math.ceil(slowSec - elapsed);
          await sock.sendMessage(from, {
            text: `🐢 *SLOWMODE*\n\n@${sender.split('@')[0]} — wait *${remaining}s* before sending again`,
            mentions: [sender]
          });
          return;
        }

        trackMap.set(userKey, Date.now());

        // Cleanup old entries every 100 messages
        if (trackMap.size > 200) {
          const now = Date.now();
          for (const [key, time] of trackMap) {
            if (now - time > 300000) trackMap.delete(key);
          }
        }
      }
    }
    
    // Check if message starts with prefix
    if (!body.startsWith(config.prefix)) return;
    
    // Parse command
    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    
    // Get command
    const command = commands.get(commandName);
    if (!command) return;
    
    // Check self mode (private mode) - only owner/approved can use commands (DMs ONLY, groups unaffected)
    // Pending applicants and team admins are exempt so the .crew apply / accept / deny flow works in DMs.
    const globalSettings = database.getGlobalSettings();
    if (!isGroup && globalSettings.selfMode && !isOwner(sender) && !database.isApprovedNumber(sender) && !database.isTeamAdmin(sender) && !database.hasPendingApplication(sender)) {
      // Send warning then block (owner can never reach here due to isOwner check above)
      try {
        await sock.sendMessage(from, {
          text: `🚫 *DO NOT TEXT THIS NUMBER* — this is a *bot* account 🤖\n` +
                `📲 *Message me on:* 084 082 0712\n` +
                `⚠️ *Your number will be BLOCKED after this message* ⛔🔒`
        });
        await sock.updateBlockStatus(sender, 'block');
      } catch (e) {
        console.error('[DMBLOCKER] block failed:', e.message);
      }
      return;
    }
    
    // Team admin DM restriction — can ONLY accept/deny/applicants/pending from DMs.
    // Owner keeps universal access.
    if (!isGroup && database.isTeamAdmin(sender) && !isOwner(sender)) {
      const lowerBody = (body || '').trim().toLowerCase();
      const prefixEscaped = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isAllowedCmd = new RegExp('^\\' + prefixEscaped +
        'crew\\s+(accept|deny|hire|reject|fire|applicants|pending)\\b').test(lowerBody);
      if (!isAllowedCmd) {
        return sock.sendMessage(from, {
          text: `❌ ERROR\n\n` +
                `As a team admin you're only allowed to accept or deny pending applications from DMs\n\n` +
                `✅ Accept: \`.crew accept <App ID>\`\n` +
                `❌ Deny: \`.crew deny <App ID> <reason>\`\n` +
                `📋 View pending: \`.crew applicants <team>\``
        }, { quoted: msg });
      }
    }
    
    // Applicant DM restriction — can ONLY use crew application commands while pending.
    // Owner keeps universal access. Team admins handled above.
    if (!isGroup && !database.isTeamAdmin(sender) && !isOwner(sender) && database.hasPendingApplication(sender)) {
      const lowerBody = (body || '').trim().toLowerCase();
      const prefixEscaped = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isAllowedCmd = new RegExp('^' + prefixEscaped +
        'crew\\s+(apply|applied|withdraw|applicants|pending)(?=\\s|$)').test(lowerBody);
      if (!isAllowedCmd) {
        return sock.sendMessage(from, {
          text: `⏳ APPLICATION PENDING\n\n` +
                `You have a pending application being reviewed by an admin.\n` +
                `Wait for an admin to accept or deny your application.\n\n` +
                `❌ You cannot use other commands while your application is being reviewed.\n\n` +
                `💡 *Crew commands you can use:*\n` +
                `\`${prefix}crew apply <team>\` — apply to another team\n` +
                `\`${prefix}crew applied <team> <answers>\` — submit your answers\n` +
                `\`${prefix}crew withdraw <UID>\` — withdraw your application\n` +
                `\`${prefix}crew applicants <team>\` — check your app status`
        }, { quoted: msg });
      }
    }
    
    // Permission checks
    if (command.ownerOnly && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.ownerOnly }, { quoted: msg });
    }
    
    if (command.modOnly && !isMod(sender) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: `${bold('Moderators only')} — this one's for the mods` }, { quoted: msg });
    }
    
    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(from, { text: config.messages.groupOnly }, { quoted: msg });
    }
    
    if (command.privateOnly && isGroup) {
      return sock.sendMessage(from, { text: config.messages.privateOnly }, { quoted: msg });
    }
    
    if (command.adminOnly && !(await isAdmin(sock, sender, from, groupMetadata)) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.adminOnly }, { quoted: msg });
    }
    
    if (command.botAdminNeeded) {
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      if (!botIsAdmin) {
        return sock.sendMessage(from, { text: config.messages.botAdminNeeded }, { quoted: msg });
      }
    }
    
    // Auto-typing
    if (config.autoTyping) {
      await sock.sendPresenceUpdate('composing', from);
    }
    
    // Detect owner mentions in the message
    const msgMentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const ownerMentioned = msgMentions.some(jid => isOwner(jid));
    
    // Execute command
    console.log(`Executing command: ${commandName} from ${sender}`);
    
    try {
      await command.execute(sock, msg, args, {
        from,
        sender,
        isGroup,
        groupMetadata,
        isOwner: isOwner(sender),
        isOwnerMentioned: ownerMentioned,
        ownerMentions: msgMentions.filter(jid => isOwner(jid)),
        isAdmin: await isAdmin(sock, sender, from, groupMetadata),
        isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
        isMod: isMod(sender),
        reply: async (text) => {
          try {
            return await sock.sendMessage(from, { text }, { quoted: msg });
          } catch (err) {
            console.error(`[REPLY ERROR] Failed to send to ${from}:`, err.message);
            throw err;
          }
        },
        react: async (emoji) => {
          try {
            return await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
          } catch (err) {
            console.error(`[REACT ERROR] Failed to react in ${from}:`, err.message);
          }
        }
      });
      // Log successful command
      database.logCommand({
        command: commandName,
        args: args.join(' '),
        user: sender,
        group: isGroup ? from : null,
        isOwner: isOwner(sender),
        isAdmin: await isAdmin(sock, sender, from, groupMetadata),
        success: true,
      });
    } catch (cmdErr) {
      // Log failed command
      database.logCommand({
        command: commandName,
        args: args.join(' '),
        user: sender,
        group: isGroup ? from : null,
        isOwner: isOwner(sender),
        isAdmin: await isAdmin(sock, sender, from, groupMetadata),
        success: false,
        error: cmdErr.message,
      });
      throw cmdErr;
    }
    
  } catch (error) {
    console.error('Error in message handler:', error);
    
    // Don't send error messages for rate limit errors
    if (error.message && error.message.includes('rate-overlimit')) {
      console.warn('⚠️ Rate limit reached. Skipping error message.');
      return;
    }
    
    try {
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `${config.messages.error}\n_${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    } catch (e) {
      // Don't log rate limit errors when sending error messages
      if (!e.message || !e.message.includes('rate-overlimit')) {
        console.error('Error sending error message:', e);
      }
    }
  }
};

// Group participant update handler
const handleGroupUpdate = async (sock, update) => {
  try {
    const { id, participants, action } = update;
    
    // Validate group JID before processing
    if (!id || !id.endsWith('@g.us')) {
      return;
    }
    
    // Crew sync — auto-add/remove from crew DB based on group membership.
    // Runs BEFORE the welcome/goodbye early-return so it always fires.
    try {
      if (action === 'add' || action === 'remove') {
        for (const participant of participants) {
          const jid = typeof participant === 'string' ? participant : (participant.id || participant.jid || participant.participant);
          if (!jid || jid === sock.user?.id) continue;
          
          // Build JID variants for matching (handle LID/PN)
          const jidVariants = buildComparableIds(jid);
          const isInCrew = jidVariants.some(v => database.getCrewMember(id, v));
          
          if (action === 'add') {
            if (!isInCrew) {
              database.addCrewMember(id, jid, {
                role: 'member',
                joined: Date.now(),
                addedBy: 'auto-sync',
              });
              console.log(`[CREW SYNC] Auto-added ${jid.split('@')[0]} to ${id}`);
            }

            // ── Auto-repromote protected admins on rejoin ────
            if (database.isOwnerPromotedAdmin(id, jid)) {
              console.log(`[MEMBER PROTECTION] Protected admin ${jid.split('@')[0]} rejoined ${id} — auto-promoting`);
              try {
                await sock.groupParticipantsUpdate(id, [jid], 'promote');
                await sock.sendMessage(jid, {
                  text:
                    `👑 *WELCOME BACK*\n\n` +
                    `You're the admin again\n` +
                    `_KAMI-Bot doesn't forget who put you there_`,
                });
              } catch (e) {
                console.error(`[MEMBER PROTECTION] Failed to auto-promote ${jid.split('@')[0]}:`, e.message);
              }
            }
          } else if (action === 'remove') {
            if (isInCrew) {
              // Remove using the JID variant that matched
              for (const variant of jidVariants) {
                database.removeCrewMember(id, variant);
              }
              database.removeCrewMember(id, jid);
              console.log(`[CREW SYNC] Auto-removed ${jid.split('@')[0]} from ${id}`);
            }

            // ── Owner-Protected Member Removal ────────────
            if (database.isOwnerProtected(id, jid) && !_botKicked.has(jid)) {
              console.log(`[MEMBER PROTECTION] Protected member ${jid.split('@')[0]} removed from ${id} — attempting re-add`);

              const memberNum = jid.split(':')[0].split('@')[0];
              let reAdded = false;

              // Try to re-add the protected member
              try {
                await sock.groupParticipantsUpdate(id, [jid], 'add');
                reAdded = true;
              } catch (e) {
                console.error(`[MEMBER PROTECTION] Failed to re-add ${memberNum}:`, e.message);
              }

              // Log the protection event
              database.logProtection({
                action: 'kick',
                target: jid,
                triggeredBy: 'unknown',
                group: id,
                result: reAdded ? 're-added' : 'failed',
              });

              // DM the victim
              try {
                if (reAdded) {
                  await sock.sendMessage(jid, {
                    text:
                      `🛡️ *YOU GOOD*\n\n` +
                      `Someone kicked you from a crew group\n` +
                      `KAMI-Bot brought you back\n\n` +
                      `_KAMI's people stay_ 👑`,
                  });
                } else {
                  // Re-add failed — send invite link
                  let inviteLink = '';
                  try {
                    const code = await sock.groupInviteCode(id);
                    inviteLink = `https://chat.whatsapp.com/${code}`;
                  } catch (e) {}

                  await sock.sendMessage(jid, {
                    text:
                      `🛡️ *YOU GOOD*\n\n` +
                      `Someone kicked you from a crew group\n` +
                      `KAMI-Bot tried bringing you back but couldn't\n\n` +
                      (inviteLink
                        ? `🔗 *Jump back in:*\n${inviteLink}\n\nWhen you're back, you'll be admin again`
                        : `Hit up KAMI to get back in`),
                  });
                }
              } catch (e) {}

              // DM the owner
              const ownerNumbers = config.ownerNumber || [];
              for (const ownerNum of ownerNumbers) {
                try {
                  const ownerJid = ownerNum.includes('@') ? ownerNum : `${ownerNum}@s.whatsapp.net`;
                  await sock.sendMessage(ownerJid, {
                    text:
                      `🛡️ *PROTECTION*\n\n` +
                      `@${memberNum} got kicked from a crew group\n\n` +
                      (reAdded
                        ? `KAMI-Bot brought them back ${pick(SLANG.vibe)}`
                        : `Couldn't re-add — sent them the invite link\nThey'll be admin again when they join`) +
                      `\nCheck who did it`,
                    mentions: [jid],
                  });
                } catch (e) {}
              }
            }
          }
        }
      }
      
      // Promote/Demote — sync teamAdmins list from WhatsApp group metadata
      if (action === 'promote' || action === 'demote') {
        // Check if this group is a crew team
        const teamMap = database.getTeamMap();
        const isCrewGroup = Object.values(teamMap).some(t => t.jid === id) ||
          Object.values(config.crewTeams || {}).some(t => t.jid === id);
        
        if (isCrewGroup) {
          try {
            const meta = await sock.groupMetadata(id).catch(() => null);
            if (meta && meta.participants) {
              for (const participant of participants) {
                const jid = typeof participant === 'string' ? participant : (participant.id || participant.jid || participant.participant);
                if (!jid) continue;
                const number = jid.replace(/@.*$/, '');
                
                if (action === 'promote') {
                  // Added as admin — add to teamAdmins
                  database.addTeamAdmin(number);
                  // Track which team this admin belongs to
                  const teamMap = database.getTeamMap();
                  for (const [abbrev, info] of Object.entries(teamMap)) {
                    if (info.jid === id) {
                      database.addTeamAdminTeam(number, abbrev);
                      break;
                    }
                  }
                  for (const [key, info] of Object.entries(config.crewTeams || {})) {
                    if (info.jid === id) {
                      database.addTeamAdminTeam(number, key);
                      break;
                    }
                  }
                  console.log(`[TEAM ADMIN SYNC] Auto-added ${number} (promoted in ${id})`);
                } else if (action === 'demote') {
                  // ── Owner-Promoted Admin Protection ────────
                  // Check if the demoted person is a protected admin (promoted by owner)
                  // For external demotes (not via .demote command), auto-repromote
                  if (database.isOwnerPromotedAdmin(id, jid)) {
                    const record = database.getOwnerPromotedAdmin(id, jid);
                    // Skip if the owner did this demotion (check via botDemoted tracking)
                    if (!module.exports._botDemoted.has(jid)) {
                      console.log(`[ADMIN PROTECTION] External demote of protected admin ${number} in ${id} — re-promoting`);
                      try {
                        await sock.groupParticipantsUpdate(id, [jid], 'promote');
                      } catch (e) {}
                      // Log the protection event
                      database.logProtection({
                        action: 'demote',
                        target: jid,
                        triggeredBy: 'unknown',
                        group: id,
                        result: 're-promoted',
                      });
                      // Notify owner(s)
                      const ownerNumbers = config.ownerNumber || [];
                      for (const ownerNum of ownerNumbers) {
                        try {
                          const ownerJid = ownerNum.includes('@') ? ownerNum : `${ownerNum}@s.whatsapp.net`;
                          await sock.sendMessage(ownerJid, {
                            text:
                              `🛡️ *ADMIN PROTECTION*\n\n` +
                              `@${number} was demoted in a crew group\n` +
                              `They were promoted by you and are *protected*\n\n` +
                              `✅ They have been automatically re-promoted\n` +
                              `⚠️ If this keeps happening, check who is demoting admins`,
                            mentions: [jid],
                          });
                        } catch (e) {}
                      }
                      continue; // Skip teamAdmin sync — we just re-promoted
                    }
                    // Owner did it via .demote — command already removed protection
                    database.removeOwnerPromotedAdmin(id, jid);
                  }

                  // Removed as admin — check if still admin in ANY crew group
                  let stillAdminAnywhere = false;
                  const allTeams = { ...teamMap };
                  for (const [key, info] of Object.entries(config.crewTeams || {})) {
                    if (!allTeams[key]) allTeams[key] = info;
                  }
                  
                  for (const teamInfo of Object.values(allTeams)) {
                    try {
                      const teamMeta = await sock.groupMetadata(teamInfo.jid).catch(() => null);
                      if (teamMeta && teamMeta.participants) {
                        const found = teamMeta.participants.find(p => {
                          const pJid = p.id || p.jid;
                          return pJid === jid && (p.admin === 'admin' || p.admin === 'superadmin');
                        });
                        if (found) {
                          stillAdminAnywhere = true;
                          break;
                        }
                      }
                    } catch (e) {}
                  }
                  
                  if (!stillAdminAnywhere) {
                    database.removeTeamAdmin(number);
                    database.removeAutoUnblockedTeamAdmin(jid);
                    // Remove from all team mappings
                    const teamMap = database.getTeamMap();
                    for (const [abbrev] of Object.entries(teamMap)) {
                      database.removeTeamAdminTeam(number, abbrev);
                    }
                    for (const [key] of Object.entries(config.crewTeams || {})) {
                      database.removeTeamAdminTeam(number, key);
                    }
                    console.log(`[TEAM ADMIN SYNC] Removed ${number} (no longer admin anywhere)`);
                  }
                }
              }
            }
          } catch (e) {
            console.error('[TEAM ADMIN SYNC] Error:', e.message);
          }
        }
      }
    } catch (crewErr) {
      console.error('[CREW SYNC] Error:', crewErr.message);
    }
    
    const groupSettings = database.getGroupSettings(id);
    
    if (!groupSettings.welcome && !groupSettings.goodbye) return;
    
    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return; // Skip if metadata unavailable (forbidden or error)
    
    // Helper to extract participant JID
    const getParticipantJid = (participant) => {
      if (typeof participant === 'string') {
        return participant;
      }
      if (participant && participant.id) {
        return participant.id;
      }
      if (participant && typeof participant === 'object') {
        // Try to find JID in object
        return participant.jid || participant.participant || null;
      }
      return null;
    };
    
    for (const participant of participants) {
      const participantJid = getParticipantJid(participant);
      if (!participantJid) {
        console.warn('Could not extract participant JID:', participant);
        continue;
      }
      
      const participantNumber = participantJid.split('@')[0];
      
      if (action === 'add' && groupSettings.welcome) {
        try {
          // Find participant info
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          // Use real phone number from group metadata if available (not @lid garbage)
          const realPhone = participantInfo?.phoneNumber || participantNumber;
          
          // Get group name and description
          const groupName = groupMetadata.subject || 'the group';
          const groupDesc = groupMetadata.desc || 'No description';
          
          // Get current time string
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
          
          // Resolve display name (username > contact name > formatted phone)
          const displayName = resolveDisplayName(participantJid, realPhone, participantInfo, sock);
          
          // Create formatted welcome message
          const joinedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const welcomeMsg = [
            `*New Member*`,
            `Welcome ${mention(participantJid)} to *${groupName}*`,
            `Member #${groupMetadata.participants.length} | ${joinedDate}`,
            '',
            `_${pick(SLANG.vibe)}, enjoy your stay chommie_ 💀`,
          ].join('\n');
          
          // Fetch user profile pic (buffer)
          let userAvatarBuf = null;
          try {
            const userPicUrl = await sock.profilePictureUrl(participantJid, 'image');
            const userPicRes = await axios.get(userPicUrl, { responseType: 'arraybuffer' });
            userAvatarBuf = Buffer.from(userPicRes.data);
          } catch (e) { /* no pic available */ }
          
          // Fetch group profile pic as background
          let bgBuffer = null;
          const customWelcomePath = path.join(__dirname, 'utils/welcome_image.jpg');
          
          // Security groups always use group PP — skip custom image
          const isSecurityGroup = Object.values(config.crewTeams || {}).some(t => t.jid === id);
          
          if (isSecurityGroup) {
            // Security group: group PP only
            try {
              const groupPicUrl = await sock.profilePictureUrl(id, 'image');
              const groupPicRes = await axios.get(groupPicUrl, { responseType: 'arraybuffer' });
              bgBuffer = Buffer.from(groupPicRes.data);
            } catch (e) {
              const fallbackPath = path.join(__dirname, 'Picsart_25-11-17_09-42-48-275.png');
              if (fs.existsSync(fallbackPath)) {
                bgBuffer = fs.readFileSync(fallbackPath);
              }
            }
          } else {
            // Other groups: custom image > group pic > fallback
            if (fs.existsSync(customWelcomePath)) {
              bgBuffer = fs.readFileSync(customWelcomePath);
            } else {
              try {
                const groupPicUrl = await sock.profilePictureUrl(id, 'image');
                const groupPicRes = await axios.get(groupPicUrl, { responseType: 'arraybuffer' });
                bgBuffer = Buffer.from(groupPicRes.data);
              } catch (e) {
                const fallbackPath = path.join(__dirname, 'Picsart_25-11-17_09-42-48-275.png');
                if (fs.existsSync(fallbackPath)) {
                  bgBuffer = fs.readFileSync(fallbackPath);
                }
              }
            }
          }
          
          // Build the image
          if (bgBuffer) {
            const ws = groupSettings.welcomeStyle || {};
            const joinedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const textLines = [
              { text: 'New Member', size: ws.fontSize || 72, bold: true, color: ws.textColor || '#ffffff' },
              { text: `Welcome to ${groupName}`, size: ws.subFontSize || 44, color: '#ffffff' },
              { text: `Member #${groupMetadata.participants.length} | ${joinedDate}`, size: 32, color: '#cccccc' },
            ];
            try {
              const resultBuffer = await buildImage(bgBuffer, {
                lines: textLines,
                position: 'bottom',
                avatar: userAvatarBuf,
                avatarSize: 180,
                bg: { color: ws.bgColor || 'rgba(0,0,0,0.55)', radius: 16, padding: 28 },
              });
              await sock.sendMessage(id, { image: resultBuffer, caption: welcomeMsg, mentions: [participantJid] });
            } catch (imgErr) {
              console.error('Welcome buildImage error:', imgErr.message);
            }
          } else {
            console.error('Welcome: no bgBuffer available');
          }
        } catch (welcomeError) {
          // Fallback to text message if image generation fails
          console.error('Welcome image error:', welcomeError);
          let message = groupSettings.welcomeMessage || `${greet()} @user! 👋\n${lekker()} to have you in @group!`;
          message = message.replace('@user', `@${displayName}`);
          message = message.replace('@group', groupMetadata.subject || 'the group');
          
          await sock.sendMessage(id, { 
            text: message, 
            mentions: [participantJid] 
          });
        }
      } else if (action === 'remove' && groupSettings.goodbye) {
        try {
          // Find participant info
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          // Use real phone number from group metadata if available
          const realPhone = participantInfo?.phoneNumber || participantNumber;
          
          // Resolve display name (username > contact name > formatted phone)
          const displayName = resolveDisplayName(participantJid, realPhone, participantInfo, sock);
          
          // Get group name
          const groupName = groupMetadata.subject || 'the group';
          
          // Fetch user profile pic (buffer)
          let userAvatarBuf = null;
          try {
            const userPicUrl = await sock.profilePictureUrl(participantJid, 'image');
            const userPicRes = await axios.get(userPicUrl, { responseType: 'arraybuffer' });
            userAvatarBuf = Buffer.from(userPicRes.data);
          } catch (e) { /* no pic */ }
          
          // Create goodbye text
          const leftDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const goodbyeMsg = [
            `*Goodbye*`,
            `Farewell ${mention(participantJid)} from *${groupName}*`,
            `Member #${groupMetadata.participants.length} | ${leftDate}`,
            '',
            `_${pick(SLANG.vibe)}, we'll miss you hey._ 💀`,
          ].join('\n');
          
          // Fetch background image: custom > group pic > fallback
          let bgBuffer = null;
          const customGoodbyePath = path.join(__dirname, 'utils/goodbye_image.jpg');
          
          // Security groups always use group PP — skip custom image
          const isSecurityGroupGbye = Object.values(config.crewTeams || {}).some(t => t.jid === id);
          
          if (isSecurityGroupGbye) {
            // Security group: group PP only
            try {
              const groupPicUrl = await sock.profilePictureUrl(id, 'image');
              const groupPicRes = await axios.get(groupPicUrl, { responseType: 'arraybuffer' });
              bgBuffer = Buffer.from(groupPicRes.data);
            } catch (e) {
              const fallbackPath = path.join(__dirname, 'Picsart_25-11-17_09-42-48-275.png');
              if (fs.existsSync(fallbackPath)) {
                bgBuffer = fs.readFileSync(fallbackPath);
              }
            }
          } else {
            // Other groups: custom image > group pic > fallback
            if (fs.existsSync(customGoodbyePath)) {
              bgBuffer = fs.readFileSync(customGoodbyePath);
            } else {
              try {
                const groupPicUrl = await sock.profilePictureUrl(id, 'image');
                const groupPicRes = await axios.get(groupPicUrl, { responseType: 'arraybuffer' });
                bgBuffer = Buffer.from(groupPicRes.data);
              } catch (e) {
                const fallbackPath = path.join(__dirname, 'Picsart_25-11-17_09-42-48-275.png');
                if (fs.existsSync(fallbackPath)) {
                  bgBuffer = fs.readFileSync(fallbackPath);
                }
              }
            }
          }
          
          // Build the image
          if (bgBuffer) {
            const gs = groupSettings.goodbyeStyle || {};
            const leftDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const textLines = [
              { text: 'Goodbye', size: gs.fontSize || 72, bold: true, color: gs.textColor || '#ffffff' },
              { text: `Farewell from ${groupName}`, size: gs.subFontSize || 44, color: '#ffffff' },
              { text: `Member #${groupMetadata.participants.length} | ${leftDate}`, size: 32, color: '#cccccc' },
            ];
            const resultBuffer = await buildImage(bgBuffer, {
              lines: textLines,
              position: 'bottom',
              avatar: userAvatarBuf,
              avatarSize: 180,
              bg: { color: gs.bgColor || 'rgba(0,0,0,0.55)', radius: 16, padding: 28 },
            });
            await sock.sendMessage(id, { image: resultBuffer, caption: goodbyeMsg, mentions: [participantJid] });
          }
        } catch (goodbyeError) {
          // Fallback to simple goodbye message
          console.error('Goodbye error:', goodbyeError);
          const goodbyeMsg = `_${pick(SLANG.vibe)}_ @${displayName} 👋\n_Go well, chommie._ 💀`;
          
          await sock.sendMessage(id, { 
            text: goodbyeMsg, 
            mentions: [participantJid] 
          });
        }
      }
    }

  } catch (error) {
    // Silently handle forbidden errors and other group metadata errors
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      // Silently skip forbidden groups
      return;
    }
    // Only log non-forbidden errors
    if (!error.message || !error.message.includes('forbidden')) {
      console.error('Error handling group update:', error);
    }
  }
};

// Antilink handler
const handleAntilink = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antilink) return;
    
    // Unwrap message containers (view once, ephemeral, document with caption, etc.)
    const content = getMessageContent(msg);
    if (!content) return;
    
    const body = content.conversation || 
                 content.extendedTextMessage?.text || 
                 content.imageMessage?.caption || 
                 content.videoMessage?.caption || '';
    
    if (!body || !body.trim()) return;
    
    // Comprehensive link detection - matches links with or without protocols
    const linkPattern = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;
    
    if (!linkPattern.test(body)) return;
    
    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender);
    
    if (senderIsAdmin || senderIsOwner) return;
    
    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antilinkAction || 'delete').toLowerCase();
    
    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.sendMessage(from, { delete: msg.key });
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, { 
          text: `🔗 _Anti-link triggered. Link removed, ${pick(SLANG.vibe)}._`,
          mentions: [sender]
        });
      } catch (e) {
        console.error('Failed to kick for antilink:', e);
      }
    } else if (action === 'warn' && botIsAdmin) {
      try {
        await sock.sendMessage(from, { delete: msg.key });
        
        const warningData = database.addWarning(from, sender, 'Posted a link (Anti-link)');
        const warnCount = warningData.count;
        const maxWarnings = config.maxWarnings || 3;
        
        if (warnCount >= maxWarnings) {
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await sock.sendMessage(from, { 
            text: `🚫 *ANTI-LINK*\n\n${bold('REMOVED')} @${sender.split('@')[0]}\n\n_Reason: 3 link violations_\n\n_This was your final warning._`,
            mentions: [sender]
          });
          database.clearWarnings(from, sender);
        } else {
          const remaining = maxWarnings - warnCount;
          await sock.sendMessage(from, { 
            text: `🚫 *ANTI-LINK WARNING ${warnCount}/${maxWarnings}*\n\n@${sender.split('@')[0]} — links are prohibited!\n\n_${remaining} more and you're out._`,
            mentions: [sender]
          });
        }
      } catch (e) {
        console.error('Failed to warn for antilink:', e);
      }
    } else {
      try {
        await sock.sendMessage(from, { delete: msg.key });
        await sock.sendMessage(from, { 
          text: `🔗 _Anti-link triggered. Link removed, ${pick(SLANG.vibe)}._`,
          mentions: [sender]
        });
      } catch (e) {
        console.error('Failed to delete message for antilink:', e);
      }
    }
  } catch (error) {
    console.error('Error in antilink handler:', error);
  }
};


// Anti-group mention handler
const handleAntigroupmention = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    
    if (!groupSettings.antigroupmention) return;
    
    // Unwrap message containers first
    const content = getMessageContent(msg);
    const messageType = content ? Object.keys(content).find(key => !['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'].includes(key)) : null;
    
    // Check if this is a forwarded status message that mentions the group
    let isForwardedStatus = false;
    
    const rawMsg = content || msg.message;
    if (rawMsg) {
      // Direct checks for known status mention message types
      isForwardedStatus = isForwardedStatus || !!rawMsg.groupStatusMentionMessage;
      isForwardedStatus = isForwardedStatus || 
        (rawMsg.protocolMessage && rawMsg.protocolMessage.type === 25); // STATUS_MENTION_MESSAGE
      
      // Check for forwarded newsletter info in various message types
      const ctx = rawMsg.extendedTextMessage?.contextInfo || rawMsg.contextInfo;
      if (ctx?.forwardedNewsletterMessageInfo) {
        isForwardedStatus = true;
      }
      
      // Check image/video captions for newsletter info
      if (rawMsg.imageMessage?.contextInfo?.forwardedNewsletterMessageInfo) {
        isForwardedStatus = true;
      }
      if (rawMsg.videoMessage?.contextInfo?.forwardedNewsletterMessageInfo) {
        isForwardedStatus = true;
      }
      
      // Generic forwarded checks
      if (ctx) {
        isForwardedStatus = isForwardedStatus || !!ctx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!ctx.forwardingScore;
        isForwardedStatus = isForwardedStatus || !!ctx.quotedMessageTimestamp;
      }
    }
    
    if (!isForwardedStatus) return;
    
    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender);
    
    if (senderIsAdmin || senderIsOwner) return;
    
    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antigroupmentionAction || 'delete').toLowerCase();
    
    if (action === 'kick' && botIsAdmin) {
      try {
        if (!msg.key) throw new Error('No message key found');
        await sock.sendMessage(from, { delete: msg.key });
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, { 
          text: `📌 Group mention detected. User removed.`,
          mentions: [sender]
        });
      } catch (e) {
        console.error('Failed to kick for antigroupmention:', e);
        await sock.sendMessage(from, { 
          text: `⚠️ Failed to delete mention message: ${e.message}`,
          mentions: [sender]
        });
      }
    } else if (action === 'warn' && botIsAdmin) {
      try {
        if (!msg.key) throw new Error('No message key found for delete');
        const deleteResult = await sock.sendMessage(from, { delete: msg.key });
        console.log('Delete result for status mention:', deleteResult);
        
        const warningData = database.addWarning(from, sender, 'Group mention (Anti-group mention)');
        const warnCount = warningData.count;
        const maxWarnings = config.maxWarnings || 3;
        
        if (warnCount >= maxWarnings) {
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await sock.sendMessage(from, { 
            text: `🚫 *ANTI-GROUP MENTION*\n\n${bold('REMOVED')} @${sender.split('@')[0]}\n\n_Reason: 3 group mention violations_\n\n_This was your final warning._`,
            mentions: [sender]
          });
          database.clearWarnings(from, sender);
        } else {
          const remaining = maxWarnings - warnCount;
          await sock.sendMessage(from, { 
            text: `🚫 *ANTI-GROUP MENTION WARNING ${warnCount}/${maxWarnings}*\n\n@${sender.split('@')[0]} — group mentions are prohibited!\n\n_${remaining} more and you're out._`,
            mentions: [sender]
          });
        }
      } catch (e) {
        console.error('Failed to warn/delete for antigroupmention:', e);
        await sock.sendMessage(from, { 
          text: `⚠️ Anti-group mention triggered but delete failed: ${e.message}`,
          mentions: [sender]
        });
      }
    } else {
      try {
        if (!msg.key) throw new Error('No message key found');
        await sock.sendMessage(from, { delete: msg.key });
      } catch (e) {
        console.error('Failed to delete message for antigroupmention:', e);
        await sock.sendMessage(from, { 
          text: `⚠️ Failed to delete mention message: ${e.message}`,
          mentions: [sender]
        });
      }
    }
  } catch (error) {
    console.error('Error in antigroupmention handler:', error);
  }
};


// Anti-call feature initializer
const initializeAntiCall = (sock, isOwner) => {
  sock.ev.on('call', async (calls) => {
    try {
      delete require.cache[require.resolve('./config')];
      const config = require('./config');
      if (!config.defaultGroupSettings.anticall) return;

      for (const call of calls) {
        if (call.status !== 'offer') continue;
        const caller = call.from;

        console.log('[ANTICALL] Call from:', caller);

        // Reject the call
        try { await sock.rejectCall(call.id, caller); } catch (e) {
          console.error('[ANTICALL] rejectCall failed:', e.message);
        }

        // Send message first (before block so it delivers)
        try {
          await sock.sendMessage(caller, {
            text: `🚫 _Sorry, calls aren't allowed here. Send a message instead._`
          });
        } catch (e) {
          console.error('[ANTICALL] message failed:', e.message);
        }

        // Block non-owners
        if (!isOwner(caller)) {
          try { await sock.updateBlockStatus(caller, 'block'); } catch (e) {
            console.error('[ANTICALL] block failed:', e.message);
          }
        }
      }
    } catch (err) {
      console.error('[ANTICALL ERROR]', err);
    }
  });
};

module.exports = {
  handleMessage,
  handleGroupUpdate,
  handleAntilink,
  handleAntigroupmention,
  initializeAntiCall,
  isOwner,
  isAdmin,
  isBotAdmin,
  isMod,
  getGroupMetadata,
  findParticipant,
  _botDemoted,
  _botKicked,
};
