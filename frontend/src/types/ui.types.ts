/**
 * Types partagés pour les composants UI du design system.
 * Centralise les unions de variantes pour garantir la cohérence
 * entre composants (Button, Input, etc.) et faciliter l'extension.
 */

/** Variantes visuelles de bouton, alignées sur le Button system Figma. */
export type ButtonVariant =
  | 'primary'     // Vert foncé plein — action principale (CTA)
  | 'secondary'   // Vert clair plein — action secondaire
  | 'outline'     // Bordure verte sur fond transparent — alternative
  | 'ghost'       // Transparent, texte vert — navigation/retour
  | 'destructive' // Rouge plein — action irréversible (suppression)
  | 'link';       // Texte avec soulignement au hover — lien

/** Tailles de bouton. `md` par défaut (alignée sur la maquette Figma 48px de haut). */
export type ButtonSize = 'sm' | 'md';

/** États visuels d'un champ de formulaire, alignés sur l'Input system Figma. */
export type InputState = 'default' | 'filled' | 'error';

/** Variantes de champ. `text` par défaut ; `search` ajoute l'icône loupe + bouton clear. */
export type InputVariant = 'text' | 'search';
