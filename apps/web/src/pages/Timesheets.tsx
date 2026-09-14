import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getSessionUser } from '../lib/session';
import { listQueue, QueuedTimesheet } from '../lib/offlineQueue';
import { PAY_TYPE_LABEL, PERIOD_STATUS_LABEL, PERIOD_STATUS_TONE } from '../lib/labels';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Card, EmptyState, ErrorState, ListRow, SegmentedControl } from '../components/ui';
import { IconChevronLeft, IconSites, IconTeam, IconTimesheetList, IconWifiOff } from '../components/icons';

interface CrewSummary {
  id: string;
  name: string;
  siteId: string;
}

interface SiteSummary {
  id: string;
  name: string;
  code: string;
  crews: CrewSummary[];
}

interface MyCrewSummary {
  id: string;
  name: string;
  site: { id: string; name: string };
}

interface PeriodSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  payType: string;
  isClosed: boolean;
  createdBy: { fullName: string };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU');
}

/**
 * "Табеля" (бывшие "Мои табели") — раньше показывала плоский список
 * отдельных строк табеля (один на сотрудника на день), что при живой
 * бригаде превращалось в нечитаемую простыню (найдено при тестировании
 * владельцем). Теперь — навигация Участок -> Бригада -> список
 * табелей за период (открытые/закрытые), тот же принцип, что и на
 * странице участка, только для просмотра, а не редактирования состава.
 *
 * У бригадира нет права site:read (см. seed.ts — своя бригада видна и
 * так, без общего доступа к участкам), поэтому GET /sites для него
 * закономерно вернёт 403 — в этом случае страница сама переходит к его
 * бригадам напрямую (GET /crews/mine), без шага "выбрать участок".
 */
