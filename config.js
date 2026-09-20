/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['0833882383', '0683993925', '0840820712', '112365605486640'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['AG KAMI'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: 'KAMI Bot Mini',
    prefix: '.',
    sessionName: 'session',
    sessionID: process.env.SESSION_ID || '',
    newsletterJid: '120363399255608558@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: 'https://github.com/AGKAMI/KAMI-Bot/archive/refs/heads/main.zip', // URL to latest code zip for .update command
    
    // Sticker Configuration
    packname: 'KAMI Bot',
    
    // Bot Behavior
    selfMode: false, // Private mode - only owner can use commands
    buttonMode: true, // Enable interactive quick-reply buttons (falls back to text when off)
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot', // set bot or all via cmd
    autoDownload: false,
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn' (warn = warn 3 times then kick)
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick', 'warn' (warn 3 times then kick)
welcome: false,
      welcomeMessage: '----------\n*KAMI BOT*\n----------\n\n👋 *HOWZIT @user!*\n\n- 💀 You\'re member #memberCount\n- ⏰ Time: time\n\n📜 *GROUP RULES*\n- No spam\n- No illegal content\n- No toxic behavior\n- Follow admin instructions\n\n⚠️ _Violators will be removed, moegoe._\n----------',
      goodbye: false,
      goodbyeMessage: '----------\n*KAMI BOT*\n----------\n\n👋 *TOTSIENS @user!*\n\n- 💀 Member count: #memberCount\n\n_Go well, chommie._\n----------',
      antiSpam: false,
      antidelete: false,
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false, // Auto-convert images/videos to stickers
      rules: '', // Group rules text
      antiflood: false, // Anti-spam/flood protection
      antifloodLimit: 5, // Max messages in time window
      antifloodWindow: 10, // Time window in seconds
      antifloodAction: 'warn', // 'warn', 'delete', 'kick'
      antibadword: false, // Auto-delete messages with bad words
      badwords: [], // List of banned words
      badwordAction: 'delete', // 'warn', 'delete', 'kick'
      slowmode: 0, // Slowmode in seconds (0 = off)
      lock: false // Lock group settings (only admins can change name/desc/pp)
    },

    // Default SA slur + profanity seed list (case-insensitive matched)
    // Loaded into groups when antibadword is first enabled, and always available via getBadwords()
    defaultBadwords: [
      // SA township / racial slurs
      'kaffir', 'kafir', 'k*****', 'hotnot', 'hottentot', 'makwerekwere', 'mkwerekwere',
      'koelie', 'coolie', 'rooinek', 'gammat', 'gam', 'bushman', 'coloured monkey',
      'bobbejaan', 'babalaas', 'nsimbi', 'inyathi', 'pampiri', 'amakwerekwere',
      'venolia', 'boesman', 'swart gevaar', 'mateketa', 'marabunta',
      // English profanity
      'fuck', 'fucking', 'fuk', 'fck', 'shit', 'shitt', 'bitch', 'bxtch', 'biatch',
      'asshole', 'aashole', 'arsehole', 'cunt', 'c*nt', 'dick', 'cock', 'pussy',
      'bastard', 'motherfucker', 'muthafucka', 'mf', 'nigg', 'nigga', 'nigger',
      'whore', 'slut', 'hoe', 'faggot', 'fag', 'twat', 'prick', 'wanker', 'wtf',
      'stfu', 'gtfo', 'fml', 'son of a bitch', 'goddamn', 'damn', 'hell no',
      'rape', 'rapist', 'retard', 'retarded', 'idiot', 'stupid bitch',
      'dumbass', 'dumb ass', 'fuckwad', 'douchebag', 'douche bag', 'skank',
      'hooligan', 'skollie', 'bergie', 'otsotsi', 'tsotsi', 'skelm', 'boer',
      'jaap', 'rooinek', 'engelsman', 'amakipkip',
      // Extended variants to catch smart ones
      's hit', 'f uck', 'b itch', 'c unt', 'sh1t', 'fuck1', 'sht', 'fk'
    ],
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ _Leka, loading..._',
      success: '✅ _Done, lekke!_',
      error: '❌ _Something went stukkend_',
      ownerOnly: '👑 _This one\'s for the owner only, chommie_',
      adminOnly: '🛡️ _Admins only — you need admin for this, shame_',
      groupOnly: '👥 _Group only — this needs a group, lekke_',
      privateOnly: '💬 _DM only — this one\'s private, yazi_',
      botAdminNeeded: '🤖 _Bot needs to be admin for this, moegoe_',
      invalidCommand: '❓ _Invalid command hey — try .menu for the list_'
    },
    
    // Timezone
    timezone: 'Africa/Johannesburg',

    // Security team groups (JID + invite link). Used for .crew apply routing,
    // admin notification, auto-add on accept, and hired DM invite link.
    crewTeams: {
      'SSRS': { name: 'Royal Security', jid: '120363402129417473@g.us', invite: 'DIOeUd6Fz1vIN5CNKf8tRB' },
      'KSSPS': { name: 'Private Security', jid: '120363421626159074@g.us', invite: 'D6LGiNbZaSEAm4KS2kErwx' },
      'KSSMP': { name: 'Metro Police', jid: '120363409819775730@g.us', invite: 'Ls0VolQePSk1kSlV5scXpD' },
      'KSSMS': { name: 'Maganyeni Security', jid: '120363423238834158@g.us', invite: 'J5SDntb5MBt8xOC5FbUujv' }
    },
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
      github: 'https://github.com/AGKAMI',
      instagram: 'https://instagram.com/ag_kami',
      youtube: 'http://youtube.com/@ag_kami'
    }
};
  