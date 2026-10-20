/**
 * NYC Map Agent — Central Multi-Agent Orchestrator (Owned by Person C: Abheeshu Dhungana)
 *
 * Routes:
 * 1. `walk_block` -> WalkNarratorAgent (+ adjacent next-block pre-fetch for <2s voice SLA)
 * 2. `scout_route` -> SafeRouteScoutAgent (corner-by-corner crash risk readout)
 * 3. `ask_question` -> Grounded bilingual Q&A over 311 & NYPD Crash data (with 0-hallucination Fact Gate)
 * 4. `export_report` -> AccountabilityLensAgent (<10s Council Member report)
 */

import {
  BUSHWICK_5_BLOCK_ROUTE,
  getBlockFixtureById,
} from "../fixtures/bushwickMagicMoment.mjs";
import { evaluateHonestByDesignGuardrails } from "../guardrails/honestGuardrails.mjs";
import { verifyAgainstFactGate } from "../guardrails/factGate.mjs";
import { runWalkNarratorAgent } from "./walkNarratorAgent.mjs";
import { runSafeRouteScoutAgent } from "./safeRouteScoutAgent.mjs";
import {
  computeBlockAccountability,
  generateAccountabilityReport,
} from "./accountabilityLensAgent.mjs";

/**
 * Detects language ("en" or "es") if not explicitly supplied.
 */
export function detectLanguage(text = "", explicitLanguage = null) {
  if (explicitLanguage === "en" || explicitLanguage === "es") {
    return explicitLanguage;
  }
  const spanishPattern =
    /[áéíóúñ¿¡]|\b(cuántas|cuánto|quejas|cuadra|ciudad|choques|concejal|calle|abiertas)\b/i;
  return spanishPattern.test(text) ? "es" : "en";
}

/**
 * Answers a spoken question about a block using 100% deterministic figures from NYC Open Data.
 */
