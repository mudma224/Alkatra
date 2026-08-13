import { Outlet } from 'react-router-dom';
import { Header } from '../Header/Header';
import { Navigation } from '../Navigation/Navigation';
import styles from './Layout.module.css';

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.content}>
        <Outlet />
      </main>
      <Navigation />
    </div>
  );
}