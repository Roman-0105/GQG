import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

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
    <div className="bg-surface border border-line rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-medium text-ink">{crew.name}</h3>
        <span className="text-xs text-ink-muted">{crew.shiftPattern ?? 'график не задан'}</span>
      </div>
      <p className="text-sm text-ink-muted mb-3">
        Бригадир: {crew.foreman ? crew.foreman.fullName : <span className="text-warn">не назначен</span>}
      </p>

      {crew.members.length > 0 && (
        <ul className="mb-3 space-y-1">
          {crew.members.map((m) => (
            <li key={m.id} className="text-sm text-ink flex justify-between">
              <span>{m.fullName}</span>
              <span className="text-ink-muted">{m.position.name}</span>
            </li>
          ))}
        </ul>
      )}

      {addingEmployee ? (
        <form onSubmit={handleAddEmployee} className="space-y-2 border-t border-line pt-3">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="ФИО сотрудника"
            required
            className="w-full px-3 py-1.5 text-sm rounded border border-line bg-surface-2 text-ink"
          />
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="w-full px-3 py-1.5 text-sm rounded border border-line bg-surface-2 text-ink">
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {error && <p className="text-xs text-crit">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="text-sm py-1.5 px-3 rounded bg-accent text-white disabled:opacity-60">
              {saving ? 'Добавляем…' : 'Сохранить'}
            </button>
            <button type="button" onClick={() => setAddingEmployee(false)} className="text-sm py-1.5 px-3 rounded border border-line text-ink-muted">
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAddingEmployee(true)} className="text-sm text-accent-2 font-medium">
          + Добавить сотрудника
        </button>
      )}
    </div>
  );
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [addingCrew, setAddingCrew] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [shiftPattern, setShiftPattern] = useState('');
  const [foremanId, setForemanId] = useState('');
  const [savingCrew, setSavingCrew] = useState(false);
  const [crewError, setCrewError] = useState<string | null>(null);

  function loadCrews() {
    if (!id) return;
    apiFetch<Crew[]>(`/crews?siteId=${id}`).then(setCrews).catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить бригады'));
  }

  useEffect(() => {
    if (!id) return;
    apiFetch<Site>(`/sites/${id}`).then(setSite).catch((err) => setError(err instanceof Error ? err.message : 'Участок не найден'));
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
      <div className="min-h-screen bg-bg p-8">
        <p className="text-crit">{error}</p>
        <Link to="/sites" className="text-accent-2 text-sm">← К списку участков</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/sites" className="text-sm text-accent-2 mb-4 inline-block">← К списку участков</Link>

        {site && (
          <div className="mb-8">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold text-ink">{site.name}</h1>
              <span className="text-xs font-mono text-ink-muted">{site.code}</span>
            </div>
            <p className="text-sm text-ink-muted mt-1">
              {WORK_TYPE_LABEL[site.workType] ?? site.workType}
              {site.description && ` · ${site.description}`}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-ink">Бригады</h2>
          {!addingCrew && (
            <button onClick={() => setAddingCrew(true)} className="text-sm text-accent-2 font-medium">
              + Новая бригада
            </button>
          )}
        </div>

        {addingCrew && (
          <form onSubmit={handleAddCrew} className="bg-surface border border-line rounded-lg p-5 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input value={crewName} onChange={(e) => setCrewName(e.target.value)} placeholder="Название бригады" required className="px-3 py-2 rounded border border-line bg-surface-2 text-ink text-sm" />
              <input value={shiftPattern} onChange={(e) => setShiftPattern(e.target.value)} placeholder="График, напр. вахта 15/15" className="px-3 py-2 rounded border border-line bg-surface-2 text-ink text-sm" />
            </div>
            <select value={foremanId} onChange={(e) => setForemanId(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink text-sm">
              <option value="">Без бригадира (назначить позже)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
            {users.length === 0 && (
              <p className="text-xs text-warn">
                Пока нет ни одного логина для назначения бригадиром — добавьте на странице{' '}
                <Link to="/team" className="underline">Команда</Link>.
              </p>
            )}
            {crewError && <p className="text-xs text-crit">{crewError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={savingCrew} className="text-sm py-1.5 px-3 rounded bg-accent text-white disabled:opacity-60">
                {savingCrew ? 'Создаём…' : 'Создать бригаду'}
              </button>
              <button type="button" onClick={() => setAddingCrew(false)} className="text-sm py-1.5 px-3 rounded border border-line text-ink-muted">
                Отмена
              </button>
            </div>
          </form>
        )}

        {crews.length === 0 && !addingCrew && (
          <p className="text-sm text-ink-muted">На этом участке пока нет бригад.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {crews.map((crew) => (
            <CrewCard key={crew.id} crew={crew} positions={positions} onChanged={loadCrews} />
          ))}
        </div>

        {positions.length === 0 && crews.length > 0 && (
          <p className="text-xs text-warn mt-4">
            Нет ни одной должности — прежде чем добавлять сотрудников, заведите их на странице{' '}
            <Link to="/positions" className="underline">Должности</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
