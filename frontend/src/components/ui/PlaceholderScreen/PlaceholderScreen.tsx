import styles from './PlaceholderScreen.module.css';

export interface PlaceholderScreenProps {
  /**
   * Title displayed in the placeholder.
   */
  title: string;

  /**
   * Short description of what this screen will become.
   */
  description: string;

  /**
   * Phase during which this placeholder will be replaced by the real screen.
   * Example: "Phase 3".
   */
  phase: string;
}

/**
 * Temporary placeholder used for routes whose real screen is not yet
 * implemented. Each instance is marked with the phase that will replace it.
 *
 * TODO: This component is a temporary scaffold for Phase 1. It will be
 * removed as each screen is implemented in its respective phase.
 */
export function PlaceholderScreen({
  title,
  description,
  phase,
}: PlaceholderScreenProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        <p className={styles.phase}>À implémenter en {phase}</p>
      </section>
    </main>
  );
}