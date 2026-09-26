import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Network, UserPlus, UserCircle2, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement, ROLE_LABELS, ROLE_OPTIONS, type UserRole } from '../../types/roles'
import { createUserFromScratch } from '../../lib/grantAccess'
import type { DrillingOrganization, Position, Profile, Worker } from '../../types/database'
import {
  buildPersonNodes,
  collectDescendantKeys,
  parsePersonValue,
  profileValue,
  reportsToValue,
  workerValue,
  type PersonKind,
} from '../../lib/personRef'
import Modal from '../../components/Modal'
import PersonSelect from '../../components/PersonSelect'
import PanZoomViewport from '../../components/PanZoomViewport'

// Узел схемы — конкретный человек (profile или worker) с назначенной
// должностью, не абстрактный "слот" (см. CLAUDE.md, переход на
// person-centric модель 25.09.2026). Видимость в схеме ⟺ position_id
// задан у самого человека — редактируется в "Пользователях"/"Работниках"
// ИЛИ прямо здесь через ту же форму (два входа, одна правда).
interface ChartPerson {
  key: string
  kind: PersonKind
  id: string
  fullName: string
  positionId: string
  positionName: string
  reportsToKey: string | null
  role: Profile['role'] | null
}

interface NodeProps {
  person: ChartPerson
  childrenByParent: Map<string | null, ChartPerson[]>
  onSelect: (p: ChartPerson) => void
}

