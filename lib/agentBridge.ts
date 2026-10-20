// Connects the live walk (Person A + lib/blockData) to Person C's agents and Person E's Glass Box.
// Person C's agents were written against fixture blocks; this turns live NYC Open Data results
// into that same shape so the Walk Narrator, Q&A, Fact Gate and guardrails run on real numbers.
import { runWalkNarratorAgent } from "../src/person-c/agents/walkNarratorAgent.mjs";
import { answerSpokenBlockQuestion } from "../src/person-c/agents/orchestrator.mjs";
import type { BlockContext } from "./streetGraph";
import type { BlockData } from "./blockData";
import type { Query311AccountabilityResult } from "./contracts";
import { stepFrom311, stepFromCrashes, type GlassBoxStep } from "./glassBox";

/** Person C's trace step (see src/person-c/types/contracts.ts). */
interface PersonCTrace {
  stepId: string;
  agentName: string;
  actionSummary: string;
  executedQuery?: string;
  sourceDatasetId?: "erm2-nwe9" | "h9gi-nx95";
  verifiedNumbers?: number[];
  factCheckPassed?: boolean;
  dataLagDisclosure?: string;
}

const NOISE = /noise|loud|music|party|barking|banging|car\/truck horn|engine idling/i;

function monthsBetween(isoDate: string, now = new Date()): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 4;
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / (30.44 * 864e5)));
}

function summary(block: BlockContext, r: Query311AccountabilityResult, noiseOnly: boolean) {
  return {
    blockId: block.blockId,
    timeWindowDays: 30,
    totalComplaints: r.totalComplaints,
    openComplaints: r.openComplaints,
    closedNoActionCount: r.closedNoActionCount,
    repeatLocationCount: r.repeatLocationCount,
    medianResponseHours: r.medianResponseHours,
    // We only compute the median; reuse it rather than invent an average.
    averageResponseHours: r.medianResponseHours,
    topDescriptors: r.topDescriptors.map((t) => {
      const label = t.descriptor.toLowerCase();
      return {
        category: noiseOnly || NOISE.test(t.descriptor) ? "Noise" : t.descriptor,
        descriptor: t.descriptor,
        plainLanguageLabel: { en: label, es: label },
        count: t.count,
      };
    }),
    sourceDatasetId: "erm2-nwe9" as const,
    executedQuery: r.executedQuery,
  };
}

/**
 * Live block → Person C fixture shape.
 * `focus: "noise"` makes the narration about noise complaints (falls back to all 311 if there are none).
 */
export function toPersonCBlock(block: BlockContext, data: BlockData, focus: "noise" | "all" = "all") {
  const useNoise = focus === "noise" && data.noise.totalComplaints > 0;
  const c = data.crashes;
  return {
    blockId: block.blockId,
    streetName: block.streetName,
    fromCrossStreet: block.fromCrossStreet,
    toCrossStreet: block.toCrossStreet,
    upcomingIntersection: block.upcomingIntersection.name,
    borough: block.borough,
    councilDistrict: data.councilDistrict,
    communityBoard: block.communityBoard,
    boundingBoxWKT: block.boundingBoxWKT,
    adjacentNextBlockId: block.nextBlockId,
    summary311: summary(block, useNoise ? data.noise : data.all311, useNoise),
    intersectionCrashes: {
      intersectionId: `int-${block.blockId}`,
      intersectionName: block.upcomingIntersection.name,
      timeWindowMonths: 12,
      totalCrashes: c.totalCrashes,
      pedestrianInjuries: c.pedestrianInjuries,
      cyclistInjuries: c.cyclistInjuries,
      motoristInjuries: c.motoristInjuries,
      fatalities: c.fatalities,
      dataThroughDate: c.dataThroughDate,
      dataLagMonths: monthsBetween(c.dataThroughDate),
      sourceDatasetId: "h9gi-nx95" as const,
      executedQuery: c.executedQuery,
    },
  };
}

