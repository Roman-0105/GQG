/**
 * Заглушка офлайн-очереди табелей на localStorage. Реальная реализация
 * Этапа 02 (docs/project-plan.md, раздел 6) должна использовать
 * IndexedDB — у localStorage мал лимит объёма и нет транзакций, но для
 * каркаса Этапа 00 достаточно, чтобы продемонстрировать принцип:
 * запись всегда пишется локально первой, синхронизация — отдельным шагом.
 *
 * Очередь ключуется по id пользователя (queueKey), а не одним общим
 * ключом на устройство — в поле планшет часто передаётся между
 * бригадирами по смене, и без разделения по пользователю следующий
 * вошедший видел бы (и мог случайно отправить под собой) чужие
 * несинхронизированные записи (найдено security-review).
 */

function queueKey(userId: string): string {
  return `kern:timesheet-queue:${userId}`;
}

export interface QueuedTimesheet {
  localId: string;
  employeeId: string;
  siteId: string;
  crewId: string;
  workDate: string;
  workType: string;
  regularHours: number;
  overtimeHours: number;
  nightHours: number;
  metersDrilled?: number;
  isHoliday: boolean;
  notes?: string;
  clientCreatedAt: string;
  synced: boolean;
  // Снимок имён на момент заполнения — офлайн-очередь показывает их
  // сразу, не дожидаясь связи, чтобы бригадир видел "Пётр Сидоров",
  // а не голый id (список бригады тоже кэшируется с последнего онлайн-визита).
  employeeName: string;
  siteName: string;
  crewName: string;
}

function readQueue(userId: string): QueuedTimesheet[] {
  try {
    const raw = localStorage.getItem(queueKey(userId));
    return raw ? (JSON.parse(raw) as QueuedTimesheet[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, queue: QueuedTimesheet[]) {
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch {
    // Хранилище недоступно (приватный режим и т.п.) — запись потеряется
    // в рамках этого черновика; TODO(frontend-dev): предупредить пользователя.
  }
}

export function enqueueTimesheet(
  userId: string,
  entry: Omit<QueuedTimesheet, 'localId' | 'synced'>,
): QueuedTimesheet {
  const queued: QueuedTimesheet = {
    ...entry,
    localId: crypto.randomUUID(),
    synced: false,
  };
  writeQueue(userId, [...readQueue(userId), queued]);
  return queued;
}

export function getUnsyncedCount(userId: string): number {
  return readQueue(userId).filter((t) => !t.synced).length;
}

export function listQueue(userId: string): QueuedTimesheet[] {
  return readQueue(userId);
}

/**
 * Пытается отправить все несинхронизированные записи на сервер.
 * При ошибке сети запись остаётся в очереди — вызывающий код решает,
 * когда повторить (например по событию 'online'). Успешно
 * синхронизированные записи сразу удаляются, а не копятся бесконечно —
 * не хранить чужие/старые данные дольше необходимого (раздел 6 плана).
 */
export async function syncQueue(
  userId: string,
  send: (entry: QueuedTimesheet) => Promise<void>,
): Promise<{ synced: number; failed: number }> {
  const queue = readQueue(userId);
  let synced = 0;
  let failed = 0;
  const remaining: QueuedTimesheet[] = [];

  for (const entry of queue) {
    if (entry.synced) continue;
    try {
      await send(entry);
      synced += 1;
    } catch {
      failed += 1;
      remaining.push(entry);
    }
  }

  writeQueue(userId, remaining);
  return { synced, failed };
}