function OrgNode({ person, childrenByParent, onSelect }: NodeProps) {
  const kids = childrenByParent.get(person.key) ?? []
  return (
    <li>
      <button
        type="button"
        className={`org-node-btn${person.role === 'party_chief' ? ' org-node-flagged' : ''}`}
        onClick={() => onSelect(person)}
      >
        <span className="org-node-title">{person.positionName}</span>
        <span className="org-node-worker">
          {person.fullName}
          {person.role && ` — ${ROLE_LABELS[person.role]}`}
        </span>
      </button>
      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <OrgNode key={k.key} person={k} childrenByParent={childrenByParent} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

// Организационная структура компании (22.09.2026, редизайн 25.09.2026 —
// переход от независимого дерева "вакантных должностей" к дереву,
// построенному напрямую из profiles/workers: должность и "руководитель" —
// поля самого человека, редактируются как здесь, так и в "Пользователях"/
// "Работниках" — правки синхронизированы в обе стороны, т.к. это одни и
// те же колонки БД. Прямое следствие отказа от вакансий (решение
// владельца 25.09.2026): человек без должности просто не появляется в
// схеме, пока её не назначат.
export default function OrgChart() {
  const { session, profile, loading: authLoading } = useAuth()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<ChartPerson | null>(null)
  const [editPositionId, setEditPositionId] = useState('')
  const [editReportsTo, setEditReportsTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // "+ Добавить человека" (25.09.2026, по запросу владельца — не все
  // существующие люди попадали в схему, и заводить их приходилось на
  // других экранах). Создание намеренно НЕ спрашивает должность/
  // руководителя сразу — новый человек появляется ниже, в разделе "Без
  // назначенной должности", и назначается туда отдельным кликом (тот же
  // openNode/handleSave, что и для узлов дерева).
  const [addPersonOpen, setAddPersonOpen] = useState(false)
  const [addKind, setAddKind] = useState<'worker' | 'profile'>('worker')
  const [addFullName, setAddFullName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState<UserRole>('party_chief')
  const [addOrganizationId, setAddOrganizationId] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccessMsg, setAddSuccessMsg] = useState<string | null>(null)

  const canEdit = isManagement(profile?.role)

  async function load() {
    setLoading(true)
    const [profilesRes, workersRes, positionsRes, orgsRes] = await Promise.all([
      // .neq('role', 'developer') — доп. подстраховка сверх RLS: RLS и так
      // прячет профиль-разработчика от гендира/техдира, но если это окно
      // открыл сам разработчик, он увидел бы себя (id = auth.uid() всегда
      // проходит) и мог бы случайно назначить себя на видимую должность —
      // а он должен оставаться невидимым в схеме в любом случае.
      supabase.from('profiles').select('*').neq('role', 'developer').order('full_name'),
      supabase.from('workers').select('*').order('full_name'),
      supabase.from('positions').select('*').order('name'),
      supabase.from('drilling_organizations').select('*').order('name'),
    ])
    if (profilesRes.error) setError(profilesRes.error.message)
    setProfiles(profilesRes.data ?? [])
    setWorkers(workersRes.data ?? [])
    setPositions(positionsRes.data ?? [])
    setOrganizations(orgsRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (session) load()
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

  const positionName = (id: string | null) => positions.find((p) => p.id === id)?.name ?? '—'

  const allPeople = buildPersonNodes(profiles, workers)

  const chartPeople: ChartPerson[] = [
    ...profiles
      .filter((p) => p.position_id)
      .map((p) => ({
        key: profileValue(p.id),
        kind: 'profile' as const,
        id: p.id,
        fullName: p.full_name,
        positionId: p.position_id as string,
        positionName: positionName(p.position_id),
        reportsToKey: reportsToValue(p.reports_to_profile_id, p.reports_to_worker_id) || null,
        role: p.role,
      })),
    ...workers
      // Архивный работник не должен висеть в схеме отдельным узлом — это
      // либо человек, ушедший из штата, либо (с 25.09.2026) работник,
      // которому "выдали доступ" (см. grantAccessToWorker): его запись
      // архивируется и должность обнуляется, но на случай, если должность
      // почему-то ещё не очищена, фильтруем и по archived_at тоже.
      .filter((w) => w.position_id && !w.archived_at)
      .map((w) => ({
        key: workerValue(w.id),
        kind: 'worker' as const,
        id: w.id,
        fullName: w.full_name,
        positionId: w.position_id as string,
        positionName: positionName(w.position_id),
        reportsToKey: reportsToValue(w.reports_to_profile_id, w.reports_to_worker_id) || null,
        role: null,
      })),
  ]

  // "Без назначенной должности" (25.09.2026) — люди, которые уже есть в
  // системе, но не показаны в дереве выше просто потому, что им никто не
  // назначил должность (частый случай: человека когда-то завели в
  // "Пользователях"/"Работниках" в обход оргструктуры). Та же форма
  // "должность + руководитель", что у узлов дерева — openNode ниже
  // принимает ChartPerson с пустым positionId одинаково хорошо.
  const unassignedPeople: ChartPerson[] = [
    ...profiles
      .filter((p) => !p.position_id)
      .map((p) => ({
        key: profileValue(p.id),
        kind: 'profile' as const,
        id: p.id,
        fullName: p.full_name,
        positionId: '',
        positionName: '',
        reportsToKey: reportsToValue(p.reports_to_profile_id, p.reports_to_worker_id) || null,
        role: p.role,
      })),
    ...workers
      .filter((w) => !w.position_id && !w.archived_at)
      .map((w) => ({
        key: workerValue(w.id),
        kind: 'worker' as const,
        id: w.id,
        fullName: w.full_name,
        positionId: '',
        positionName: '',
        reportsToKey: reportsToValue(w.reports_to_profile_id, w.reports_to_worker_id) || null,
        role: null,
      })),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName))

  const visibleKeys = new Set(chartPeople.map((p) => p.key))
  const childrenByParent = new Map<string | null, ChartPerson[]>()
  for (const p of chartPeople) {
    // Руководитель без своей должности не показан в схеме — считаем такого
    // человека корнем (его подчинённые всё равно должны быть видны).
    const parentKey = p.reportsToKey && visibleKeys.has(p.reportsToKey) ? p.reportsToKey : null
    const list = childrenByParent.get(parentKey) ?? []
    list.push(p)
    childrenByParent.set(parentKey, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.fullName.localeCompare(b.fullName))
  }
  const roots = childrenByParent.get(null) ?? []

  function openNode(p: ChartPerson) {
    setSelected(p)
    setEditPositionId(p.positionId)
    setEditReportsTo(p.reportsToKey ?? '')
    setSaveError(null)
  }

  function closeNode() {
    setSelected(null)
  }

  // Тот же приём, что в Users/WorkersSettings — нельзя назначить
  // руководителем самого себя или своего же подчинённого (иерархия
  // зациклится). Считаем по ПОЛНОМУ списку людей (includes без должности),
  // т.к. цикл возможен и через невидимое сейчас звено.
  const excludeKeys = selected ? collectDescendantKeys(selected.key, allPeople) : new Set<string>()

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    const reportsTo = parsePersonValue(editReportsTo)
    const table = selected.kind === 'profile' ? 'profiles' : 'workers'
    const { data, error: updateError } = await supabase
      .from(table)
      .update({
        position_id: editPositionId || null,
        reports_to_profile_id: reportsTo?.kind === 'profile' ? reportsTo.id : null,
        reports_to_worker_id: reportsTo?.kind === 'worker' ? reportsTo.id : null,
      })
      .eq('id', selected.id)
      .select()
      .single()
    setSaving(false)
    if (updateError) {
      setSaveError(updateError.message)
      return
    }
    if (selected.kind === 'profile') {
      setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)))
    } else {
      setWorkers((prev) => prev.map((w) => (w.id === data.id ? data : w)))
    }
    setSelected(null)
  }

  // Убрать из схемы = очистить position_id — сам человек (и его
  // должность в "Пользователях"/"Работниках", если задать заново) не
  // удаляется, просто временно не отображается в дереве.
  async function handleRemoveFromChart() {
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    const table = selected.kind === 'profile' ? 'profiles' : 'workers'
    const { data, error: updateError } = await supabase
      .from(table)
      .update({ position_id: null })
      .eq('id', selected.id)
      .select()
      .single()
    setSaving(false)
    if (updateError) {
      setSaveError(updateError.message)
      return
    }
    if (selected.kind === 'profile') {
      setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)))
    } else {
      setWorkers((prev) => prev.map((w) => (w.id === data.id ? data : w)))
    }
    setSelected(null)
  }

  function openAddPerson() {
    setAddKind('worker')
    setAddFullName('')
    setAddEmail('')
    setAddPassword('')
    setAddRole('party_chief')
    setAddOrganizationId('')
    setAddError(null)
    setAddSuccessMsg(null)
    setAddPersonOpen(true)
  }

  async function handleAddPerson(e: FormEvent) {
    e.preventDefault()
    setAddSaving(true)
    setAddError(null)
    setAddSuccessMsg(null)

    if (addKind === 'profile') {
      const result = await createUserFromScratch({
        fullName: addFullName,
        email: addEmail,
        password: addPassword,
        role: addRole,
      })
      setAddSaving(false)
      if ('error' in result) {
        setAddError(result.error)
        return
      }
      setProfiles((prev) => [...prev, result.profile].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setAddSuccessMsg(
        'Пользователь создан. Сообщите ему email и пароль отдельно (лично/мессенджером) — здесь они не сохраняются. Назначьте должность в списке ниже.',
      )
      setAddFullName('')
      setAddEmail('')
      setAddPassword('')
      return
    }

    const { data: newWorker, error: insertError } = await supabase
      .from('workers')
      .insert({
        full_name: addFullName.trim(),
        organization_id: addOrganizationId,
        position_id: null,
        reports_to_profile_id: null,
        reports_to_worker_id: null,
        assigned_foreman_id: null,
      })
      .select()
      .single()
    setAddSaving(false)
    if (insertError || !newWorker) {
      setAddError(insertError?.message ?? 'Не удалось создать работника')
      return
    }
    setWorkers((prev) => [...prev, newWorker].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setAddPersonOpen(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <Network size={22} className="text-muted" /> Оргструктура
        </h1>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openAddPerson}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13.5 }}
            >
              <Plus size={15} /> Добавить человека
            </button>
            <Link
              to="/users"
              className="btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13.5 }}
            >
              <UserPlus size={15} /> Все пользователи
            </Link>
            <Link
              to="/settings/workers"
              className="btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13.5 }}
            >
              <UserPlus size={15} /> Все работники
            </Link>
          </div>
        )}
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Схема строится из должностей и руководителей, заданных в{' '}
        <Link to="/users">пользователях</Link> и{' '}
        <Link to="/settings/workers">работниках</Link> — правки здесь и там
        синхронизированы. Кликните на карточку, чтобы изменить должность
        или руководителя{canEdit ? '.' : ' (только просмотр).'}
        {' '}Оранжевая рамка — ответственный, отправляет сводки в системе.
        {' '}Схему можно таскать и приближать колесом мыши или кнопками в углу.
        {' '}Человек без должности в схеме не отображается — таких людей
        можно найти и назначить в разделе "Без назначенной должности" ниже.
      </p>

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-md)' }} />
      ) : roots.length === 0 ? (
        <p className="text-muted">
          Пока никому не назначена должность — назначьте в разделе "Без назначенной должности" ниже.
        </p>
      ) : (
        <PanZoomViewport>
          <ul className="org-tree">
            {roots.map((r) => (
              <OrgNode key={r.key} person={r} childrenByParent={childrenByParent} onSelect={openNode} />
            ))}
          </ul>
        </PanZoomViewport>
      )}

      {!loading && unassignedPeople.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Без назначенной должности</h2>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 10 }}>
            Эти люди уже есть в системе, но не показаны в схеме выше — нажмите на карточку, чтобы назначить должность
            и руководителя.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unassignedPeople.map((p) => (
              <button
                key={p.key}
                type="button"
                className="card card-interactive"
                onClick={() => openNode(p)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: 'var(--color-text)' }}
              >
                <UserCircle2 size={16} className="text-muted" />
                <span>
                  {p.fullName}
                  {p.role && <span className="text-muted"> — {ROLE_LABELS[p.role]}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={selected != null}
        onClose={closeNode}
        title={selected ? (selected.positionId ? `${selected.positionName} — ${selected.fullName}` : `Назначить должность: ${selected.fullName}`) : ''}
      >
        {selected && (
          <div style={{ display: 'grid', gap: 18 }}>
            {canEdit ? (
              <form onSubmit={handleSave} style={{ display: 'grid', gap: 10 }}>
                <label>
                  Должность
                  <select value={editPositionId} onChange={(e) => setEditPositionId(e.target.value)}>
                    <option value="">— не указана —</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Руководитель
                  <PersonSelect
                    profiles={profiles}
                    workers={workers}
                    value={editReportsTo}
                    onChange={setEditReportsTo}
                    excludeKeys={excludeKeys}
                    noneLabel="— не назначен —"
                  />
                </label>
                {saveError && <p className="text-error" style={{ margin: 0 }}>{saveError}</p>}
                <button type="submit" disabled={saving}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
                {selected.positionId && (
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={saving}
                    onClick={handleRemoveFromChart}
                    style={{ fontSize: 13, color: 'var(--color-danger)' }}
                  >
                    Убрать из схемы (не удаляет человека)
                  </button>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCircle2 size={18} className="text-muted" />
                {selected.fullName}
                {selected.role && ` — ${ROLE_LABELS[selected.role]}`}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={addPersonOpen} onClose={() => setAddPersonOpen(false)} title="Добавить человека">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button
            type="button"
            className={addKind === 'worker' ? '' : 'btn-outline'}
            onClick={() => setAddKind('worker')}
            style={{ flex: 1, fontSize: 13 }}
          >
            Работник
          </button>
          <button
            type="button"
            className={addKind === 'profile' ? '' : 'btn-outline'}
            onClick={() => setAddKind('profile')}
            style={{ flex: 1, fontSize: 13 }}
          >
            Пользователь
          </button>
        </div>
        <form onSubmit={handleAddPerson} style={{ display: 'grid', gap: 12 }}>
          <label>
            ФИО
            <input required value={addFullName} onChange={(e) => setAddFullName(e.target.value)} />
          </label>
          {addKind === 'profile' ? (
            <>
              <label>
                Email
                <input type="email" required value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
              </label>
              <label>
                Временный пароль
                <input
                  type="text"
                  required
                  minLength={6}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                />
              </label>
              <label>
                Роль
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as UserRole)}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              Организация
              <select required value={addOrganizationId} onChange={(e) => setAddOrganizationId(e.target.value)}>
                <option value="">— выбрать —</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {addError && <p className="text-error" style={{ margin: 0 }}>{addError}</p>}
          {addSuccessMsg && <p className="text-success" style={{ margin: 0 }}>{addSuccessMsg}</p>}
          <button type="submit" disabled={addSaving}>
            {addSaving ? 'Добавляем…' : 'Добавить'}
          </button>
        </form>
        <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          Должность и руководителя можно будет назначить сразу после — новый человек появится в разделе "Без
          назначенной должности".
        </p>
      </Modal>
    </div>
  )
}
