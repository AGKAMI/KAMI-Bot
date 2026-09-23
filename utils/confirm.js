/**
 * Confirm - Button-style confirmation for dangerous commands
 * Usage: Used internally by other commands
 */

async function confirm(sock, chatId, msg, text, onConfirm, onCancel) {
  // WhatsApp deprecated buttons - use reactions + reply instead
  await sock.sendMessage(chatId, {
    text: `⚠️ *Confirmation Required*\n\n${text}\n\nReact with ✅ to confirm or ❌ to cancel.`,
    mentions: [msg.key.participant || msg.key.remoteJid]
  }, { quoted: msg });

  // Wait for reaction
  return new Promise((resolve) => {
    let settled = false;

    const handler = (update) => {
      if (settled) return;
      const reaction = update.reactions?.[0];
      if (!reaction) return;
      
      const jid = reaction.key?.participant || reaction.key?.remoteJid;
      
      if (jid !== (msg.key.participant || msg.key.remoteJid)) return;
      if (reaction.message?.reactionMessage?.text === '✅') {
        settled = true;
        sock.ev.off('messages.update', handler);
        resolve(true);
        if (onConfirm) {
          try { onConfirm(); } catch (e) { console.error('[confirm] onConfirm error:', e.message); }
        }
      } else if (reaction.message?.reactionMessage?.text === '❌') {
        settled = true;
        sock.ev.off('messages.update', handler);
        resolve(false);
        if (onCancel) {
          try { onCancel(); } catch (e) { console.error('[confirm] onCancel error:', e.message); }
        }
      }
    };

    // Timeout after 30 seconds
    setTimeout(() => {
      if (settled) return;
      settled = true;
      sock.ev.off('messages.update', handler);
      resolve(false);
    }, 30000);
  });
}

module.exports = { confirm };
