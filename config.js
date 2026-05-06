/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['27833882383', '27683993925', '27840820712', '27726926154', '27738061962'],
    ownerName: ['KAMI Bot', 'AG KAMI'],
    
    // Whitelisted numbers (won't get blocked)
    whitelist: ['27833882383', '27683993925', '27840820712', '27726926154', '27738061962'],
    ownerContact: '+27 84 082 0712',
    
    // Bot Configuration
    botName: 'KAMI Bot',
    prefix: '.',
    sessionName: 'kami_session',
    updateZipUrl: 'https://github.com/mruniquehacker/KAMI-Bot/archive/refs/heads/main.zip',
    
    // Sticker Configuration
    packname: 'KAMI Bot',
    
    // Bot Behavior
    selfMode: true, // Private mode - only whitelisted numbers can use bot
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
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'warn', // 'delete', 'kick', 'warn'
      welcome: false,
      welcomeMessage: '━━━『 WELCOME 』━━━\nNAME: @user\nMEMBER COUNT: #memberCount\nTIME: time\n\n*@user* Welcome to *@group*!\n*Group Description*\ngroupDesc\n\n> *powered by botName*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user! We will never miss you!',
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
      github: 'https://github.com/mruniquehacker',
      instagram: 'https://instagram.com/yourusername',
      youtube: 'http://youtube.com/@mr_unique_hacker'
    }
};
  