export function answerSpokenBlockQuestion({
  question = "",
  blockId = "bk-knickerbocker-01",
  language = null,
  candidateLLMResponse = null,
}) {
  const startMs = performance.now();
  const resolvedLang = detectLanguage(question, language);
  const blockFixture = getBlockFixtureById(blockId);
  const s311 = blockFixture.summary311;
  const crash = blockFixture.intersectionCrashes;

  // Step 1: Check Honest-by-Design policy guardrails first
  const guardrail = evaluateHonestByDesignGuardrails(
    question,
    resolvedLang,
    crash
  );

  if (!guardrail.allowed) {
    return {
      allowed: false,
      language: resolvedLang,
      spokenAnswer: guardrail.refusalMessage,
      verifiedNumbers: [311, crash.dataLagMonths],
      factCheckPassed: true,
      dataLagDisclosure: guardrail.dataLagDisclosure,
      generatedInMs: Number((performance.now() - startMs).toFixed(2)),
      glassBoxTrace: [
        {
          stepId: `guardrail-refusal-${Date.now()}`,
          timestampIso: new Date().toISOString(),
          agentName: "HonestByDesignGuardrail",
          actionSummary:
            "Blocked predictive crime / people-scoring request per Honest-by-Design policy",
          verifiedNumbers: [311],
          factCheckPassed: true,
          dataLagDisclosure: guardrail.dataLagDisclosure,
        },
      ],
    };
  }

  // Step 2: Route question to exact structured metrics
  const qLower = question.toLowerCase();
  let deterministicAnswer = "";
  let datasetUsed = "erm2-nwe9";
  let queryUsed = s311.executedQuery;

  const closedNoActionPct =
    s311.totalComplaints > 0
      ? Math.round((s311.closedNoActionCount / s311.totalComplaints) * 100)
      : 0;

  if (
    qLower.includes("no action") ||
    qLower.includes("sin acción") ||
    qLower.includes("respond") ||
    qLower.includes("responder") ||
    qLower.includes("accountability") ||
    qLower.includes("repeat")
  ) {
    const acct = computeBlockAccountability(blockFixture, resolvedLang);
    deterministicAnswer = acct.spokenSummary;
  } else if (
    qLower.includes("crash") ||
    qLower.includes("choque") ||
    qLower.includes("pedestrian") ||
    qLower.includes("peatón") ||
    qLower.includes("cyclist") ||
    qLower.includes("corner") ||
    qLower.includes("myrtle")
  ) {
    datasetUsed = "h9gi-nx95";
    queryUsed = crash.executedQuery;
    deterministicAnswer =
      resolvedLang === "es"
        ? `En ${crash.intersectionName}, hubo ${crash.totalCrashes} choques en los últimos ${crash.timeWindowMonths} meses, con ${crash.pedestrianInjuries} peatones lesionados y ${crash.cyclistInjuries} ciclistas lesionados. ${guardrail.dataLagDisclosure}`
        : `At ${crash.intersectionName}, there were ${crash.totalCrashes} crashes over the past ${crash.timeWindowMonths} months, with ${crash.pedestrianInjuries} pedestrian injuries and ${crash.cyclistInjuries} cyclist injuries. ${guardrail.dataLagDisclosure}`;
  } else if (
    qLower.includes("party") ||
    qLower.includes("parties") ||
    qLower.includes("fiesta") ||
    qLower.includes("loud music")
  ) {
    const partyCount = s311.topDescriptors?.[0]?.count ?? 0;
    deterministicAnswer =
      resolvedLang === "es"
        ? `De las ${s311.totalComplaints} quejas en ${blockFixture.streetName}, ${partyCount} fueron por fiestas nocturnas o música alta, y ${s311.openComplaints} siguen abiertas.`
        : `Out of ${s311.totalComplaints} complaints on ${blockFixture.streetName}, ${partyCount} were for late-night parties, and ${s311.openComplaints} are still open.`;
  } else if (qLower.includes("open") || qLower.includes("abiertas")) {
    deterministicAnswer =
      resolvedLang === "es"
        ? `Actualmente hay ${s311.openComplaints} quejas abiertas de un total de ${s311.totalComplaints} el último mes en ${blockFixture.streetName}.`
        : `There are currently ${s311.openComplaints} open complaints out of ${s311.totalComplaints} total complaints last month on ${blockFixture.streetName}.`;
  } else {
    deterministicAnswer =
      resolvedLang === "es"
        ? `En ${blockFixture.streetName} hubo ${s311.totalComplaints} quejas al 311 en los últimos ${s311.timeWindowDays} días (${s311.openComplaints} abiertas, ${s311.closedNoActionCount} cerradas sin acción, mediana de respuesta de ${s311.medianResponseHours} horas) y ${crash.totalCrashes} choques en ${crash.intersectionName}.`
        : `On ${blockFixture.streetName}, there were ${s311.totalComplaints} 311 complaints in the last ${s311.timeWindowDays} days (${s311.openComplaints} still open, ${s311.closedNoActionCount} closed with no action, ${s311.medianResponseHours} hours median response) and ${crash.totalCrashes} crashes at ${crash.intersectionName}.`;
  }

  if (guardrail.requiresRealtimeLagClarification) {
    deterministicAnswer = `${guardrail.clarificationPrefix} ${deterministicAnswer}`;
  }

  // Step 3: Verify candidate text through Zero-Hallucination Fact Gate
  const candidate = candidateLLMResponse || deterministicAnswer;
  const factCheck = verifyAgainstFactGate(
    candidate,
    blockFixture,
    deterministicAnswer
  );

  const generatedInMs = Number((performance.now() - startMs).toFixed(2));

  return {
    allowed: true,
    language: resolvedLang,
    spokenAnswer: factCheck.verifiedText,
    verifiedNumbers: factCheck.extractedNumbers,
    factCheckPassed: factCheck.passed,
    unverifiedNumbersBlocked: factCheck.unverifiedNumbers,
    dataLagDisclosure: guardrail.dataLagDisclosure,
    generatedInMs,
    glassBoxTrace: [
      {
        stepId: `qa-fact-gate-${blockFixture.blockId}`,
        timestampIso: new Date().toISOString(),
        agentName: "ZeroHallucinationFactGate",
        actionSummary: factCheck.passed
          ? `Verified all spoken numbers against ${datasetUsed}`
          : `Blocked hallucinated numbers [${factCheck.unverifiedNumbers.join(", ")}] and enforced ground-truth figures from ${datasetUsed}`,
        executedQuery: queryUsed,
        sourceDatasetId: datasetUsed,
        verifiedNumbers: factCheck.extractedNumbers,
        factCheckPassed: factCheck.passed,
        dataLagDisclosure: guardrail.dataLagDisclosure,
      },
    ],
  };
}

/**
 * Master entry point for Person C's Multi-Agent Orchestrator.
 */
export function orchestratePersonCAgent(request = {}) {
  const {
    action = "walk_block",
    blockId = "bk-knickerbocker-01",
    question = "",
    language = null,
    routeBlocks = BUSHWICK_5_BLOCK_ROUTE,
    candidateLLMResponse = null,
  } = request;

  const resolvedLang = detectLanguage(question, language);

  if (action === "walk_block") {
    const currentBlock = getBlockFixtureById(blockId);
    const nextBlock = currentBlock.adjacentNextBlockId
      ? getBlockFixtureById(currentBlock.adjacentNextBlockId)
      : null;

    return runWalkNarratorAgent({
      blockFixture: currentBlock,
      nextBlockFixture: nextBlock,
      language: resolvedLang,
      candidateOverrideText: candidateLLMResponse,
    });
  }

  if (action === "scout_route") {
    return runSafeRouteScoutAgent({
      routeBlocks,
      language: resolvedLang,
    });
  }

  if (action === "export_report") {
    return generateAccountabilityReport({
      blocks: routeBlocks,
      language: resolvedLang,
    });
  }

  if (action === "ask_question") {
    return answerSpokenBlockQuestion({
      question,
      blockId,
      language: resolvedLang,
      candidateLLMResponse,
    });
  }

  throw new Error(`Unsupported Person C orchestrator action: ${action}`);
}
