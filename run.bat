@echo off
set PRISMA_TELEMETRY_DISABLED=1
set PATH=%PATH%;C:\Program Files\nodejs\
call "C:\Program Files\nodejs\npx.cmd" prisma db push --accept-data-loss
call "C:\Program Files\nodejs\npm.cmd" run dev
