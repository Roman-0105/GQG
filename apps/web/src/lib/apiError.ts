import { ApiError } from './api';

export interface ErrorInfo {
  title: string;
  description: string;
  canRetry: boolean;
}

/**
 * Переводит ошибку запроса в понятную пользователю формулировку —
 * "без голых технических сообщений". Конкретный текст бэкенда (если
 * он есть и не является кодом/страховкой) используется как дополнение,
 * а не как единственное сообщение.
 */
export function describeApiError(err: unknown): ErrorInfo {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return {
        title: 'Сессия закончилась',
        description: 'Войдите ещё раз, чтобы продолжить работу.',
        canRetry: false,
      };
    }
    if (err.status === 403) {
      return {
        title: 'Раздел недоступен вашей роли',
        description: 'Похоже, этот раздел не входит в область видимости вашей роли. Если доступ нужен — обратитесь к владельцу компании или администратору.',
        canRetry: false,
      };
    }
    if (err.status === 404) {
      return {
        title: 'Не найдено',
        description: 'Запись могла быть удалена или ещё не создана.',
        canRetry: false,
      };
    }
    if (err.status >= 500) {
      return {
        title: 'Сбой на сервере',
        description: 'Попробуйте ещё раз через минуту. Если повторяется — сообщите администратору платформы.',
        canRetry: true,
      };
    }
    return {
      title: 'Не удалось выполнить запрос',
      description: err.message || 'Проверьте введённые данные и попробуйте снова.',
      canRetry: true,
    };
  }

  return {
    title: 'Нет связи с сервером',
    description: 'Проверьте подключение к интернету и повторите попытку.',
    canRetry: true,
  };
}
