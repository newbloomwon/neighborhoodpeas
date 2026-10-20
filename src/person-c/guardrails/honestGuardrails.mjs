/**
 * NYC Map Agent — "Honest by Design" Guardrail Engine (Owned by Person C: Abheeshu Dhungana)
 *
 * PRD Rule ("Honest by design"):
 * "It shows what people reported and how the city responded. It doesn't predict crime
 *  or score people, and crash data runs about four months behind. We say that out loud, on screen."
 */

const FORBIDDEN_CRIME_OR_SCORING_PATTERNS = [
  /\bpredict\s+(future\s+)?crime\b/i,
  /\bcrime\s+(score|prediction|forecast|grade|index)\b/i,
  /\bscore\s+(the\s+)?(people|residents|neighbors|demographics)\b/i,
  /\bwhat\s+kind\s+of\s+people\s+live\s+here\b/i,
  /\bdangerous\s+people\b/i,
  /\bpredecir\s+(el\s+)?(crimen|delito)\b/i,
  /\bpuntaje\s+de\s+(crimen|personas|vecinos)\b/i,
];

const REALTIME_CRASH_PATTERNS = [
  /\b(\d+\s+minutes?\s+ago|right\s+now|just\s+happened|live\s+crash)\b/i,
  /\bhace\s+\d+\s+minutos\b/i,
];

/**
 * Inspects a user prompt for policy boundary violations (crime prediction, scoring people,
 * or mistaking historical NYPD crash records for real-time live traffic feeds).
 */
export function evaluateHonestByDesignGuardrails(userPrompt = "", language = "en", crashData = null) {
  const promptText = String(userPrompt || "").trim();
  const dataThroughDate = crashData?.dataThroughDate || "2026-06-30";
  const lagMonths = crashData?.dataLagMonths ?? 4;

  const asksCrimePredictionOrScoring = FORBIDDEN_CRIME_OR_SCORING_PATTERNS.some((re) =>
    re.test(promptText)
  );
  const asksRealtimeCrash = REALTIME_CRASH_PATTERNS.some((re) =>
    re.test(promptText)
  );

  const lagNoticeEn = `Note: Official NYPD crash data runs about ${lagMonths} months behind (verified through ${dataThroughDate}).`;
  const lagNoticeEs = `Nota: Los datos oficiales de choques de NYPD tienen un retraso de aproximadamente ${lagMonths} meses (verificados hasta ${dataThroughDate}).`;
  const dataLagDisclosure = language === "es" ? lagNoticeEs : lagNoticeEn;

  if (asksCrimePredictionOrScoring) {
    const refusalEn = asksRealtimeCrash
      ? `I don't predict crime or score people. I only show what residents reported to 311 and how the city responded. Also, official NYPD crash data runs about ${lagMonths} months behind (verified through ${dataThroughDate}), so I cannot see real-time collisions from minutes ago.`
      : `I don't predict crime or score people. I only show what residents reported to 311 and how the city responded.`;

    const refusalEs = asksRealtimeCrash
      ? `No predigo el crimen ni califico a las personas. Solo muestro lo que los vecinos reportaron al 311 y cómo respondió la ciudad. Además, los datos de choques de NYPD tienen un retraso de unos ${lagMonths} meses (hasta ${dataThroughDate}).`
      : `No predigo el crimen ni califico a las personas. Solo muestro lo que los vecinos reportaron al 311 y cómo respondió la ciudad.`;

    return {
      allowed: false,
      reason: "forbidden_crime_prediction_or_people_scoring",
      refusalMessage: language === "es" ? refusalEs : refusalEn,
      dataLagDisclosure,
    };
  }

  if (asksRealtimeCrash) {
    const realtimeNoticeEn = `Official NYPD crash data runs about ${lagMonths} months behind (currently verified through ${dataThroughDate}), so I cannot report a crash from minutes ago. Here is the verified historical record for this corner.`;
    const realtimeNoticeEs = `Los datos oficiales de choques de NYPD tienen un retraso de unos ${lagMonths} meses (verificados hasta ${dataThroughDate}), por lo que no puedo ver choques de hace unos minutos.`;

    return {
      allowed: true,
      requiresRealtimeLagClarification: true,
      clarificationPrefix: language === "es" ? realtimeNoticeEs : realtimeNoticeEn,
      dataLagDisclosure,
    };
  }

  return {
    allowed: true,
    requiresRealtimeLagClarification: false,
    dataLagDisclosure,
  };
}
