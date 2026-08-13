import { Sprout } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';

/**
 * TEMPORARY placeholder. This screen exists only to validate the protected
 * route + layout shell end-to-end. It will be replaced by the real
 * FarmListScreen in the next task (not part of this guide's scope).
 */
export function DashboardScreen() {
  return (
    <EmptyState
      icon={Sprout}
      title="Aucune ferme pour le moment"
      description="Cet écran sera remplacé par la liste de vos fermes."
    />
  );
}