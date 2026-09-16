#!/bin/bash
cd /home/container
if [[ -d .git ]]; then
  git fetch origin main
  git reset --hard origin/main
  git clean -fd
fi
if [ -f package.json ]; then
  /usr/local/bin/npm install
fi
exec /usr/local/bin/node index.js
