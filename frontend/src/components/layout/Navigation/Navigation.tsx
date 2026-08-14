import { NavLink } from 'react-router-dom';
import styles from './Navigation.module.css';

export function Navigation() {
  return (
    <nav className={styles.nav} aria-label="Navigation principale">
      <NavLink
        to="/farms"
        className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
      >
        Fermes
      </NavLink>
    </nav>
  );
}