import {
  HydricStressRule,
  type RecommendationLikePayload,
} from '../src/alerts/rules/hydric-stress.rule';

describe('HydricStressRule', () => {
  const config = { probabilityThreshold: 0.75, soilHumidityMaxPct: 25 };

  const payload = (overrides: Partial<Parameters<typeof HydricStressRule.evaluate>[0]> = {}) => ({
    parcel_id: 'parcel-1',
    should_irrigate: true,
    irrigation_probability: 0.86,
    soil_humidity_pct: 18.2,
    ...overrides,
  });

  it('✅ Devrait déclencher quand la probabilité est haute et le sol sec', () => {
    const result = HydricStressRule.evaluate(payload(), config);
    expect(result.triggered).toBe(true);
    expect(result.data.irrigationProbability).toBe(0.86);
    expect(result.data.soilHumidityPct).toBe(18.2);
  });

  it('✅ Devrait déclencher exactement aux bornes des seuils (>=, <=)', () => {
    const result = HydricStressRule.evaluate(
      payload({ irrigation_probability: 0.75, soil_humidity_pct: 25 }),
      config,
    );
    expect(result.triggered).toBe(true);
  });

  it('❌ Ne devrait pas déclencher si should_irrigate est faux', () => {
    const result = HydricStressRule.evaluate(
      payload({ should_irrigate: false }),
      config,
    );
    expect(result.triggered).toBe(false);
  });

  it('❌ Ne devrait pas déclencher si la probabilité est sous le seuil', () => {
    const result = HydricStressRule.evaluate(
      payload({ irrigation_probability: 0.6 }),
      config,
    );
    expect(result.triggered).toBe(false);
  });

  it('❌ Ne devrait pas déclencher si le sol est trop humide', () => {
    const result = HydricStressRule.evaluate(
      payload({ soil_humidity_pct: 40 }),
      config,
    );
    expect(result.triggered).toBe(false);
  });

  it('❌ Ne devrait pas déclencher si humidité du sol absente (défaut sûr)', () => {
    const withoutHumidity: Partial<RecommendationLikePayload> = { ...payload() };
    delete withoutHumidity.soil_humidity_pct;
    const result = HydricStressRule.evaluate(
      withoutHumidity as RecommendationLikePayload,
      config,
    );
    expect(result.triggered).toBe(false);
  });
});
