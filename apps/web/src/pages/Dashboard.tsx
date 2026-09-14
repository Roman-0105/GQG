import { PageHeader } from '../components/PageHeader';
import { Tile } from '../components/Tile';
import { useCurrentUser } from '../lib/useCurrentUser';
import { NAV_SECTIONS, visibleNavSections } from '../lib/nav';

/**
 * Плитки панели — теперь ровно те же разделы и то же условие видимости,
 * что и в сайдбаре (см. lib/nav.ts), а не отдельный захардкоженный
 * список: раньше можно было убрать пункт из одного места и забыть про
 * другое (так и случилось с "Внести табель").
 */
export function Dashboard() {
  const { user, permissions, loaded } = useCurrentUser();
  const sections = loaded ? visibleNavSections(permissions) : NAV_SECTIONS;

  return (
    <div>
      <PageHeader
        title={user ? `Здравствуйте, ${user.fullName.split(' ')[0]}` : 'Панель'}
        description="Быстрый доступ ко всем разделам платформы."
      />

      {sections.map((section) => (
        <div key={section.title} className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{section.title}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {section.items.map((item) => (
              <Tile key={item.to} to={item.to} icon={item.icon} title={item.label} description={item.description} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
