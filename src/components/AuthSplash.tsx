// Заставка на время проверки сессии и загрузки профиля (05.10.2026).
// Раньше между входом и загрузкой профиля на долю секунды мелькала служебная
// панель «Вы вошли, но профиль не загрузился… Диагностика» — теперь вместо неё
// показывается эта заставка с логотипом.
export default function AuthSplash() {
  return (
    <div className="auth-splash" role="status" aria-live="polite" aria-label="Загрузка">
      <div className="auth-splash-logo">
        <span className="auth-splash-ring" />
        <span className="auth-splash-ring auth-splash-ring-2" />
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="GEO QUEST GROUP" width={104} height={104} draggable={false} />
      </div>
    </div>
  )
}
