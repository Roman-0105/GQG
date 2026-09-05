import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, EmptyState, ErrorState, Field, Input, Select } from '../components/ui';
import { IconPlus, IconTeam } from '../components/icons';

interface Site {
  id: string;
  name: string;
  code: string;
  workType: string;
  status: string;
  description?: string | null;
}

interface Position {
  id: string;
  name: string;
}

interface TeamUser {
  id: string;
  fullName: string;
}

interface Employee {
  id: string;
  fullName: string;
  position: Position;
}

interface Crew {
  id: string;
  name: string;
  shiftPattern: string | null;
  foreman: TeamUser | null;
  members: Employee[];
}

const WORK_TYPE_LABEL: Record<string, string> = {
  geology: 'Геология',
  geotech: 'Геотехника',
  drilling: 'Бурение',
  mixed: 'Смешанный',
};

function CrewCard({ crew, positions, onChanged }: { crew: Crew; positions: Position[]; onChanged: () => void }) {
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [fullName, setFullName] = useState('');
  const [positionId, setPositionId] = useState(positions[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAddEmployee(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/employees', {
        method: 'POST',
        body: JSON.stringify({ fullName, positionId, crewId: crew.id }),
      });
      setFullName('');
      setAddingEmployee(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить сотрудника');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">{crew.name}</h3>
        <span className="text-xs text-ink-muted">{crew.shiftPattern ?? 'график не задан'}</span>
      </div>
      <p className="mb-3 text-sm text-ink-muted">
        Бригадир: {crew.foreman ? crew.foreman.fullName : <span className="text-warn">не назначен</span>}
      </p>

      {crew.members.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {crew.members.map((m) => (
            <li key={m.id} className="flex justify-between text-sm text-ink">
              <span>{m.fullName}</span>
              <span className="text-ink-muted">{m.position.name}</span>
            </li>
          ))}
        </ul>
      )}

      {addingEmployee ? (
        <form onSubmit={handleAddEmployee} className="space-y-2.5 border-t border-line pt-3">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ФИО сотрудника" required />
          <Select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {error && <p className="text-xs text-crit">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Добавляем…' : 'Сохранить'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAddingEmployee(false)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAddingEmployee(true)} className="!px-0">
          <IconPlus size={15} /> Добавить сотрудника
        </Button>
      )}
    </Card>
  );
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [error, setError] = useState<unknown>(null);

  const [addingCrew, setAddingCrew] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [shiftPattern, setShiftPattern] = useState('');
  const [foremanId, setForemanId] = useState('');
  const [savingCrew, setSavingCrew] = useState(false);
  const [crewError, setCrewError] = useState<string | null>(null);

  function loadSite() {
    if (!id) return;
    setError(null);
    apiFetch<Site>(`/sites/${id}`).then(setSite).catch(setError);
  }

  function loadCrews() {
    if (!id) return;
    apiFetch<Crew[]>(`/crews?siteId=${id}`).then(setCrews).catch(() => {});
  }

  useEffect(() => {
    if (!id) return;
    loadSite();
    apiFetch<Position[]>('/positions').then(setPositions).catch(() => {});
    apiFetch<TeamUser[]>('/users').then(setUsers).catch(() => {});
    loadCrews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddCrew(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setCrewError(null);
    setSavingCrew(true);
    try {
      await apiFetch('/crews', {
        method: 'POST',
        body: JSON.stringify({ siteId: id, name: crewName, shiftPattern: shiftPattern || undefined, foremanId: foremanId || undefined }),
      });
      setCrewName('');
      setShiftPattern('');
      setAddingCrew(false);
      loadCrews();
    } catch (err) {
      setCrewError(err instanceof Error ? err.message : 'Не удалось создать бригаду');
    } finally {
      setSavingCrew(false);
    }
  }

  if (error) {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Администрирование' }, { label: 'Участки', to: '/sites' }]} title="Участок" />
        <ErrorState {...describeApiError(error)} onRetry={loadSite} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        crumbs={[{ label: 'Администрирование' }, { label: 'Участки', to: '/sites' }]}
        title={site?.name ?? '…'}
        description={
          site ? `${WORK_TYPE_LABEL[site.workType] ?? site.workType}${site.description ? ` · ${site.description}` : ''}` : undefined
        }
      />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">Бригады</h2>
        {!addingCrew && (
          <Button size="sm" variant="secondary" onClick={() => setAddingCrew(true)}>
            <IconPlus size={15} /> Новая бригада
          </Button>
        )}
      </div>

      {addingCrew && (
        <Card className="mb-4 p-5">
          <form onSubmit={handleAddCrew} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Название бригады">
                <Input value={crewName} onChange={(e) => setCrewName(e.target.value)} required />
              </Field>
              <Field label="График" hint="напр. вахта 15/15">
                <Input value={shiftPattern} onChange={(e) => setShiftPattern(e.target.value)} />
              </Field>
            </div>
            <Field label="Бригадир">
              <Select value={foremanId} onChange={(e) => setForemanId(e.target.value)}>
                <option value="">Без бригадира (назначить позже)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            {users.length === 0 && (
              <p className="text-xs text-warn">
                Пока нет ни одного логина для назначения бригадиром — добавьте на странице «Команда».
              </p>
            )}
            {crewError && <p className="text-xs text-crit">{crewError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={savingCrew}>
                {savingCrew ? 'Создаём…' : 'Создать бригаду'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAddingCrew(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}

      {crews.length === 0 && !addingCrew && (
        <EmptyState icon={IconTeam} title="На этом участке пока нет бригад" description="Создайте первую бригаду кнопкой выше." />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {crews.map((crew) => (
          <CrewCard key={crew.id} crew={crew} positions={positions} onChanged={loadCrews} />
        ))}
      </div>

      {positions.length === 0 && crews.length > 0 && (
        <p className="mt-4 text-xs text-warn">
          Нет ни одной должности — прежде чем добавлять сотрудников, заведите их на странице «Должности».
        </p>
      )}
    </div>
  );
}
