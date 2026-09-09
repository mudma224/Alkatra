import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackNavigation } from '../../../components/layout/BackNavigation/BackNavigation';
import { Button } from '../../../components/ui/Button/Button';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { ErrorMessage } from '../../../components/ui/ErrorMessage/ErrorMessage';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import {
  useSubmitRecommendationFeedback,
  useTodayRecommendation,
} from '../../../hooks/useRecommendations';
import type {
  Recommendation,
  RecommendationFeedback,
} from '../../../types/recommendation.types';

import styles from './FeedbackScreen.module.css';

interface FeedbackLocationState {
  recommendation?: Recommendation;
}

const feedbackOptions: Array<{
  value: RecommendationFeedback;
  label: string;
  description: string;
}> = [
  {
    value: 'accepted',
    label: 'Recommandation utile',
    description: 'Cette recommandation correspond à l’état de ma parcelle.',
  },
  {
    value: 'rejected',
    label: 'Recommandation non adaptée',
    description: 'Cette recommandation ne correspond pas à ce que j’observe.',
  },
  {
    value: 'ignored',
    label: 'Je préfère ne pas répondre',
    description: 'La recommandation sera marquée comme ignorée.',
  },
];

/** Feedback page aligned with FeedbackDto and the existing visual system. */
export function FeedbackScreen() {
  const { farmId, parcelId, recommendationId } = useParams<{
    farmId: string;
    parcelId: string;
    recommendationId: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();

  const locationState = location.state as FeedbackLocationState | null;
  // Ensure TypeScript correctly narrows the possibly-null locationState
  // by extracting the candidate recommendation first, then comparing its id.
  const stateRecommendationCandidate = locationState?.recommendation ?? null;
  const stateRecommendation =
    stateRecommendationCandidate?.id === recommendationId
      ? stateRecommendationCandidate
      : null;

  // A direct page refresh can recover today's recommendation without inventing GET /:id.
  const {
    recommendation: todayRecommendation,
    status: todayStatus,
    error: todayError,
    refetch,
  } = useTodayRecommendation(parcelId, stateRecommendation === null);

  const [submittedRecommendation, setSubmittedRecommendation] =
    useState<Recommendation | null>(null);
  const [selectedFeedback, setSelectedFeedback] =
    useState<RecommendationFeedback | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { submit, isSubmitting, error, clearError } =
    useSubmitRecommendationFeedback();

  const fallbackRecommendation =
    todayRecommendation?.id === recommendationId ? todayRecommendation : null;
  const recommendation =
    submittedRecommendation ?? stateRecommendation ?? fallbackRecommendation;

  useEffect(() => {
    if (recommendation?.userFeedback) {
      setSelectedFeedback(recommendation.userFeedback);
    }
  }, [recommendation?.id, recommendation?.userFeedback]);

  const returnToRecommendation = () => {
    if (farmId && parcelId) {
      navigate(`/farms/${farmId}/parcels/${parcelId}/recommendation`);
      return;
    }

    navigate('/recommendations');
  };

  const feedbackAlreadyRecorded =
    recommendation !== null &&
    (recommendation.userFeedback !== null ||
      !['pending', 'seen'].includes(recommendation.status));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!recommendationId || !selectedFeedback || feedbackAlreadyRecorded) {
      return;
    }

    const updated = await submit(recommendationId, selectedFeedback);
    if (updated) {
      setSubmittedRecommendation(updated);
      setSubmitted(true);
    }
  };

  const isLoading = stateRecommendation === null && todayStatus === 'loading';
  const isUnavailable =
    stateRecommendation === null &&
    (todayStatus === 'empty' ||
      (todayStatus === 'success' && fallbackRecommendation === null));

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <BackNavigation label="Retour à la recommandation" />
        <h1>Votre avis</h1>
      </div>

      {isLoading && (
        <div className={styles.skeletons} aria-label="Chargement du formulaire">
          <Skeleton className={styles.skeletonIntro} />
          <Skeleton className={styles.skeletonOption} />
          <Skeleton className={styles.skeletonOption} />
          <Skeleton className={styles.skeletonButton} />
        </div>
      )}

      {stateRecommendation === null && todayStatus === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Avis indisponible"
          description={todayError ?? 'Impossible de charger la recommandation.'}
          action={
            <Button variant="primary" onClick={refetch}>
              Réessayer
            </Button>
          }
        />
      )}

      {isUnavailable && (
        <EmptyState
          icon={AlertCircle}
          title="Recommandation introuvable"
          description="Cet avis ne peut plus être rattaché à la recommandation du jour."
          action={
            <Button variant="primary" onClick={returnToRecommendation}>
              Retour à la recommandation
            </Button>
          }
        />
      )}

      {recommendation && (
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <div className={styles.intro}>
            <h2>Cette recommandation vous a-t-elle aidé&nbsp;?</h2>
            <p>
              Votre réponse aide à améliorer les prochaines recommandations.
            </p>
          </div>

          {submitted ? (
            <div className={styles.success} role="status">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <h2>Merci pour votre avis</h2>
                <p>Votre réponse a bien été enregistrée.</p>
              </div>
            </div>
          ) : (
            <fieldset
              className={styles.options}
              disabled={isSubmitting || feedbackAlreadyRecorded}
            >
              <legend className={styles.srOnly}>Choisissez une réponse</legend>

              {feedbackOptions.map((option) => (
                <label
                  className={`${styles.option} ${
                    selectedFeedback === option.value ? styles.selected : ''
                  }`}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="feedback"
                    value={option.value}
                    checked={selectedFeedback === option.value}
                    onChange={() => {
                      clearError();
                      setSelectedFeedback(option.value);
                    }}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {feedbackAlreadyRecorded && !submitted && (
            <p className={styles.recorded} role="status">
              Un avis a déjà été enregistré pour cette recommandation.
            </p>
          )}

          {error && <ErrorMessage message={error} />}

          {submitted || feedbackAlreadyRecorded ? (
            <Button variant="primary" block onClick={returnToRecommendation}>
              Retour à la recommandation
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              block
              loading={isSubmitting}
              disabled={selectedFeedback === null}
            >
              Envoyer mon avis
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
