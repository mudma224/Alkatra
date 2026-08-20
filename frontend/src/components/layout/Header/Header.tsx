import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../ui/Button/Button';
import { useAuth } from '../../../hooks/useAuth';

import styles from './Header.module.css';

interface HeaderProps {
  /** Controls the shared navigation drawer from the application layout. */
  navigationOpen: boolean;

  /** Opens or closes the shared navigation drawer. */
  onNavigationToggle: () => void;
}

export function Header({
  navigationOpen,
  onNavigationToggle,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    // Logout only clears the current authenticated session.
    logout();

    // Replace history so the authenticated page cannot be returned to with Back.
    navigate('/login', { replace: true });
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {user && (
          <button
            type="button"
            className={styles.menuButton}
            aria-label={
              navigationOpen
                ? 'Fermer la navigation'
                : 'Ouvrir la navigation'
            }
            aria-expanded={navigationOpen}
            aria-controls="main-navigation"
            onClick={onNavigationToggle}
          >
            {navigationOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </button>
        )}

        <span className={styles.title}>Al katra bel qatra</span>
      </div>

      {user && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
        >
          Déconnexion
        </Button>
      )}
    </header>
  );
}