/**
 * Единая точка получения JWT-секрета. Пока не было проверки — сервер
 * при отсутствующей переменной окружения тихо подписывал токены
 * захардкоженной строкой из исходников (найдено security-review перед
 * Этапом 02). Теперь при отсутствии или использовании
 * значения-заглушки из .env.example приложение отказывается стартовать
 * — лучше явный сбой при запуске, чем токены, которые может подделать
 * кто угодно, кто читал этот репозиторий.
 */
const INSECURE_PLACEHOLDERS = new Set(['change-me-before-any-real-deployment', 'change-me', '']);

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || INSECURE_PLACEHOLDERS.has(secret)) {
    throw new Error(
      'JWT_SECRET не задан или равен значению-заглушке из .env.example. ' +
        'Сгенерируйте случайный секрет (например: openssl rand -hex 32) ' +
        'и укажите его в apps/api/.env перед запуском.',
    );
  }
  return secret;
}
