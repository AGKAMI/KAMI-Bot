# KAMI Bot — Style Guide

> Every agent touching this codebase MUST follow these rules. No exceptions.
> Consistency is non-negotiable.

---

## Message Structure Patterns

### Pattern A — Status Header + Body (most commands)

```
{emoji} {ALL-CAPS STATUS}

{body with bold labels}

_{tsotsitaal closer}_
```

**Examples:**
```
✅ SUCCESS

👤 MEMBER ADDED

🎖️ @27833882383

🏷️ Role: *officer*
📅 Joined: 20/09/2026

_Added to the crew, lekke_
```

```
❌ ERROR

You're already part of Metro Police yazi

No need to apply again
```

### Pattern B — Crew Success (structured with action emoji)

```
✅ SUCCESS

{action emoji} {ACTION NAME}

{details with emoji labels}

_{italicized tsotsitaal closer}_
```

**Action emojis:**
- Member added: `👤`
- Member removed: `👤`
- Promoted: `⬆️`
- Demoted: `⬇️`
- Role updated: `🏷️`
- Application started: `✅`
- Application submitted: `✅`
- Member accepted: `🎉`
- Application denied: `❌`

### Pattern C — Crew Error (block format)

```
❌ ERROR

{error description}

{usage/help if applicable}
```

### Pattern D — Config/Status Display

```
{emoji} {FEATURE NAME}

*Status*: ✅ Enabled / ❌ Disabled
*Action*: {value}

📱 *Usage*:
• {commands}

💡 _{tsotsitaal tip}_
```

### Pattern E — DM Document/Form (crewForms only)

```
━━━━━━━━━━━━━━━━
*BOLD TITLE*
━━━━━━━━━━━━━━━━

_{subtitle}_
{emoji} {role} {emoji}

━━━━━━━━━━━━━━━━

{content}

━━━━━━━━━━━━━━━━

{instructions}

_{tsotsitaal closer}_
```

---

## Formatting Rules

### WhatsApp Formatting

| Format | Syntax | Example |
|--------|--------|---------|
| Bold | `*text*` | `*SUCCESS*` |
| Italic | `_text_` | `_lekke_` |
| Strikethrough | `~text~` | `~removed~` |
| Mention | `@number` | `@27833882383` |
| Code/Command | `` `text` `` | `` `.crew accept <UID>` `` |

