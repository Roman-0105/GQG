import type { CostCategory, CostItem } from '../types/database'

export interface CostRow {
  cost_category_id: string
  cost_item_id: string
  quantity: string
}

export const emptyCostRow = (): CostRow => ({
  cost_category_id: '',
  cost_item_id: '',
  quantity: '',
})

interface Props {
  rows: CostRow[]
  categories: CostCategory[]
  items: CostItem[]
  onChange: (rows: CostRow[]) => void
}

// Затраты в сводке — категория + вид затрат внутри неё + количество
// (л/шт/т, см. отзыв 19.09.2026: раньше категория и вид были одним плоским
// списком, теперь двухуровневая структура настраивается на экране
// "Статьи затрат"). Поле "сумма, ₽" убрано по просьбе заказчика (17.09.2026)
// — бригадиру оно не нужно, стоимость по количеству считает бухгалтерия
// отдельно; report_costs.amount в базе осталось nullable на случай, если
// понадобится вернуть.
export default function CostRowsEditor({ rows, categories, items, onChange }: Props) {
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
      {rows.map((row, i) => {
        const itemsInCategory = items.filter((it) => it.category_id === row.cost_category_id)
        const selectedItem = items.find((it) => it.id === row.cost_item_id)
        return (
          <div key={i} className="dynamic-row-costs">
            <select
              value={row.cost_category_id}
              onChange={(e) =>
                updateRow(i, { cost_category_id: e.target.value, cost_item_id: '' })
              }
            >
              <option value="">— категория —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={row.cost_item_id}
              disabled={!row.cost_category_id}
              onChange={(e) => updateRow(i, { cost_item_id: e.target.value })}
            >
              <option value="">— вид затрат —</option>
              {itemsInCategory.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                  {it.unit ? ` (${it.unit})` : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              placeholder={selectedItem?.unit ? `кол-во, ${selectedItem.unit}` : 'кол-во'}
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
        )
      })}
      <button type="button" className="btn-outline" onClick={addRow}>
        + статья затрат
      </button>
    </div>
  )
}
