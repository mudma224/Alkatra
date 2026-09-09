import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { Header } from '../Header/Header';
import { Navigation } from '../Navigation/Navigation';

import styles from './Layout.module.css';

export function AppLayout() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  const toggleNavigation = () => {
    // The layout owns navigation state so Header and Navigation share one implementation.
    setNavigationOpen((open) => !open);
  };

  const closeNavigation = () => {
    // Navigation closes after a route selection or explicit close action.
    setNavigationOpen(false);
  };

  return (
    <div className={styles.shell}>
      <Header
        navigationOpen={navigationOpen}
        onNavigationToggle={toggleNavigation}
      />

      <Navigation
        open={navigationOpen}
        onClose={closeNavigation}
      />

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}