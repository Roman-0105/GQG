/**
 * Заглушка офлайн-очереди табелей на localStorage. Реальная реализация
 * Этапа 02 (docs/project-plan.md, раздел 6) должна использовать
 * IndexedDB — у localStorage мал лимит объёма и нет транзакций, но для
 * каркаса Этапа 00 достаточно, чтобы продемонстрировать принцип:
 * запись всегда пишется локально первой, синхронизация — отдельным шагом.
 */

const QUEUE_KEY = 'kern:timesheet-queue';

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
  notes?: string;
  clientCreatedAt: string;
  synced: boolean;
}

function readQueue(): QueuedTimesheet[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedTimesheet[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedTimesheet[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Хранилище недоступно (приватный режим и т.п.) — запись потеряется
    // в рамках этого черновика; TODO(frontend-dev): предупредить пользователя.
  }
}

export function enqueueTimesheet(entry: Omit<QueuedTimesheet, 'localId' | 'synced'>): QueuedTimesheet {
  const queued: QueuedTimesheet = {
    ...entry,
    localId: crypto.randomUUID(),
    synced: false,
  };
  writeQueue([...readQueue(), queued]);
  return queued;
}

export function getUnsyncedCount(): number {
  return readQueue().filter((t) => !t.synced).length;
}

export function listQueue(): QueuedTimesheet[] {
  return readQueue();
}

/**
 * Пытается отправить все несинхронизированные записи на сервер.
 * При ошибке сети запись остаётся в очереди — вызывающий код решает,
 * когда повторить (например по событию 'online').
 */
export async function syncQueue(
  send: (entry: QueuedTimesheet) => Promise<void>,
): Promise<{ synced: number; failed: number }> {
  const queue = readQueue();
  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    if (entry.synced) continue;
    try {
      await send(entry);
      entry.synced = true;
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  writeQueue(queue);
  return { synced, failed };
}
