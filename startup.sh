#!/bin/bash
cd /home/container

# Preserve custom welcome/goodbye images across deploys
if [[ -d .git ]]; then
  mkdir -p /tmp/bot_images
  [ -f utils/welcome_image.jpg ] && cp utils/welcome_image.jpg /tmp/bot_images/
  [ -f utils/goodbye_image.jpg ] && cp utils/goodbye_image.jpg /tmp/bot_images/

  git fetch origin main
  git reset --hard origin/main
  git clean -fd

  # Restore custom images
  [ -f /tmp/bot_images/welcome_image.jpg ] && cp /tmp/bot_images/welcome_image.jpg utils/
  [ -f /tmp/bot_images/goodbye_image.jpg ] && cp /tmp/bot_images/goodbye_image.jpg utils/
  rm -rf /tmp/bot_images
fi
if [ -f package.json ]; then
  /usr/local/bin/npm install
fi
exec /usr/local/bin/node index.js
