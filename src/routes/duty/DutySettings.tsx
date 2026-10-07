import ShiftDutyCard from '../../components/ShiftDutyCard'

// Настройки мастера (мобильная шапка → шестерёнка): вахта и передача смены.
// Заголовок «Настройки» уже стоит в шапке, на странице его не дублируем.
export default function DutySettings() {
  return (
    <div style={{ paddingTop: 12 }}>
      <ShiftDutyCard />
    </div>
  )
}
