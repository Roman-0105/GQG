import type { CostCategory } from '../types/database'

export interface CostRow {
  cost_category_id: string
  quantity: string
}

export const emptyCostRow = (): CostRow => ({
  cost_category_id: '',
  quantity: '',
})

interface Props {
  rows: CostRow[]
  categories: CostCategory[]
  onChange: (rows: CostRow[]) => void
}

// Затраты в сводке — категория + количество (л/шт/т), список категорий
// расширяемый (см. ТЗ). Поле "сумма, ₽" убрано по просьбе заказчика
// (17.09.2026) — бригадиру оно не нужно, стоимость по количеству считает
// бухгалтерия отдельно; report_costs.amount в базе осталось nullable на
// случай, если понадобится вернуть.
export default function CostRowsEditor({ rows, categories, onChange }: Props) {
  function updateRow(index: number, patch: Partial<CostRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...rows, emptyCostRow()])
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4 }}>Затраты</label>
      {rows.map((row, i) => (
        <div key={i} className="dynamic-row-costs">
          <select
            value={row.cost_category_id}
            onChange={(e) =>
              updateRow(i, { cost_category_id: e.target.value })
            }
          >
            <option value="">— категория —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.unit ? ` (${c.unit})` : ''}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            placeholder="кол-во"
            value={row.quantity}
            onChange={(e) => updateRow(i, { quantity: e.target.value })}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => removeRow(i)}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-outline" onClick={addRow}>
        + статья затрат
      </button>
    </div>
  )
}