export function Timesheets() {
  const navigate = useNavigate();
  const sessionUser = getSessionUser();

  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [sitesForbidden, setSitesForbidden] = useState(false);
  const [myCrews, setMyCrews] = useState<MyCrewSummary[] | null>(null);
  const [queued, setQueued] = useState<QueuedTimesheet[]>([]);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<{ id: string; name: string } | null>(null);
  const [periods, setPeriods] = useState<PeriodSummary[] | null>(null);
  const [periodsError, setPeriodsError] = useState<unknown>(null);
  const [periodFilter, setPeriodFilter] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    apiFetch<SiteSummary[]>('/sites')
      .then(setSites)
      .catch(() => setSitesForbidden(true));
    apiFetch<MyCrewSummary[]>('/crews/mine')
      .then((crews) => {
        setMyCrews(crews);
        // Бригадир почти всегда ведёт ровно одну бригаду — не заставляем
        // лишний раз кликать по списку из одного пункта.
        if (crews.length === 1) openCrew(crews[0].id, crews[0].name);
      })
      .catch(() => setMyCrews([]));
    if (sessionUser) setQueued(listQueue(sessionUser.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCrew(crewId: string, crewName: string) {
    setSelectedCrew({ id: crewId, name: crewName });
    setPeriods(null);
    setPeriodsError(null);
    apiFetch<PeriodSummary[]>(`/timesheet-periods?crewId=${crewId}`)
      .then(setPeriods)
      .catch(setPeriodsError);
  }

  const foremanMode = sitesForbidden;
  const currentSite = sites?.find((s) => s.id === selectedSiteId) ?? null;

  const unsyncedBanner = queued.length > 0 && (
    <div className="mb-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-warn">
        <IconWifiOff size={14} /> Ждут синхронизации (только на этом устройстве)
      </h2>
      <Card className="overflow-hidden">
        {queued.map((q) => (
          <ListRow key={q.localId} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium text-ink">{q.employeeName}</span>
              <span className="ml-2 text-sm text-ink-muted">
                {q.crewName} · {q.siteName} · {q.workDate}
              </span>
            </div>
            <Badge tone="warn">не синхронизировано</Badge>
          </ListRow>
        ))}
      </Card>
    </div>
  );

  // Уровень 3: табели выбранной бригады.
  if (selectedCrew) {
    const filtered = (periods ?? []).filter((p) => {
      if (periodFilter === 'all') return true;
      return periodFilter === 'closed' ? p.isClosed : !p.isClosed;
    });

    return (
      <div className="max-w-2xl">
        <button
          type="button"
          onClick={() => (foremanMode && myCrews && myCrews.length === 1 ? navigate('/dashboard') : setSelectedCrew(null))}
          className="mb-3 flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <IconChevronLeft size={16} /> Назад {foremanMode && myCrews && myCrews.length === 1 ? '' : 'к бригадам'}
        </button>
        <PageHeader
          crumbs={
            foremanMode
              ? [{ label: 'Полевая работа' }]
              : [{ label: 'Полевая работа' }, { label: 'Табеля' }, { label: currentSite?.name ?? '' }]
          }
          title={selectedCrew.name}
          action={
            <SegmentedControl
              value={periodFilter}
              onChange={setPeriodFilter}
              options={[
                { value: 'open', label: 'Открытые' },
                { value: 'closed', label: 'Закрытые' },
                { value: 'all', label: 'Все' },
              ]}
            />
          }
        />

        {unsyncedBanner}

        <Card className="overflow-hidden">
          {periodsError ? (
            <ErrorState {...describeApiError(periodsError)} onRetry={() => openCrew(selectedCrew.id, selectedCrew.name)} />
          ) : periods === null ? (
            <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={IconTimesheetList}
              title={periodFilter === 'open' ? 'Нет открытых табелей' : periodFilter === 'closed' ? 'Нет закрытых табелей' : 'Пока нет ни одного табеля'}
              description="Сформировать новый можно на странице «Моя бригада» или на странице участка."
            />
          ) : (
            filtered.map((p) => (
              <ListRow
                key={p.id}
                className="flex cursor-pointer items-center justify-between gap-3 transition-colors hover:bg-surface-2"
              >
                <button type="button" onClick={() => navigate(`/timesheet-periods/${p.id}`)} className="flex w-full items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </span>
                    <span className="ml-2 text-xs text-ink-muted">
                      {PAY_TYPE_LABEL[p.payType] ?? p.payType} · {p.createdBy.fullName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.isClosed && <Badge tone="accent">закрыт</Badge>}
                    <Badge tone={PERIOD_STATUS_TONE[p.status] ?? 'neutral'}>{PERIOD_STATUS_LABEL[p.status] ?? p.status}</Badge>
                  </div>
                </button>
              </ListRow>
            ))
          )}
        </Card>
      </div>
    );
  }

  // Уровень 2: бригады выбранного участка (или свои бригады — бригадир).
  if (selectedSiteId || (foremanMode && myCrews !== null)) {
    const crewsToShow = foremanMode
      ? myCrews ?? []
      : currentSite?.crews ?? [];

    return (
      <div className="max-w-2xl">
        {!foremanMode && (
          <button
            type="button"
            onClick={() => setSelectedSiteId(null)}
            className="mb-3 flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <IconChevronLeft size={16} /> Назад к участкам
          </button>
        )}
        <PageHeader
          crumbs={foremanMode ? [{ label: 'Полевая работа' }] : [{ label: 'Полевая работа' }, { label: 'Табеля' }]}
          title={foremanMode ? 'Мои бригады' : currentSite?.name ?? 'Участок'}
          description={foremanMode ? 'Выберите бригаду, чтобы увидеть её табели.' : 'Выберите бригаду, чтобы увидеть её табели.'}
        />

        {unsyncedBanner}

        <Card className="overflow-hidden">
          {crewsToShow.length === 0 ? (
            <EmptyState icon={IconTeam} title="Пока нет ни одной бригады" />
          ) : (
            crewsToShow.map((c) => (
              <ListRow key={c.id} className="transition-colors hover:bg-surface-2">
                <button type="button" onClick={() => openCrew(c.id, c.name)} className="flex w-full items-center justify-between text-left">
                  <span className="font-medium text-ink">{c.name}</span>
                  {foremanMode && 'site' in c && <span className="text-xs text-ink-muted">{(c as MyCrewSummary).site.name}</span>}
                </button>
              </ListRow>
            ))
          )}
        </Card>
      </div>
    );
  }

  // Уровень 1: список участков (только для ролей с доступом к site:read).
  return (
    <div className="max-w-2xl">
      <PageHeader
        crumbs={[{ label: 'Полевая работа' }]}
        title="Табеля"
        description="Выберите участок, затем бригаду, чтобы увидеть её табели за период."
      />

      {unsyncedBanner}

      <Card className="overflow-hidden">
        {sites === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : sites.length === 0 ? (
          <EmptyState icon={IconSites} title="Пока нет ни одного участка" />
        ) : (
          sites.map((s) => (
            <ListRow key={s.id} className="transition-colors hover:bg-surface-2">
              <button type="button" onClick={() => setSelectedSiteId(s.id)} className="flex w-full items-center justify-between text-left">
                <span className="font-medium text-ink">{s.name}</span>
                <span className="text-xs text-ink-muted">{s.crews.length} бригад</span>
              </button>
            </ListRow>
          ))
        )}
      </Card>
    </div>
  );
}
