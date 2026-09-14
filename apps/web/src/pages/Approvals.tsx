import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PAY_TYPE_LABEL, PERIOD_STATUS_LABEL, PERIOD_STATUS_TONE } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Badge, Card, EmptyState, ErrorState, ListRow } from '../components/ui';
import { IconApprovals, IconChevronLeft, IconSites, IconTeam } from '../components/icons';

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
  createdBy: { fullName: string };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU');
}

/** Зелёная точка — по этому участку/бригаде нечего рассматривать; жёлтая — есть табель(я), ожидающие решения. */
function PendingDot({ pending }: { pending: boolean }) {
  return (
    <span
      className={`absolute left-2 top-2 h-2.5 w-2.5 rounded-full ${pending ? 'bg-warn' : 'bg-good'}`}
      title={pending ? 'Есть табели на рассмотрении' : 'Все табели рассмотрены'}
    />
  );
}

/**
 * Согласование табеля за период целиком (не по каждому сотруднику/дню
 * отдельно, как было раньше — найдено при тестировании владельцем:
 * "зачем ему 100500 вкладок с этим табелем"). Показывает весь табель
 * одной таблицей — сама таблица и решение (Согласовано/Не согласовано)
 * находятся на странице табеля (TimesheetPeriodDetail), эта вкладка —
 * только навигация к нужному табелю + статус.
 *
 * Бригадир видит табели своей же бригады без выбора участка (foreman-
 * fallback, как в Timesheets.tsx) и без кнопок решения — только статус
 * (нет права timesheet_period:approve). Начальник участка/бухгалтер
 * сначала выбирают участок, затем бригаду; точка в углу карточки
 * показывает, есть ли там табели, ожидающие решения (жёлтая) или всё
 * рассмотрено (зелёная) — см. GET /timesheet-periods/pending-summary.
 */
export function Approvals() {
  const navigate = useNavigate();

  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [sitesForbidden, setSitesForbidden] = useState(false);
  const [myCrews, setMyCrews] = useState<MyCrewSummary[] | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<{ id: string; name: string } | null>(null);
  const [periods, setPeriods] = useState<PeriodSummary[] | null>(null);
  const [periodsError, setPeriodsError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<SiteSummary[]>('/sites')
      .then(setSites)
      .catch(() => setSitesForbidden(true));
    apiFetch<MyCrewSummary[]>('/crews/mine')
      .then((crews) => {
        setMyCrews(crews);
        if (crews.length === 1) openCrew(crews[0].id, crews[0].name);
      })
      .catch(() => setMyCrews([]));
    apiFetch<Record<string, number>>('/timesheet-periods/pending-summary')
      .then(setPending)
      .catch(() => setPending({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCrew(crewId: string, crewName: string) {
    setSelectedCrew({ id: crewId, name: crewName });
    setPeriods(null);
    setPeriodsError(null);
    apiFetch<PeriodSummary[]>(`/timesheet-periods?crewId=${crewId}`)
      .then((all) => setPeriods(all.filter((p) => p.status !== 'draft')))
      .catch(setPeriodsError);
  }

  const foremanMode = sitesForbidden;
  const currentSite = sites?.find((s) => s.id === selectedSiteId) ?? null;
  const sitePending = (site: SiteSummary) => site.crews.some((c) => (pending[c.id] ?? 0) > 0);

  // Уровень 3: табели выбранной бригады, отправленные на согласование или уже рассмотренные.
  if (selectedCrew) {
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
              : [{ label: 'Полевая работа' }, { label: 'Согласование' }, { label: currentSite?.name ?? '' }]
          }
          title={selectedCrew.name}
        />

        <Card className="overflow-hidden">
          {periodsError ? (
            <ErrorState {...describeApiError(periodsError)} onRetry={() => openCrew(selectedCrew.id, selectedCrew.name)} />
          ) : periods === null ? (
            <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
          ) : periods.length === 0 ? (
            <EmptyState icon={IconApprovals} title="Нет отправленных табелей" description="Здесь появятся табели сразу после отправки бригадиром." />
          ) : (
            periods.map((p) => (
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
                  <Badge tone={PERIOD_STATUS_TONE[p.status] ?? 'neutral'}>{PERIOD_STATUS_LABEL[p.status] ?? p.status}</Badge>
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
    const crewsToShow = foremanMode ? myCrews ?? [] : currentSite?.crews ?? [];

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
          crumbs={foremanMode ? [{ label: 'Полевая работа' }] : [{ label: 'Полевая работа' }, { label: 'Согласование' }]}
          title={foremanMode ? 'Мои бригады' : currentSite?.name ?? 'Участок'}
          description="Выберите бригаду, чтобы увидеть её табели."
        />

        <Card className="overflow-hidden">
          {crewsToShow.length === 0 ? (
            <EmptyState icon={IconTeam} title="Пока нет ни одной бригады" />
          ) : (
            crewsToShow.map((c) => (
              <ListRow key={c.id} className="relative transition-colors hover:bg-surface-2">
                {!foremanMode && <PendingDot pending={(pending[c.id] ?? 0) > 0} />}
                <button type="button" onClick={() => openCrew(c.id, c.name)} className="flex w-full items-center justify-between pl-3 text-left">
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
        title="Согласование"
        description="Выберите участок, затем бригаду, чтобы рассмотреть отправленные табели."
      />

      <Card className="overflow-hidden">
        {sites === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : sites.length === 0 ? (
          <EmptyState icon={IconSites} title="Пока нет ни одного участка" />
        ) : (
          sites.map((s) => (
            <ListRow key={s.id} className="relative transition-colors hover:bg-surface-2">
              <PendingDot pending={sitePending(s)} />
              <button type="button" onClick={() => setSelectedSiteId(s.id)} className="flex w-full items-center justify-between pl-3 text-left">
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
