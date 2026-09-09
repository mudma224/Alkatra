export const REASON_CODES = {
  LOW_SOIL_MOISTURE: 'LOW_SOIL_MOISTURE',
  HIGH_WATER_DEFICIT: 'HIGH_WATER_DEFICIT',
  HIGH_EVAPOTRANSPIRATION: 'HIGH_EVAPOTRANSPIRATION',
  HIGH_TEMPERATURE: 'HIGH_TEMPERATURE',
  STRONG_WIND: 'STRONG_WIND',
  RECENT_RAIN: 'RECENT_RAIN',
  SUFFICIENT_MOISTURE: 'SUFFICIENT_MOISTURE',
  MILD_WEATHER: 'MILD_WEATHER',
  GENERIC: 'GENERIC',
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];

/** Mapping feature ML (22 features) → reason_code métier */
export const FEATURE_TO_REASON: Record<string, { irrigate: ReasonCode; noIrrigate: ReasonCode }> = {
  'humidite_sol_avant_%': { irrigate: REASON_CODES.LOW_SOIL_MOISTURE, noIrrigate: REASON_CODES.SUFFICIENT_MOISTURE },
  humidite_sol_rolling3: { irrigate: REASON_CODES.LOW_SOIL_MOISTURE, noIrrigate: REASON_CODES.SUFFICIENT_MOISTURE },
  'humidite_sol_j-1': { irrigate: REASON_CODES.LOW_SOIL_MOISTURE, noIrrigate: REASON_CODES.SUFFICIENT_MOISTURE },
  deficit_hydrique: { irrigate: REASON_CODES.HIGH_WATER_DEFICIT, noIrrigate: REASON_CODES.SUFFICIENT_MOISTURE },
  ETc: { irrigate: REASON_CODES.HIGH_EVAPOTRANSPIRATION, noIrrigate: REASON_CODES.MILD_WEATHER },
  'ETc_j-1': { irrigate: REASON_CODES.HIGH_EVAPOTRANSPIRATION, noIrrigate: REASON_CODES.MILD_WEATHER },
  ET0_mm: { irrigate: REASON_CODES.HIGH_EVAPOTRANSPIRATION, noIrrigate: REASON_CODES.MILD_WEATHER },
  eto_hum_ratio: { irrigate: REASON_CODES.HIGH_EVAPOTRANSPIRATION, noIrrigate: REASON_CODES.MILD_WEATHER },
  temp_max: { irrigate: REASON_CODES.HIGH_TEMPERATURE, noIrrigate: REASON_CODES.MILD_WEATHER },
  temp_moy: { irrigate: REASON_CODES.HIGH_TEMPERATURE, noIrrigate: REASON_CODES.MILD_WEATHER },
  delta_temp: { irrigate: REASON_CODES.HIGH_TEMPERATURE, noIrrigate: REASON_CODES.MILD_WEATHER },
  vent: { irrigate: REASON_CODES.STRONG_WIND, noIrrigate: REASON_CODES.MILD_WEATHER },
  rayonnement: { irrigate: REASON_CODES.HIGH_EVAPOTRANSPIRATION, noIrrigate: REASON_CODES.MILD_WEATHER },
  pluie: { irrigate: REASON_CODES.HIGH_WATER_DEFICIT, noIrrigate: REASON_CODES.RECENT_RAIN },
  'pluie_j-1': { irrigate: REASON_CODES.HIGH_WATER_DEFICIT, noIrrigate: REASON_CODES.RECENT_RAIN },
  pluie_3j: { irrigate: REASON_CODES.HIGH_WATER_DEFICIT, noIrrigate: REASON_CODES.RECENT_RAIN },
  humidite_air: { irrigate: REASON_CODES.HIGH_EVAPOTRANSPIRATION, noIrrigate: REASON_CODES.MILD_WEATHER },
};

