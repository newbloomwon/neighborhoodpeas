/**
 * NYC Map Agent — Walk Narrator Agent (Owned by Person C: Abheeshu Dhungana)
 *
 * Crafts real-time, street-level block narrations in English (`en`) and Spanish (`es`),
 * grounded 100% in NYC Open Data (`erm2-nwe9` 311 & `h9gi-nx95` NYPD Crashes),
 * and pre-generates adjacent block narrations so Person D hits the <2.0s SLA.
 */

import { verifyAgainstFactGate } from "../guardrails/factGate.mjs";
import { evaluateHonestByDesignGuardrails } from "../guardrails/honestGuardrails.mjs";

export function buildDeterministicBlockNarration(blockFixture, language = "en") {
  const s311 = blockFixture.summary311;
  const crash = blockFixture.intersectionCrashes;
  const topIssue =
    s311.topDescriptors?.[0]?.plainLanguageLabel?.[language] ||
    (language === "es" ? "reportes vecinales" : "resident reports");

  const crossCorner = blockFixture.toCrossStreet.replace(/\s+(Avenue|Street)$/i, "");
  const hasVulnerableInjury =
    crash.pedestrianInjuries > 0 || crash.cyclistInjuries > 0;

  if (language === "es") {
    let crashSentence = `En la siguiente esquina, cruzando ${crossCorner}: ${crash.totalCrashes} choques este año.`;
    if (crash.pedestrianInjuries > 0) {
      crashSentence = `En la siguiente esquina, cruzando ${crossCorner}: ${crash.totalCrashes} choques este año, ${crash.pedestrianInjuries} involucrando a un peatón. Precaución en esta esquina.`;
    } else if (crash.cyclistInjuries > 0) {
      crashSentence = `En la siguiente esquina, cruzando ${crossCorner}: ${crash.totalCrashes} choques este año, ${crash.cyclistInjuries} involucrando a un ciclista. Precaución en esta esquina.`;
    }

    return `Estás en ${blockFixture.streetName}. Esta cuadra tuvo ${s311.totalComplaints} quejas al 311 el mes pasado, principalmente por ${topIssue}. ${s311.openComplaints} siguen abiertas. ${crashSentence}`;
  }

  // English narration (matches PRD "Magic Moment" verbatim structure on Block 1)
  const isNoiseBlock =
    s311.topDescriptors?.[0]?.category?.toLowerCase().includes("noise");
  const complaintTypePhrase = isNoiseBlock ? "noise complaints" : "311 complaints";

  let crashSentence = `Next block, crossing ${crossCorner}: ${crash.totalCrashes} crashes this year.`;
  if (crash.pedestrianInjuries > 0) {
    crashSentence = `Next block, crossing ${crossCorner}: ${crash.totalCrashes} crashes this year, ${crash.pedestrianInjuries} involving a pedestrian. Heads up at this corner.`;
  } else if (crash.cyclistInjuries > 0) {
    crashSentence = `Next block, crossing ${crossCorner}: ${crash.totalCrashes} crashes this year, ${crash.cyclistInjuries} involving a cyclist. Heads up at this corner.`;
  }

  return `You're on ${blockFixture.streetName}. This block had ${s311.totalComplaints} ${complaintTypePhrase} last month, mostly ${topIssue}. ${s311.openComplaints} are still open. ${crashSentence}`;
}

export function runWalkNarratorAgent({
  blockFixture,
  nextBlockFixture = null,
  language = "en",
  candidateOverrideText = null,
}) {
  const startMs = performance.now();
  const deterministicScript = buildDeterministicBlockNarration(blockFixture, language);
  const candidate = candidateOverrideText || deterministicScript;

  const factCheck = verifyAgainstFactGate(
    candidate,
    blockFixture,
    deterministicScript
  );

  const guardrail = evaluateHonestByDesignGuardrails(
    "",
    language,
    blockFixture.intersectionCrashes
  );

  const hasCornerWarning =
    blockFixture.intersectionCrashes.pedestrianInjuries > 0 ||
    blockFixture.intersectionCrashes.cyclistInjuries > 0;

  let prefetchedNextBlock = undefined;
  if (nextBlockFixture) {
    const nextText = buildDeterministicBlockNarration(nextBlockFixture, language);
    prefetchedNextBlock = {
      blockId: nextBlockFixture.blockId,
      spokenText: nextText,
      captionText: nextText,
    };
  }

  const generatedInMs = Number((performance.now() - startMs).toFixed(2));

  return {
    narrationPayload: {
      blockId: blockFixture.blockId,
      language,
      spokenText: factCheck.verifiedText,
      captionText: factCheck.verifiedText,
      hasCornerWarning,
      dataLagNotice: guardrail.dataLagDisclosure,
      prefetchedNextBlock,
      generatedInMs,
    },
    glassBoxTrace: [
      {
        stepId: `walk-narrator-${blockFixture.blockId}`,
        timestampIso: new Date().toISOString(),
        agentName: "WalkNarratorAgent",
        actionSummary: `Synthesized street-level narration for ${blockFixture.streetName} (${blockFixture.fromCrossStreet} to ${blockFixture.toCrossStreet})`,
        executedQuery: blockFixture.summary311.executedQuery,
        sourceDatasetId: "erm2-nwe9",
        verifiedNumbers: factCheck.extractedNumbers,
        factCheckPassed: factCheck.passed,
        dataLagDisclosure: guardrail.dataLagDisclosure,
      },
    ],
  };
}
