import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, FileUp, Table2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { PLAN_COLUMNS, parsePlannedWells } from '../../lib/plannedWellsParse'
import { exportToXlsx } from '../../lib/xlsxExport'

// Массовое планирование скважин (04.10.2026): скопируйте строки из Excel и
// вставьте, либо загрузите CSV. Перед созданием — таблица проверки: ошибочные
// строки подсвечены и в базу не попадут.
export default function PlanWellsBulk() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const { session, profile, loading: authLoading } = useAuth()

  const [text, setText] = useState('')
  const [existing, setExisting] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !siteId) return
    supabase
      .from('drilling_tasks')
      .select('well_number')
      .eq('site_id', siteId)
      .then(({ data }) => setExisting(((data ?? []) as { well_number: string }[]).map((d) => d.well_number)))
  }, [session, siteId])

  const rows = useMemo(() => parsePlannedWells(text, existing), [text, existing])
  const valid = rows.filter((r) => r.draft)
  const invalid = rows.length - valid.length

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) return <p>Планировать скважины может только руководство.</p>
  if (!siteId) return <p>Не указан участок.</p>

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (/\.xls$/i.test(file.name)) {
      setError('Старый формат .xls не поддерживается. Сохраните файл как .xlsx (Файл → Сохранить как) и загрузите снова.')
      return
    }
    if (/\.xlsx$/i.test(file.name)) {
      try {
        // Excel читаем отдельной библиотекой read-excel-file (без известных
        // уязвимостей; xlsx используется только для записи шаблона). Берём
        // первый лист и превращаем в текст с табуляциями — дальше тот же разбор
        // и таблица проверки, что при вставке из буфера.
        const { readSheet } = await import('read-excel-file/browser')
        const data = (await readSheet(file)) as unknown[][]
        setText(data.map((row) => row.map((c) => (c == null ? '' : String(c))).join('\t')).join('\n'))
      } catch {
        setError('Не удалось прочитать файл Excel. Убедитесь, что это .xlsx, скачанный с платформы или сохранённый из Excel.')
      }
      return
    }
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file, 'utf-8')
  }

  async function handleCreate() {
    if (!profile || valid.length === 0) return
    setSaving(true)
    setError(null)
    const { error: insError } = await supabase.from('drilling_tasks').insert(
      valid.map((r) => ({
        ...r.draft!,
        site_id: siteId,
        status: 'planned',
        created_by: profile.id,
      })),
    )
    setSaving(false)
    if (insError) {
      setError(
        insError.message.includes('drilling_tasks_assigned_when_started') || insError.message.includes('null value')
          ? 'Не применена миграция 0026 (запланированные скважины). Примените её в Supabase SQL Editor.'
          : insError.message,
      )
      return
    }
    navigate(`/sites/${siteId}?filter=planned`)
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Table2 size={24} className="text-muted" /> Запланировать скважины списком
      </h1>

      <div className="card" style={{ padding: 16, display: 'grid', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 14 }}>
          Колонки по порядку: <b>{PLAN_COLUMNS.join(' | ')}</b>
        </div>
        <div className="text-muted" style={{ fontSize: 13 }}>
          Скачайте шаблон, заполните его в Excel и загрузите файл обратно (или скопируйте ячейки и вставьте ниже). Подходят .xlsx и CSV; читается первый лист, заголовок пропускается. Десятичные дроби — точкой или запятой.
          Организация, станок, бригадир и даты назначаются позже.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() =>
              exportToXlsx('shablon_skvazhin.xlsx', 'Скважины', [...PLAN_COLUMNS], [
                ['ZKY-12001', 47.5123, 70.1234, 1000, 2000, 350, 600, -90, 0, 'Разведочная, участок Бенкала'],
              ])
            }
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> Скачать шаблон Excel
          </button>
          <label className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--color-primary)', fontWeight: 600, fontSize: 13 }}>
            <FileUp size={14} /> Загрузить файл Excel / CSV
            <input type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        <textarea
          rows={7}
          placeholder="Вставьте строки из Excel сюда…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
        />
      </div>

      {error && <p className="text-error">{error}</p>}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 4, marginBottom: 14, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--color-surface-muted)' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                {PLAN_COLUMNS.map((c) => (
                  <th key={c} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{c}</th>
                ))}
                <th style={{ padding: '8px 10px' }}>Проверка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} style={{ background: r.errors.length ? 'var(--color-danger-soft)' : undefined, borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '6px 10px' }} className="num">{r.line}</td>
                  {PLAN_COLUMNS.map((_, i) => (
                    <td key={i} style={{ padding: '6px 10px', maxWidth: i === 9 ? 260 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: i === 9 ? 'nowrap' : undefined }}>
                      {r.cells[i] ?? ''}
                    </td>
                  ))}
                  <td style={{ padding: '6px 10px', minWidth: 160 }}>
                    {r.errors.length === 0 ? (
                      <span style={{ color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={14} /> ок
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-danger)', display: 'inline-flex', alignItems: 'flex-start', gap: 4 }}>
                        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {r.errors.join('; ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" disabled={valid.length === 0 || saving} onClick={handleCreate}>
          {saving ? 'Создаём…' : valid.length > 0 ? `Запланировать скважин: ${valid.length}` : 'Запланировать'}
        </button>
        {rows.length > 0 && (
          <span className="text-muted" style={{ fontSize: 13 }}>
            Строк: {rows.length}, корректных: {valid.length}
            {invalid > 0 ? `, с ошибками: ${invalid} (они не будут созданы)` : ''}
          </span>
        )}
      </div>
    </div>
  )
}
