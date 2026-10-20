/**
 * NYC Map Agent — Zero-Hallucination Fact Verification Gate (Owned by Person C: Abheeshu Dhungana)
 *
 * Ensures that 100% of numbers spoken by the AI companion match exact structured figures
 * retrieved from NYC Open Data (`erm2-nwe9` 311 & `h9gi-nx95` NYPD Crashes).
 */

const NUMBER_WORD_TO_INT = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  cero: 0,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

/**
 * Collects all verified numbers from a block's 311 and Crash summaries.
 */
export function collectAllowedNumbers(blockFixture) {
  const allowed = new Set([311]); // 311 is the service name itself
  const s311 = blockFixture?.summary311;
  const crash = blockFixture?.intersectionCrashes;

  if (blockFixture?.councilDistrict != null) {
    allowed.add(Number(blockFixture.councilDistrict));
  }

  if (s311) {
    [
      s311.timeWindowDays,
      s311.totalComplaints,
      s311.openComplaints,
      s311.closedNoActionCount,
      s311.repeatLocationCount,
      s311.medianResponseHours,
      s311.averageResponseHours,
    ].forEach((n) => {
      if (typeof n === "number" && !Number.isNaN(n)) allowed.add(n);
    });

    if (s311.totalComplaints > 0) {
      const closedNoActionPct = Math.round(
        (s311.closedNoActionCount / s311.totalComplaints) * 100
      );
      allowed.add(closedNoActionPct);
    }

    for (const d of s311.topDescriptors || []) {
      if (typeof d.count === "number") allowed.add(d.count);
    }
  }

  if (crash) {
    [
      crash.timeWindowMonths,
      crash.totalCrashes,
      crash.pedestrianInjuries,
      crash.cyclistInjuries,
      crash.motoristInjuries,
      crash.fatalities,
      crash.dataLagMonths,
    ].forEach((n) => {
      if (typeof n === "number" && !Number.isNaN(n)) allowed.add(n);
    });
  }

  return allowed;
}

/**
 * Extracts all numeric literals and number words from candidate text (ignoring ISO dates like 2026-06-30).
 */
export function extractSpokenNumbers(text = "") {
  const sanitized = String(text).replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  const digitMatches = sanitized.match(/\b\d+\b/g) || [];
  const numbers = digitMatches.map((m) => Number(m));

  const words = sanitized
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ\s]/gi, " ")
    .split(/\s+/);

  for (const w of words) {
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORD_TO_INT, w)) {
      numbers.push(NUMBER_WORD_TO_INT[w]);
    }
  }

  return numbers;
}

/**
 * Verifies that every number in `candidateText` exists in `allowedNumbers`.
 * If an unverified number is detected, returns `passed: false` and `fallbackText`.
 */
export function verifyAgainstFactGate(candidateText, blockFixture, fallbackText) {
  const allowedSet = collectAllowedNumbers(blockFixture);
  const extracted = extractSpokenNumbers(candidateText);
  const unverified = extracted.filter((num) => !allowedSet.has(num));

  if (unverified.length > 0) {
    return {
      passed: false,
      verifiedText: fallbackText,
      extractedNumbers: extracted,
      unverifiedNumbers: unverified,
      allowedNumbers: Array.from(allowedSet),
    };
  }

  return {
    passed: true,
    verifiedText: candidateText,
    extractedNumbers: extracted,
    unverifiedNumbers: [],
    allowedNumbers: Array.from(allowedSet),
  };
}
