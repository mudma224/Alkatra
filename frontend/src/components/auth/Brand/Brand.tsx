import styles from './Brand.module.css';

export function Brand() {
  return (
    <div className={styles.brand}>
      <h1 className={styles.title}>Al katra bel qatra</h1>
      <p className={styles.subtitle}>Nous vous enverrons un code de vérification</p>
    </div>
  );
}