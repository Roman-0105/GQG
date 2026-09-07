/**
 * Мини-парсер .env-файла без внешних зависимостей — намеренно не тянем
 * пакет `dotenv` в корневой package.json (в apps/api он уже есть, но
 * это отдельный workspace) ради одного вспомогательного скрипта.
 * Понимает только простой случай KEY=VALUE (с необязательными
 * кавычками) и комментарии — этого достаточно для .env.example из
 * этого репозитория. НЕ предназначен для парсинга произвольных
 * .env-файлов с многострочными значениями и т.п.
 */
const fs = require('fs');

function readEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

module.exports = { readEnvFile };
