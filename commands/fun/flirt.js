/**
 * Flirt - Get a random flirty message from API
 */

module.exports = {
    name: 'flirt',
    aliases: ['pickup', 'pickupline'],
    category: 'fun',
    desc: 'Get a random flirty pickup line',
    usage: 'flirt [@user]',
    execute: async (sock, msg, args, extra) => {
      try {
        // Fetch flirt message from API
        const flirtText = [
      'Your hand looks heavy — can I hold it for you? 💫',
      'If you were a vegetable, you’d be a cute-cumber.',
      'I was wondering if you had an extra heart. Mine seems to have been stolen.',
      'Do you believe in love at first swipe?',
      'You’re the reason my code keeps throwing “happy” exceptions.',
    ][Math.floor(Math.random() * 5)];
        
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        if (mentioned.length > 0) {
          await sock.sendMessage(extra.from, {
            text: flirtText,
            mentions: mentioned
          }, { quoted: msg });
        } else {
          await extra.reply(flirtText);
        }
        
      } catch (error) {
        console.error('Flirt Error:', error);
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  