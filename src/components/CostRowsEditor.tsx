import type { CostCategory } from '../types/database'

export interface CostRow {
  cost_category_id: string
  quantity: string
  amount: string
}

export const emptyCostRow = (): CostRow => ({
  cost_category_id: '',
  quantity: '',
  amount: '',
})

interface Props {
  rows: CostRow[]
  categories: CostCategory[]
  onChange: (rows: CostRow[]) => void
}

// Затраты в сводке — категория + количество (л/шт/т) + сумма (₽)
// одновременно, список категорий расширяемый (см. ТЗ).
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
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <select
            value={row.cost_category_id}
            onChange={(e) =>
              updateRow(i, { cost_category_id: e.target.value })
            }
            style={{ flex: 1 }}
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
            style={{ width: 80 }}
          />
          <input
            type="number"
            step="any"
            placeholder="сумма, ₽"
            value={row.amount}
            onChange={(e) => updateRow(i, { amount: e.target.value })}
            style={{ width: 90 }}
          />
          <button type="button" onClick={() => removeRow(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow}>
        + статья затрат
      </button>
    </div>
  )
}
