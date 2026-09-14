import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Textarea } from '../components/ui';
import { IconArchive, IconEdit, IconPlus, IconTeam, IconTrash } from '../components/icons';
import { PAY_TYPE_LABEL, PAY_TYPES, SHIFT_PATTERN_LABEL, SHIFT_PATTERNS, WORK_TYPE_LABEL } from '../lib/labels';
import { TimesheetPeriodsSection } from '../components/TimesheetPeriodsSection';
import { TasksSection } from '../components/TasksSection';
import { CURRENCY_SYMBOL } from '../lib/currency';

interface Site {
  id: string;
  name: string;
  code: string;
  workType: string;
  status: string;
  description?: string | null;
  client?: string | null;
  budget?: string | null;
  archivedAt?: string | null;
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
  payType: string;
}

interface Crew {
  id: string;
  name: string;
  shiftPattern: string | null;
  foreman: TeamUser | null;
  members: Employee[];
}

function EmployeeRow({
  employee,
  positions,
  onChanged,
}: {
  employee: Employee;
  positions: Position[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(employee.fullName);
  const [positionId, setPositionId] = useState(employee.position.id);
  const [payType, setPayType] = useState(employee.payType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/employees/${employee.id}`, { method: 'PATCH', body: JSON.stringify({ fullName, positionId, payType }) });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Убрать сотрудника «${employee.fullName}» из бригады?`)) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/employees/${employee.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="border-t border-line py-2 first:border-t-0 first:pt-0">
        <form onSubmit={handleSave} className="space-y-2">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={payType} onChange={(e) => setPayType(e.target.value)}>
            {PAY_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          {error && <p className="text-xs text-crit">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="group text-sm text-ink">
      <div className="flex items-center justify-between">
        <span>{employee.fullName}</span>
        <span className="flex items-center gap-2">
          <span className="text-ink-muted">
            {employee.position.name} · {PAY_TYPE_LABEL[employee.payType] ?? employee.payType}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Редактировать сотрудника"
            title="Редактировать сотрудника"
            className="text-ink-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
          >
            <IconEdit size={13} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            aria-label="Убрать сотрудника"
            title="Убрать сотрудника"
            className="text-ink-muted opacity-0 transition-opacity hover:text-crit group-hover:opacity-100"
          >
            <IconTrash size={13} />
          </button>
        </span>
      </div>
      {error && <p className="mt-0.5 text-xs text-crit">{error}</p>}
    </li>
  );
}

function CrewCard({
  crew,
  positions,
  users,
  onChanged,
}: {
  crew: Crew;
  positions: Position[];
  users: TeamUser[];
  onChanged: () => void;
}) {
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [fullName, setFullName] = useState('');
  const [positionId, setPositionId] = useState(positions[0]?.id ?? '');
  const [payType, setPayType] = useState('hourly');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(crew.name);
  const [editShift, setEditShift] = useState(crew.shiftPattern ?? '');
  const [editForemanId, setEditForemanId] = useState(crew.foreman?.id ?? '');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleAddEmployee(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/employees', {
        method: 'POST',
        body: JSON.stringify({ fullName, positionId, payType, crewId: crew.id }),
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

  async function handleSaveCrew(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditSaving(true);
    try {
      await apiFetch(`/crews/${crew.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          shiftPattern: editShift || undefined,
          foremanId: editForemanId || null,
        }),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Не удалось сохранить бригаду');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteCrew() {
    if (!window.confirm(`Удалить бригаду «${crew.name}»? Это можно сделать только если в ней нет сотрудников.`)) return;
    setDeleting(true);
    setEditError(null);
    try {
      await apiFetch(`/crews/${crew.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Не удалось удалить бригаду');
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <Card className="p-5">
        <form onSubmit={handleSaveCrew} className="space-y-3">
          <Field label="Название бригады">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </Field>
          <Field label="График">
            <Select value={editShift} onChange={(e) => setEditShift(e.target.value)}>
              <option value="">Не задан</option>
              {SHIFT_PATTERNS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Бригадир">
            <Select value={editForemanId} onChange={(e) => setEditForemanId(e.target.value)}>
              <option value="">Без бригадира</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </Field>
          {editError && <p className="text-xs text-crit">{editError}</p>}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={editSaving}>
                {editSaving ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
            <Button type="button" size="sm" variant="danger" onClick={handleDeleteCrew} disabled={deleting}>
              <IconTrash size={14} /> {deleting ? 'Удаляем…' : 'Удалить'}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">{crew.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            {crew.shiftPattern ? SHIFT_PATTERN_LABEL[crew.shiftPattern] ?? crew.shiftPattern : 'график не задан'}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Редактировать бригаду"
            title="Редактировать бригаду"
            className="text-ink-muted transition-colors hover:text-ink"
          >
            <IconEdit size={15} />
          </button>
        </div>
      </div>
      <p className="mb-3 text-sm text-ink-muted">
        Бригадир: {crew.foreman ? crew.foreman.fullName : <span className="text-warn">не назначен</span>}
      </p>

      {crew.members.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {crew.members.map((m) => (
            <EmployeeRow key={m.id} employee={m} positions={positions} onChanged={onChanged} />
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
          <Select value={payType} onChange={(e) => setPayType(e.target.value)}>
            {PAY_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
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

      <TimesheetPeriodsSection crewId={crew.id} />
    </Card>
  );
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const [editingSite, setEditingSite] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: '', code: '', workType: 'drilling', client: '', description: '', budget: '' });
  const [siteSaving, setSiteSaving] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  function loadSite() {
    if (!id) return;
    setError(null);
    apiFetch<Site>(`/sites/${id}`)
      .then((s) => {
        setSite(s);
        setSiteForm({
          name: s.name,
          code: s.code,
          workType: s.workType,
          client: s.client ?? '',
          description: s.description ?? '',
          budget: s.budget ?? '',
        });
      })
      .catch(setError);
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
      setForemanId('');
      setAddingCrew(false);
      loadCrews();
    } catch (err) {
      setCrewError(err instanceof Error ? err.message : 'Не удалось создать бригаду');
    } finally {
      setSavingCrew(false);
    }
  }

  async function handleSaveSite(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSiteError(null);
    setSiteSaving(true);
    try {
      await apiFetch(`/sites/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: siteForm.name,
          code: siteForm.code,
          workType: siteForm.workType,
          client: siteForm.client || undefined,
          description: siteForm.description || undefined,
          budget: siteForm.budget ? Number(siteForm.budget) : undefined,
        }),
      });
      setEditingSite(false);
      loadSite();
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : 'Не удалось сохранить участок');
    } finally {
      setSiteSaving(false);
    }
  }

  async function handleArchive() {
    if (!id || !site) return;
    const isArchived = Boolean(site.archivedAt);
    const confirmMessage = isArchived
      ? `Вернуть участок «${site.name}» из архива? Он снова появится в общем списке.`
      : `Архивировать участок «${site.name}»? Он пропадёт из общего списка, но все данные по нему сохранятся — можно будет найти во вкладке «Архив».`;
    if (!window.confirm(confirmMessage)) return;

    setArchiving(true);
    try {
      await apiFetch(`/sites/${id}/${isArchived ? 'unarchive' : 'archive'}`, { method: 'POST' });
      if (isArchived) {
        loadSite();
        setArchiving(false);
      } else {
        navigate('/sites');
      }
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : 'Не удалось изменить статус архивации');
      setArchiving(false);
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
        action={
          site && (
            <>
              {site.archivedAt && <Badge tone="neutral">В архиве</Badge>}
              <Button size="sm" variant="secondary" onClick={() => setEditingSite((v) => !v)}>
                <IconEdit size={15} /> Редактировать
              </Button>
              <Button size="sm" variant={site.archivedAt ? 'secondary' : 'danger'} onClick={handleArchive} disabled={archiving}>
                <IconArchive size={15} />
                {archiving ? 'Сохраняем…' : site.archivedAt ? 'Вернуть из архива' : 'Архивировать'}
              </Button>
            </>
          )
        }
      />

      {editingSite && (
        <Card className="mb-6 p-5">
          <form onSubmit={handleSaveSite} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Название">
                <Input value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} required />
              </Field>
              <Field label="Код участка">
                <Input value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Тип работ">
                <Select value={siteForm.workType} onChange={(e) => setSiteForm({ ...siteForm, workType: e.target.value })}>
                  {Object.entries(WORK_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`Бюджет, ${CURRENCY_SYMBOL}`} hint="Необязательно">
                <Input type="number" min={0} value={siteForm.budget} onChange={(e) => setSiteForm({ ...siteForm, budget: e.target.value })} />
              </Field>
            </div>
            <Field label="Клиент" hint="Необязательно">
              <Input value={siteForm.client} onChange={(e) => setSiteForm({ ...siteForm, client: e.target.value })} />
            </Field>
            <Field label="Описание" hint="Необязательно">
              <Textarea rows={3} value={siteForm.description} onChange={(e) => setSiteForm({ ...siteForm, description: e.target.value })} />
            </Field>
            {siteError && <p className="text-xs text-crit">{siteError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={siteSaving}>
                {siteSaving ? 'Сохраняем…' : 'Сохранить изменения'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditingSite(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}

      {site && (
        <TasksSection
          siteId={site.id}
          siteName={site.name}
          foremen={crews.filter((c): c is Crew & { foreman: TeamUser } => c.foreman != null).map((c) => c.foreman)}
        />
      )}

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
              <Field label="График">
                <Select value={shiftPattern} onChange={(e) => setShiftPattern(e.target.value)}>
                  <option value="">Не задан</option>
                  {SHIFT_PATTERNS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
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
          <CrewCard key={crew.id} crew={crew} positions={positions} users={users} onChanged={loadCrews} />
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