**NEVER use:**
- `**bold**` (Markdown — WhatsApp doesn't render it)
- `_italic_` with double underscores
- Box-drawing characters (`│`, `═`, `╔`) — they render as `????` on Android WhatsApp

### Command References

When a message instructs the user to run a command, always use backtick code blocks — NOT bold:

```
✅ Accept: `.crew accept SS-4FK2X`
❌ Deny: `.crew deny SS-4FK2X <reason>`
```

**NEVER use bold for command references:**
- ❌ `*.crew accept <UID>*` — bold looks like regular emphasized text
- ✅ `` `.crew accept <UID>` `` — backticks render as monospace, visually distinct as a command

### Separators

| Type | Character | Where |
|------|-----------|-------|
| Primary | `----------` (10 hyphens) | Group messages, menus, status displays |
| Heavy | `━━━━━━━━━━━━━━━━` (16 full-width) | DM documents only (application forms, hired/denied DMs) |

The primary separator is defined as `const SEP = '----------'` in `utils/format.js`.
The heavy separator is hardcoded only in `crewForms.js`.

### Labels

Always bold with colon:
```
*Label:* value
*Applicant:* 27833882383
*Team:* KSSMP
*Status:* pending
```

### Lists

Use `•` or `-` prefixes:
```
• Item one
• Item two
```

### Double Newline

Use `\n\n` to separate logical sections. Use `\n` for lines within a section.

---

## Emoji Mapping

| Category | Emoji | Usage |
|----------|-------|-------|
| Success | `✅` | All success confirmations |
| Error | `❌` | All error messages |
| Warning | `⚠️` | Warnings, cautions, status alerts |
| Info | `ℹ️` | Informational messages |
| Security | `🚫` | Security actions (kick, ban, block, anti-features) |
| Admin | `🛡️` | Admin-only permission messages |
| Owner | `👑` | Owner-only permission messages |
| Group | `👥` | Group-only context messages |
| Bot Admin | `🤖` | Bot needs to be admin |
| DM | `💬` | Private/DM-only messages |
| Loading | `⏳` | Processing/waiting messages |
| Application | `🆔` | App ID references |
| Team | `🏷️` | Team/role references |
| Member | `👤` | Member actions |
| Event | `📅` | Event-related |
| Roster | `📋` | List/view actions |
| Promote | `⬆️` | Promotion actions |
| Demote | `⬇️` | Demote actions |
| Hired | `🎉` | Acceptance celebrations |
| Denied | `❌` | Denial actions |
| Link | `🔗` | Links and invites |
| Clock | `⏰` | Time references |
| Calendar | `📅` | Date references |

---

## Role Emoji Map

| Role | Emoji |
|------|-------|
| leader | `👑` |
| co-leader | `⭐` |
| officer | `🎖️` |
| member | `👤` |

---

## Tsotsitaal Closers

Always italic. Always pick from the SLANG arrays in `utils/format.js`.

| Context | SLANG Key | Example |
|---------|-----------|---------|
| Casual closer | `SLANG.vibe` | `_{sho}, done_` |
| Success | `SLANG.good` | `✅ Done {lekke}` |
| Error | `SLANG.error` | `❌ {moegoe} — couldn't do it` |
| Addressing user | `SLANG.friend` | `Provide a team {chommie}` |
| Greeting | `SLANG.greeting` | `_{howzit}, good luck!_` |
| Goodbye | `SLANG.bye` | `_{totsiens}!_` |

**Usage in code:**
```js
const { pick, SLANG } = require('../../utils/format');
// In message:
`_${pick(SLANG.vibe)}, done_`
`❌ ${pick(SLANG.error)} — couldn't add member`
```

---

## Header Format

ALL CAPS, emojified, bold:

```
✅ SUCCESS
❌ ERROR
⚠️ WARNING
🚫 SECURITY
📋 PENDING APPLICATIONS
🏷️ TEAM MAPPED
⬆️ PROMOTED
⬇️ DEMOTED
🎉 MEMBER ACCEPTED
❌ APPLICATION DENIED
✅ APPLICATION STARTED
✅ APPLICATION SUBMITTED
```

---

## DM vs Group Differences

| Aspect | Group | DM |
|--------|-------|-----|
| Reply style | `sock.sendMessage(from, { text }, { quoted: msg })` | `sock.sendMessage(targetJid, { text })` |
| Separator | `----------` (primary) | `━━━━━━━━━━━━━━━━` (heavy, for documents) |
| Mentions | `mentions: [jid]` array required | Not needed (1:1) |
| Quote | Always quote the triggering message | No quoting |

---

## Code Style

### File Structure

```js
/**
 * Command Name — Brief description
 * Usage: .command <args>
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  subName: 'commandname',  // null if standalone
  name: null,               // null if sub-command
  aliases: ['alias'],
  category: 'crew',
  description: 'Short description',
  usage: '.command <args>',
  groupOnly: true/false,
  ownerOnly: true/false,

  async execute(sock, msg, args, extra) {
    try {
      // Implementation
    } catch (error) {
      console.error('Command error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't do the thing`);
    }
  },
};
```

### Error Messages

Always follow this pattern:
```js
await extra.reply(
  `❌ ERROR\n\n` +
  `What went wrong description\n\n` +
  `Usage: .command <args>`
);
```

### Success Messages

Always follow this pattern:
```js
await sock.sendMessage(extra.from, {
  text:
    `✅ SUCCESS\n\n` +
    `{ACTION EMOJI} {ACTION NAME}\n\n` +
    `👤 @{targetNum}\n` +
    `🏷️ Details: *value*\n\n` +
    `_{pick(SLANG.vibe)}, closer text_`,
  mentions: [targetJid],
}, { quoted: msg });
```

---

## Forbidden Patterns

1. **No box-drawing characters** — `│`, `═`, `╔`, `╗`, `╚`, `╝`, `║` render as `????` on Android
2. **No Markdown bold** — `**text**` doesn't render in WhatsApp
3. **No double underscores for italic** — `__text__` doesn't render
4. **No all-lowercase headers** — always ALL CAPS: `✅ SUCCESS` not `✅ success`
5. **No bare numbers in messages** — always format: `*27833882383*` or `@27833882383`
6. **No missing closers** — every message ends with `_{tsotsitaal closer}_`
7. **No inconsistent separators** — use `----------` for groups, `━━━━━━━━━━━━━━━━` for DM documents only
