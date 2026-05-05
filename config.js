/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['0840820712', '0833882383', '0683993925', '112365605486640'], // Add your number without + or spaces (e.g., 919876543210)
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
      welcomeMessage: '╭━━━≪ KAMI BOT ≫━━━╮\n\n👋 *NEW MEMBER JOINED*\n\n┌─ ✦\n│ 👤 Welcome, @user!\n│ 💀 You are member #memberCount\n│ ⏰ Time: time\n└───────────────────────\n\n📜 *GROUP RULES*\n│ • No spam\n│ • No illegal content\n│ • No toxic behavior\n│ • Follow admin instructions\n\n⚠️ Violators will be removed.\n\n> *Powered by KAMI Bot*',
      goodbye: false,
      goodbyeMessage: '╭━━━≪ KAMI BOT ≫━━━╮\n\n👋 *MEMBER LEFT*\n\n@user has left the group.\n\n💀 Member count: #memberCount\n\n> *Powered by KAMI Bot*',
      antiSpam: false,
      antidelete: false,
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false // Auto-convert images/videos to stickers
    },
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },
    
    // Timezone
    timezone: 'Asia/Kolkata',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
      github: 'https://github.com/AGKAMI',
      instagram: 'https://instagram.com/ag_kami',
      youtube: 'http://youtube.com/@ag_kami'
    }
};
  