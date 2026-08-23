@echo off
pnpm exec concurrently -k "pnpm --filter @agentic-video-editor/desktop-backend dev" "pnpm --filter @agentic-video-editor/desktop-frontend dev"
