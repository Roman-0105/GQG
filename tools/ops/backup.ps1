# tools/ops/backup.ps1
#
# Тонкая обёртка над tools/ops/backup.js для запуска из Планировщика
# заданий Windows (Task Scheduler) — вся логика (pg_dump, ротация) в
# самом backup.js, здесь только находим корень репозитория и запускаем
# node. См. docs/ops-runbook.md, раздел "Автоматический бэкап по
# расписанию (Windows)".
#
# Ручной запуск:
#   powershell -File tools\ops\backup.ps1
#
# В Планировщике заданий: действие "Запуск программы"
#   Программа:   powershell.exe
#   Аргументы:   -NoProfile -ExecutionPolicy Bypass -File "D:\Projects\GQS\tools\ops\backup.ps1"
#   Рабочая папка: D:\Projects\GQS

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Set-Location $repoRoot
node "tools/ops/backup.js"
exit $LASTEXITCODE
