#!/bin/bash
cd "$(dirname "$0")"

if lsof -i :8080 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Server already running on port 8080"
else
  node server.js &
  echo "Server started on port 8080"
  sleep 0.5
fi

open http://localhost:8080
