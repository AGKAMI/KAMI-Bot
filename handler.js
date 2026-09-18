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
    
    
    // Check if message starts with prefix
    if (!body.startsWith(config.prefix)) return;
    
    // Parse command
    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    
    // Get command
    const command = commands.get(commandName);
    if (!command) return;
    
    // Check self mode (private mode) - only owner can use commands
    if (config.selfMode && !isOwner(sender)) {
      return;
    }
    
    // Permission checks
    if (command.ownerOnly && !isOwner(sender)) {
      return sock.sendMessage(from, { text: config.messages.ownerOnly }, { quoted: msg });
    }
    
    if (command.modOnly && !isMod(sender) && !isOwner(sender)) {
      return sock.sendMessage(from, { text: `${bold('Moderators only')} — this one's for the mods, ${pick(SLANG.friend)}` }, { quoted: msg });
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
    
    // Execute command
    console.log(`Executing command: ${commandName} from ${sender}`);
    
    await command.execute(sock, msg, args, {
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
          const displayName = resolveDisplayName(participantJid, participantNumber, participantInfo, sock);
          
          // Create formatted welcome message
          const welcomeLines = [
                      `${bold(greet().toUpperCase())} @${displayName}! 👋`,
                      '',
                      `${mention(participantJid)} ${bold('lekker to have you here')}`,
                      `- 💀 ${bold('Member')} #${groupMetadata.participants.length}`,
                      `- ⏰ ${timeString}`,
                      '',
                      line(20),
                      '',
                      `📜 *${groupName}*`,
                      groupDesc || '_No description yet_',
                      '',
                      `${bold('RULES')}`,
                      '- No spam',
                      '- No illegal content',
                      '- No toxic behavior',
                      '',
                      `_${pick(SLANG.vibe)}, enjoy your stay chommie_`,
                    ];
          const welcomeMsg = welcomeLines.join('\n');
          
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
          
          // Priority: custom image > group profile pic > fallback local image
          if (fs.existsSync(customWelcomePath)) {
            bgBuffer = fs.readFileSync(customWelcomePath);
          } else {
            try {
              const groupPicUrl = await sock.profilePictureUrl(id, 'image');
              const groupPicRes = await axios.get(groupPicUrl, { responseType: 'arraybuffer' });
              bgBuffer = Buffer.from(groupPicRes.data);
            } catch (e) {
              // Group has no profile pic — use fallback image
              const fallbackPath = path.join(__dirname, 'Picsart_25-11-17_09-42-48-275.png');
              if (fs.existsSync(fallbackPath)) {
                bgBuffer = fs.readFileSync(fallbackPath);
              }
            }
          }
          
          // Build the image
          if (bgBuffer) {
            const ws = groupSettings.welcomeStyle || {};
            const textLines = [
              { text: greet().toUpperCase(), size: ws.fontSize || 48, bold: true, color: ws.textColor || '#ffffff' },
              { text: displayName, size: ws.subFontSize || 32, color: '#ffffff' },
              { text: `Member #${groupMetadata.participants.length}`, size: 24, color: '#cccccc' },
            ];
            try {
              const resultBuffer = await buildImage(bgBuffer, {
                lines: textLines,
                position: 'bottom',
                avatar: userAvatarBuf,
                avatarSize: 120,
                bg: { color: ws.bgColor || 'rgba(0,0,0,0.55)', radius: 16, padding: 28 },
              });
              await sock.sendMessage(id, { image: resultBuffer, mentions: [participantJid] });
            } catch (imgErr) {
              console.error('Welcome buildImage error:', imgErr.message);
            }
          } else {
            console.error('Welcome: no bgBuffer available');
          }
          
          // Always send the text caption too
          await sock.sendMessage(id, { text: welcomeMsg, mentions: [participantJid] });
        } catch (welcomeError) {
          // Fallback to text message if image generation fails
          console.error('Welcome image error:', welcomeError);
          let message = groupSettings.welcomeMessage || `${greet()} @user! 👋\n${lekker()} to have you in @group!`;
          message = message.replace('@user', `@${participantNumber}`);
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
          
          // Resolve display name (username > contact name > formatted phone)
          const displayName = resolveDisplayName(participantJid, participantNumber, participantInfo, sock);
          
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
          const goodbyeLines = [
            `${bold('TOTSIENS')} @${displayName} 👋`,
            '',
            `${pick(SLANG.vibe)}, we'll miss you hey.`,
            `_Go well, chommie._`,
          ];
          const goodbyeMsg = goodbyeLines.join('\n');
          
          // Fetch background image: custom > group pic > fallback
          let bgBuffer = null;
          const customGoodbyePath = path.join(__dirname, 'utils/goodbye_image.jpg');
          
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
          
          // Build the image
          if (bgBuffer) {
            const gs = groupSettings.goodbyeStyle || {};
            const textLines = [
              { text: 'TOTSIENS', size: gs.fontSize || 48, bold: true, color: gs.textColor || '#ffffff' },
              { text: displayName, size: gs.subFontSize || 32, color: '#ffffff' },
              { text: groupName, size: 24, color: '#cccccc' },
            ];
            const resultBuffer = await buildImage(bgBuffer, {
              lines: textLines,
              position: 'bottom',
              avatar: userAvatarBuf,
              avatarSize: 120,
              bg: { color: gs.bgColor || 'rgba(0,0,0,0.55)', radius: 16, padding: 28 },
            });
            await sock.sendMessage(id, { image: resultBuffer, mentions: [participantJid] });
          }
          
          // Always send the text caption too
          await sock.sendMessage(id, { text: goodbyeMsg, mentions: [participantJid] });
        } catch (goodbyeError) {
          // Fallback to simple goodbye message
          console.error('Goodbye error:', goodbyeError);
          const goodbyeMsg = `_${pick(SLANG.vibe)}_ @${participantNumber} 👋\n_Go well, chommie._ 💀`;
          
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
            text: `🚫 *ANTI-LINK WARNING ${warnCount}/${maxWarnings}*\n\n@${sender.split('@')[0]} — links are prohibited!\n\n_${remaining} more and you're out, ${pick(SLANG.friend)}._`,
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
            text: `🚫 *ANTI-GROUP MENTION WARNING ${warnCount}/${maxWarnings}*\n\n@${sender.split('@')[0]} — group mentions are prohibited!\n\n_${remaining} more and you're out, ${pick(SLANG.friend)}._`,
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
const initializeAntiCall = (sock) => {
  // Anti-call feature - reject and block incoming calls
  sock.ev.on('call', async (calls) => {
    try {
      // Reload config to get fresh settings
      delete require.cache[require.resolve('./config')];
      const config = require('./config');
      
      if (!config.defaultGroupSettings.anticall) return;

      for (const call of calls) {
        if (call.status === 'offer') {
          // Reject the call
          await sock.rejectCall(call.id, call.from);

          // Block the caller
          await sock.updateBlockStatus(call.from, 'block');

          // Notify user
          await sock.sendMessage(call.from, {
            text: `🚫 _Calls aren't allowed here. You've been blocked, ${pick(SLANG.vibe)}._`
          });
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
  findParticipant
};
