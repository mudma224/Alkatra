import { useNavigate } from 'react-router-dom';
import { Button } from '../../ui/Button/Button';
import { useAuth } from '../../../hooks/useAuth';
import styles from './Header.module.css';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className={styles.header}>
      <span className={styles.title}>Al katra bel qatra</span>
      {user && (
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Déconnexion
        </Button>
      )}
    </header>
  );
}