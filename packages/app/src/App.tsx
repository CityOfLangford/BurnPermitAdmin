import { useEffect, useState } from 'react';
import AllPermits from './components/allPermits';
import Availability from './components/availability';
import BlackoutDates from './components/blackoutdates';
import Campfire from './components/campfire';
import OpenBurn from './components/openburn';
import Periods from './components/periods';
import SystemConfigs from './components/systemconfigs';

export {
  buildPermitApplication,
  buildPermitQueryParams,
  formatDate,
  formatPermitType,
  getCampfireEndTime,
  getOpenBurnPeriods,
  getPageNumbers,
  isCancelledStatus,
  printPermit,
  shouldShowTopPagination,
  toggleSort,
} from './components/allPermits';

type PageId = 'permits' | 'campfire' | 'open-burn' | 'blackout-dates' | 'periods' | 'availability' | 'system-configs';

const navigationItems: Array<{ id: PageId; label: string }> = [
  { id: 'permits', label: 'All Permits' },
  { id: 'campfire', label: 'Campfire' },
  { id: 'open-burn', label: 'Open Burn' },
  { id: 'blackout-dates', label: 'Blackout Dates' },
  { id: 'periods', label: 'Periods (Open Burn)' },
  { id: 'availability', label: 'Availability (Campfire)' },
  { id: 'system-configs', label: 'System Configs' },
];

function getPageFromHash(): PageId {
  if (typeof window === 'undefined') return 'permits';
  return navigationItems.find((item) => `#${item.id}` === window.location.hash)?.id || 'permits';
}

function NavigationPane({ activePage }: { activePage: PageId }) {
  return (
    <aside className="navigation-pane" aria-label="Main navigation">
      <div className="brand-lockup">
        <strong>Langford</strong>
        <span>Burn Permit Dashboard</span>
      </div>
      <nav>
        <div className="navigation-section-title"><span aria-hidden="true">▤</span> Data</div>
        {navigationItems.slice(0, 3).map((item) => (
          <a
            key={item.id}
            className={`navigation-item${activePage === item.id ? ' active-navigation-item' : ''}`}
            href={`#${item.id}`}
            aria-current={activePage === item.id ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}

        <div className="navigation-section-title configuration-title"><span aria-hidden="true">⚙</span> Configuration</div>
        {navigationItems.slice(3).map((item) => (
          <a
            key={item.id}
            className={`navigation-item${activePage === item.id ? ' active-navigation-item' : ''}`}
            href={`#${item.id}`}
            aria-current={activePage === item.id ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

function HealthFooter() {
  return <footer className="health-footer" aria-label="Application health status" />;
}

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'campfire':
      return <Campfire />;
    case 'open-burn':
      return <OpenBurn />;
    case 'blackout-dates':
      return <BlackoutDates />;
    case 'periods':
      return <Periods />;
    case 'availability':
      return <Availability />;
    case 'system-configs':
      return <SystemConfigs />;
    case 'permits':
      return <AllPermits />;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(getPageFromHash);

  useEffect(() => {
    const updatePage = (): void => setActivePage(getPageFromHash());
    window.addEventListener('hashchange', updatePage);
    return () => window.removeEventListener('hashchange', updatePage);
  }, []);

  return (
    <div className="application-layout">
      <NavigationPane activePage={activePage} />
      <main className="application-content">
        <PageContent page={activePage} />
        <HealthFooter />
      </main>
    </div>
  );
}
