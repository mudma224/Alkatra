import { useTranslation } from 'react-i18next';
import styles from './Brand.module.css';

export function Brand() {
  const { t } = useTranslation();
  return (
    <div className={styles.brand}>
      <h1 className={styles.title}>{t('auth.brandTitle')}</h1>
      <p className={styles.subtitle}>{t('auth.brandSubtitle')}</p>
    </div>
  );
}