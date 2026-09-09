import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Cpu,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { BackNavigation } from '../../../components/layout/BackNavigation/BackNavigation';
import { RecommendationFactors } from '../../../components/recommendations/RecommendationFactors/RecommendationFactors';
import { RecommendationHistory } from '../../../components/recommendations/RecommendationHistory/RecommendationHistory';
import { RecommendationSummary } from '../../../components/recommendations/RecommendationSummary/RecommendationSummary';
import {
  RecommendationTabs,
  type RecommendationTab,
} from '../../../components/recommendations/RecommendationsTabs/RecommendationTabs'
import { Button } from '../../../components/ui/Button/Button';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { useAuth } from '../../../hooks/useAuth';
import { useParcel } from '../../../hooks/useParcels';
import {
  useRecommendationHistory,
  useTodayRecommendation,
} from '../../../hooks/useRecommendations';

import styles from './RecommendationScreen.module.css';

const generatedAtFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const percentageFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** Full recommendation flow for one parcel: current details, factors and history. */
export function RecommendationScreen() {
  const { farmId, parcelId } = useParams<{
    farmId: string;
    parcelId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<RecommendationTab>('details');

  const { parcel, status: parcelStatus } = useParcel(parcelId);
  const {
    recommendation,
    status,
    error,
    refetch,
  } = useTodayRecommendation(parcelId);
  const {
    history,
    status: historyStatus,
    error: historyError,
    refetch: refetchHistory,
  } = useRecommendationHistory(parcelId, activeTab === 'history', 8);

  const prefersDarija =
    user?.preferredLanguage === 'darija' || user?.preferredLanguage === 'arabic';
  const explanationLanguage = prefersDarija ? 'darija' : 'fr';
  const explanation = recommendation
    ? prefersDarija
      ? recommendation.explanation.darija || recommendation.explanation.fr
      : recommendation.explanation.fr || recommendation.explanation.darija
    : '';

  // History includes today's row, so remove that duplicate and show seven previous rows.
  const previousRecommendations = history.items
    .filter((item) => item.id !== recommendation?.id)
    .slice(0, 7);

  const openFeedback = () => {
    if (!recommendation || !farmId || !parcelId) {
      return;
    }

    navigate(
      `/farms/${farmId}/parcels/${parcelId}/recommendation/${recommendation.id}/feedback`,
      { state: { recommendation } },
    );
  };

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <BackNavigation label="Retour à la parcelle" />

        {parcelStatus === 'loading' ? (
          <Skeleton className={styles.skeletonTitle} />
        ) : (
          <h1 className={styles.title}>{parcel?.name ?? 'Recommandation'}</h1>
        )}
      </div>

      {status === 'loading' && (
        <div className={styles.skeletons} aria-label="Chargement de la recommandation">
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonTabs} />
          <Skeleton className={styles.skeletonFactor} />
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Oups !"
          description={error ?? "Impossible de charger la recommandation aujourd'hui."}
          action={
            <Button variant="primary" onClick={refetch}>
              Réessayer
            </Button>
          }
        />
      )}

      {(status === 'success' || status === 'empty') && (
        <>
          {recommendation ? (
            <RecommendationSummary
              recommendation={recommendation}
              explanation={explanation}
              explanationLanguage={explanationLanguage}
              onFeedback={openFeedback}
            />
          ) : (
            <article className={styles.unavailableCard}>
              <CalendarClock aria-hidden="true" />
              <div>
                <h2>Aucune recommandation aujourd'hui</h2>
                <p>
                  Aucune recommandation n’a encore été générée pour cette parcelle.
                </p>
              </div>
            </article>
          )}

          <RecommendationTabs activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === 'details' && (
            <div
              id="recommendation-details-panel"
              role="tabpanel"
              aria-labelledby="recommendation-details-tab"
              className={styles.panel}
            >
              {recommendation ? (
                <>
                  <RecommendationFactors
                    factors={recommendation.topFactors}
                    language={prefersDarija ? 'ar' : 'fr'}
                  />

                  <dl className={styles.metadata} aria-label="Informations de la recommandation"
>
  <div className={styles.metadataItem}>
    <dt className={styles.metadataTerm}>
      <span className={styles.metadataIcon} aria-hidden="true">
        <CalendarClock />
      </span>
      Générée le
    </dt>

    <dd className={styles.metadataValue}>
      {generatedAtFormatter.format(
        new Date(recommendation.generatedAt),
      )}
    </dd>
  </div>

  {recommendation.confidenceScore !== null && (
    <div className={styles.metadataItem}>
      <dt className={styles.metadataTerm}>
        <span className={styles.metadataIcon} aria-hidden="true">
          <BadgeCheck />
        </span>
        Confiance
      </dt>

      <dd className={styles.metadataValue}>
        {percentageFormatter.format(
          recommendation.confidenceScore,
        )}
      </dd>

      <span
        className={styles.confidenceTrack}
        aria-hidden="true"
      >
        <span
          style={{
            width: `${recommendation.confidenceScore * 100}%`,
          }}
        />
      </span>
    </div>
  )}

  {recommendation.modelVersion && (
    <div className={styles.metadataItem}>
      <dt className={styles.metadataTerm}>
        <span className={styles.metadataIcon} aria-hidden="true">
          <Cpu />
        </span>
        Version du modèle
      </dt>

      <dd className={styles.metadataValue}>
        <code className={styles.modelVersion}>
          {recommendation.modelVersion}
        </code>
      </dd>
    </div>
  )}
</dl>
                </>
              ) : (
                <p className={styles.noDetails}>
                  Les détails seront disponibles dès qu’une recommandation sera générée.
                </p>
              )}

              {farmId && parcelId && (
                <Button
                  variant="secondary"
                  block
                  iconRight={<ArrowRight aria-hidden="true" />}
                  onClick={() => navigate(`/farms/${farmId}/parcels/${parcelId}`)}
                >
                  Voir l’état de votre parcelle
                </Button>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div
              id="recommendation-history-panel"
              role="tabpanel"
              aria-labelledby="recommendation-history-tab"
              className={styles.panel}
            >
              {historyStatus === 'loading' && (
                <div className={styles.historySkeletons}>
                  <Skeleton className={styles.skeletonHistoryTitle} />
                  <Skeleton className={styles.skeletonHistoryRow} />
                  <Skeleton className={styles.skeletonHistoryRow} />
                </div>
              )}

              {(historyStatus === 'success' || historyStatus === 'empty') && (
                <RecommendationHistory recommendations={previousRecommendations} />
              )}

              {historyStatus === 'error' && (
                <EmptyState
                  icon={AlertCircle}
                  title="Historique indisponible"
                  description={
                    historyError ?? "Impossible de charger l'historique."
                  }
                  action={
                    <Button variant="primary" onClick={refetchHistory}>
                      Réessayer
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
