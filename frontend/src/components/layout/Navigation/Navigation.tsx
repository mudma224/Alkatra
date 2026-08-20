import { NavLink } from 'react-router-dom';

import styles from './Navigation.module.css';

interface NavigationProps {
  /** Determines whether the shared navigation drawer is visible. */
  open: boolean;

  /** Closes the navigation after navigation or explicit dismissal. */
  onClose: () => void;
}

export function Navigation({
  open,
  onClose,
}: NavigationProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Fermer la navigation"
          onClick={onClose}
        />
      )}

      <nav
        id="main-navigation"
        className={`${styles.nav} ${open ? styles.open : ''}`}
        aria-label="Navigation principale"
        aria-hidden={!open}
      >
        <NavLink
          to="/farms"
          className={({ isActive }) =>
            isActive
              ? `${styles.link} ${styles.active}`
              : styles.link
          }
          onClick={onClose}
        >
          Fermes
        </NavLink>

        <NavLink
          to="/recommendations"
          className={({ isActive }) =>
            isActive
              ? `${styles.link} ${styles.active}`
              : styles.link
          }
          onClick={onClose}
        >
          Recommandations
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            isActive
              ? `${styles.link} ${styles.active}`
              : styles.link
          }
          onClick={onClose}
        >
          Profil
        </NavLink>
      </nav>
    </>
  );
}