function cTraceToStep(t: PersonCTrace, startedAt: number, durationMs?: number): GlassBoxStep {
  const verified = t.verifiedNumbers?.length ? ` Numbers checked: ${t.verifiedNumbers.join(", ")}.` : "";
  const gate = t.factCheckPassed === undefined ? "" : t.factCheckPassed ? " Fact gate: passed." : " Fact gate: blocked unverified numbers.";
  return {
    id: `${t.stepId}-${startedAt}`,
    tool: t.sourceDatasetId === "h9gi-nx95" ? "query_intersection_crashes" : "query_311_accountability",
    agentLabel: t.agentName.replace(/([a-z])([A-Z])/g, "$1 $2"),
    status: "done",
    startedAt,
    durationMs,
    query: t.executedQuery,
    datasetId: t.sourceDatasetId,
    notice: `${t.actionSummary}.${verified}${gate}`,
  };
}

const r1 = (n: number) => Math.round(n);

/** Glass Box rows for one block: the street lookup, both data queries, then Person C's narrator. */
export function blockSteps(block: BlockContext, data: BlockData, narratorTrace: PersonCTrace[], narratorMs: number): GlassBoxStep[] {
  const { startedAt, s311Ms, crashMs } = data.timings;
  const area = { street: block.streetName, between: `${block.fromCrossStreet} and ${block.toCrossStreet}`, window: "30 days" };
  return [
    {
      id: `resolve-${block.blockId}-${startedAt}`,
      tool: "resolve_street_block",
      status: "done",
      startedAt,
      durationMs: 0,
      filters: {
        block: `${block.streetName}: ${block.fromCrossStreet} → ${block.toCrossStreet}`,
        borough: block.borough,
        "council district": data.councilDistrict ?? "unknown",
      },
      query: block.boundingBoxWKT,
      notice: block.blockId.startsWith("cscl-") ? "Block geometry from NYC street centerline (inkn-q76z)." : "Block geometry from OpenStreetMap.",
    },
    stepFrom311(data.all311, { id: `311-${block.blockId}-${startedAt}`, startedAt, durationMs: r1(s311Ms), filters: { ...area, noise: data.noise.totalComplaints } }),
    stepFromCrashes(data.crashes, { id: `crash-${block.blockId}-${startedAt}`, startedAt, durationMs: r1(crashMs), filters: { corner: block.upcomingIntersection.name, window: "12 months of available data" } }),
    ...narratorTrace.map((t) => cTraceToStep(t, Date.now(), narratorMs)),
  ];
}

/** Person C's Walk Narrator on live data. */
export function narrateBlock(block: BlockContext, data: BlockData, language: "en" | "es" = "en") {
  const out = runWalkNarratorAgent({ blockFixture: toPersonCBlock(block, data, "noise"), language }) as {
    narrationPayload: { spokenText: string; captionText: string; dataLagNotice: string; generatedInMs: number };
    glassBoxTrace: PersonCTrace[];
  };
  return { text: out.narrationPayload.captionText, lagNotice: out.narrationPayload.dataLagNotice, ms: out.narrationPayload.generatedInMs, trace: out.glassBoxTrace };
}

/** Person C's grounded Q&A (with Honest-by-Design guardrails and Fact Gate) on live data. */
export function askAboutBlock(question: string, block: BlockContext, data: BlockData) {
  const out = answerSpokenBlockQuestion({ question, blockFixture: toPersonCBlock(block, data, "all") }) as {
    allowed: boolean;
    language: "en" | "es";
    spokenAnswer: string;
    generatedInMs: number;
    glassBoxTrace: PersonCTrace[];
  };
  return {
    answer: out.spokenAnswer,
    language: out.language,
    refused: !out.allowed,
    steps: out.glassBoxTrace.map((t) => cTraceToStep(t, Date.now(), out.generatedInMs)),
  };
}
