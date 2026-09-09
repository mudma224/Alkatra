import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Plus, SearchX } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { Input } from '../../../components/ui/Input/Input';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { FarmCard } from '../../../components/farm/FarmCard/FarmCard';
import { useFarms } from '../../../hooks/useFarms';
import { normalizeSearch } from '../../../utils/format';

import styles from './FarmListScreen.module.css';

/**
 * Liste des fermes de l'utilisateur (route /farms).
 *
 * Quatre états, alignés sur les maquettes Figma validées :
 * - loading  → squelettes (110:33)
 * - error    → EmptyState « Oups ! » + Réessayer (111:39)
 * - empty    → EmptyState « Aucune ferme » + CTA (83:45)
 * - populated→ recherche + bouton + FarmCards (76:34)
 */
export function FarmListScreen() {
  const { farms, status, refetch } = useFarms();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const normalizedQuery = normalizeSearch(query);
  const filteredFarms =
    status === 'success' && normalizedQuery
      ? farms.filter((farm) =>
          normalizeSearch(`${farm.name} ${farm.region ?? ''}`).includes(normalizedQuery),
        )
      : farms;

  const openCreateFarm = () => navigate('/farms/new');
  const openFarmDetail = (farmId: string) => navigate(`/farms/${farmId}`);

  const hasFarms = status === 'success' && farms.length > 0;

  return (
    <section className={styles.screen}>
      <h1 className={styles.title}>Mes fermes</h1>

      {hasFarms && (
        <>
          <Input
            variant="search"
            name="farm-search"
            placeholder="Rechercher"
            aria-label="Rechercher"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
          />

          <Button
            variant="primary"
            block
            iconLeft={<Plus style={{ transform: 'translateY(-1px)' }}/>}
            onClick={openCreateFarm}
          >
            Créer une ferme
          </Button>
        </>
      )}

      {status === 'loading' && (
        <div className={styles.skeletons}>
          <Skeleton className={styles.skeletonSearch} />
          <Skeleton className={styles.skeletonButton} />
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonCard} />
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Oups !"
          description="Impossible de charger vos fermes."
          action={
            <Button variant="primary" className={styles.retryButton} onClick={refetch}>
              Réessayer
            </Button>
          }
        />
      )}

      {status === 'success' && farms.length === 0 && (
        <EmptyState
          icon={Plus}
          title="Aucune ferme"
          description="Vous n'avez pas encore créé de ferme. Commencez par ajouter votre première exploitation."
          action={
            <Button variant="primary" onClick={openCreateFarm}>
              Créer ma première ferme
            </Button>
          }
        />
      )}

      {status === 'success' && farms.length > 0 && filteredFarms.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Aucune ferme trouvée"
          description={`Aucune ferme ne correspond à « ${query} ».`}
        />
      )}

      {status === 'success' && filteredFarms.length > 0 && (
        <ul className={styles.list}>
          {filteredFarms.map((farm) => (
            <li key={farm.id}>
              <FarmCard farm={farm} onClick={(clicked) => openFarmDetail(clicked.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
