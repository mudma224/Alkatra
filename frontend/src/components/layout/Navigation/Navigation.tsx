import { X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';

import { Button } from '../../ui/Button/Button';

import styles from './Navigation.module.css';

export interface NavigationProps {
  /** Détermine si le drawer partagé est visible. */
  open: boolean;

  /** Ferme le drawer après une sélection ou une action explicite. */
  onClose: () => void;
}

/** Navigation unique utilisée par tous les écrans authentifiés. */
export function Navigation({ open, onClose }: NavigationProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Offre une fermeture clavier prévisible.
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

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
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Navigation</span>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Fermer la navigation"
            onClick={onClose}
            iconLeft={<X aria-hidden="true" style={{ transform: 'translateY(-2.5px)' }}/>}
          >
            <span>Fermer</span>
          </Button>
        </div>

        <div className={styles.links}>
          <NavLink
            to="/farms"
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.active}` : styles.link
            }
            onClick={onClose}
          >
            Fermes
          </NavLink>

          <NavLink
            to="/recommendations"
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.active}` : styles.link
            }
            onClick={onClose}
          >
            Recommandations
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.active}` : styles.link
            }
            onClick={onClose}
          >
            Profil
          </NavLink>
        </div>
      </nav>
    </>
  );
}