/** {qty} = quantité en mm */
export const TEMPLATES_IRRIGATE: Record<ReasonCode, { fr: string; darija: string }> = {
  LOW_SOIL_MOISTURE: {
    fr: 'Il faut irriguer aujourd\'hui : la terre est sèche. Apportez {qty} mm d\'eau.',
    darija: 'خاصك تسقي اليوم: الأرض ناشفة. عطي {qty} مم ديال الما.',
  },
  HIGH_WATER_DEFICIT: {
    fr: 'Il faut irriguer aujourd\'hui : la parcelle manque d\'eau. Apportez {qty} mm.',
    darija: 'خاصك تسقي اليوم: الپارسيلا ناقصها الما. عطي {qty} مم.',
  },
  HIGH_EVAPOTRANSPIRATION: {
    fr: 'Il faut irriguer aujourd\'hui : l\'évaporation est forte. Apportez {qty} mm.',
    darija: 'خاصك تسقي اليوم: التبخر قوي. عطي {qty} مم.',
  },
  HIGH_TEMPERATURE: {
    fr: 'Il faut irriguer aujourd\'hui : la chaleur est forte. Apportez {qty} mm.',
    darija: 'خاصك تسقي اليوم: السخانة قوية. عطي {qty} مم.',
  },
  STRONG_WIND: {
    fr: 'Il faut irriguer aujourd\'hui : le vent assèche le sol. Apportez {qty} mm.',
    darija: 'خاصك تسقي اليوم: الريح كينشف الأرض. عطي {qty} مم.',
  },
  RECENT_RAIN: {
    fr: 'Il faut irriguer aujourd\'hui : la pluie n\'a pas suffi. Apportez {qty} mm.',
    darija: 'خاصك تسقي اليوم: الشتا ما كفاتش. عطي {qty} مم.',
  },
  SUFFICIENT_MOISTURE: {
    fr: 'Il faut irriguer aujourd\'hui. Apportez {qty} mm d\'eau.',
    darija: 'خاصك تسقي اليوم. عطي {qty} مم ديال الما.',
  },
  MILD_WEATHER: {
    fr: 'Il faut irriguer aujourd\'hui. Apportez {qty} mm d\'eau.',
    darija: 'خاصك تسقي اليوم. عطي {qty} مم ديال الما.',
  },
  GENERIC: {
    fr: 'Il faut irriguer aujourd\'hui. Apportez {qty} mm d\'eau.',
    darija: 'خاصك تسقي اليوم. عطي {qty} مم ديال الما.',
  },
};

export const TEMPLATES_NO_IRRIGATE: Record<ReasonCode, { fr: string; darija: string }> = {
  RECENT_RAIN: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui : la pluie récente a suffi.',
    darija: 'ما خاصكش تسقي اليوم: الشتا اللي طاحت كافية.',
  },
  SUFFICIENT_MOISTURE: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui : la terre garde assez d\'eau.',
    darija: 'ما خاصكش تسقي اليوم: الأرض فيها الما بزاف.',
  },
  MILD_WEATHER: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui : le temps est doux, l\'évaporation est faible.',
    darija: 'ما خاصكش تسقي اليوم: الجو معتدل والتبخر ضعيف.',
  },
  LOW_SOIL_MOISTURE: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui. Surveillez l\'humidité du sol demain.',
    darija: 'ما خاصكش تسقي اليوم. عاود شوف رطوبة الأرض غدا.',
  },
  HIGH_WATER_DEFICIT: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui. Surveillez la parcelle demain.',
    darija: 'ما خاصكش تسقي اليوم. عاود شوف الپارسيلا غدا.',
  },
  HIGH_EVAPOTRANSPIRATION: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui. Surveillez la parcelle demain.',
    darija: 'ما خاصكش تسقي اليوم. عاود شوف الپارسيلا غدا.',
  },
  HIGH_TEMPERATURE: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui malgré la chaleur : le sol reste humide.',
    darija: 'ما خاصكش تسقي اليوم واخا السخانة: الأرض مازال رطبة.',
  },
  STRONG_WIND: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui. Surveillez la parcelle demain.',
    darija: 'ما خاصكش تسقي اليوم. عاود شوف الپارسيلا غدا.',
  },
  GENERIC: {
    fr: 'Pas besoin d\'irriguer aujourd\'hui.',
    darija: 'ما خاصكش تسقي اليوم.',
  },
};

/** Suffixe de confiance faible (< 0.5) */
export const LOW_CONFIDENCE_SUFFIX = {
  fr: ' (recommandation à confirmer sur le terrain)',
  darija: ' (أكد الحالة فالضيعة).',
};