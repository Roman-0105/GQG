export interface DiameterRow {
  depth_from: string
  depth_to: string
  diameter: string
}

export const emptyDiameterRow = (): DiameterRow => ({
  depth_from: '',
  depth_to: '',
  diameter: '',
})

interface Props {
  rows: DiameterRow[]
  onChange: (rows: DiameterRow[]) => void
}

// Диаметры бурения могут быть разными на разных интервалах глубины
// (см. ТЗ) — поэтому это динамический список строк, а не одно поле.
export default function DiameterIntervalsEditor({ rows, onChange }: Props) {
  function updateRow(index: number, patch: Partial<DiameterRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...rows, emptyDiameterRow()])
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        Диаметры бурения по интервалам
      </label>
      {rows.map((row, i) => (
        <div key={i} className="dynamic-row">
          <input
            type="number"
            placeholder="от, м"
            value={row.depth_from}
            onChange={(e) => updateRow(i, { depth_from: e.target.value })}
          />
          <input
            type="number"
            placeholder="до, м"
            value={row.depth_to}
            onChange={(e) => updateRow(i, { depth_to: e.target.value })}
          />
          <input
            type="number"
            placeholder="диаметр, мм"
            value={row.diameter}
            onChange={(e) => updateRow(i, { diameter: e.target.value })}
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
        + интервал
      </button>
    </div>
  )
}
