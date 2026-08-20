import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** Classe supplémentaire pour dimensionner le squelette (hauteur, rayon). */
  className?: string;
}

/**
 * Bloc squelette générique pour les états de chargement
 * (maquette FarmList - Loading : rectangles gris aux dimensions des
 * éléments réels — barre de recherche, bouton, cards).
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}