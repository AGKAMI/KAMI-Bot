/**
 * Command Loader - Separate module to avoid circular dependencies
 */

const fs = require('fs');
const path = require('path');

// Load all commands
const loadCommands = () => {
  const commands = new Map();
  const commandsPath = path.join(__dirname, '..', 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    console.log('Commands directory not found');
    return commands;
  }
  
  const categories = fs.readdirSync(commandsPath);
  
  categories.forEach(category => {
    const categoryPath = path.join(commandsPath, category);
    if (fs.statSync(categoryPath).isDirectory()) {
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
      
      files.forEach(file => {
        try {
          const command = require(path.join(categoryPath, file));
          if (command.name) {
            // Last-write-wins silently hid real commands behind aliases
            // (.setpp, .setname, .stats, .math, .sm all collided) — shout
            // when a key gets overridden so the next collision is visible.
            if (commands.has(command.name)) {
              console.warn(`[COMMANDS] name "${command.name}" from ${category}/${file} overrides an earlier command`);
            }
            commands.set(command.name, command);
            if (command.aliases) {
              command.aliases.forEach(alias => {
                if (commands.has(alias)) {
                  console.warn(`[COMMANDS] alias "${alias}" from ${category}/${file} overrides an earlier command`);
                }
                commands.set(alias, command);
              });
            }
          }
        } catch (error) {
          console.error(`Error loading command ${file}:`, error.message);
        }
      });
    }
  });
  
  return commands;
};

module.exports = { loadCommands };

