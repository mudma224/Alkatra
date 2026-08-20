import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../ui/Button/Button';

import styles from './Header.module.css';

export interface HeaderProps {
  /** Reflète l’état réel de l’unique drawer partagé. */
  navigationOpen: boolean;

  /** Ouvre ou ferme la navigation contrôlée par AppLayout. */
  onNavigationToggle: () => void;
}

/** Header commun à toutes les routes authentifiées. */
export function Header({
  navigationOpen,
  onNavigationToggle,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    // Le store en mémoire est vidé avant de quitter les routes protégées.
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className={styles.header}>
      <div className={styles.leadingGroup}>
        <Button
          variant="ghost"
          size="sm"
          className={styles.menuButton}
          aria-label={navigationOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'}
          aria-expanded={navigationOpen}
          aria-controls="main-navigation"
          onClick={onNavigationToggle}
          iconLeft={
            navigationOpen
              ? <X aria-hidden="true" style={{ transform: 'translateY(-2.5px)' }}/>
              : <Menu aria-hidden="true" style={{ transform: 'translateY(-2.5px)' }}/>
          }
        >
        </Button>

        <span className={styles.title}>Al katra bel qatra</span>
      </div>

      {user && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.logoutButton}
          onClick={handleLogout}
        >
          Déconnexion
        </Button>
      )}
    </header>
  );
}