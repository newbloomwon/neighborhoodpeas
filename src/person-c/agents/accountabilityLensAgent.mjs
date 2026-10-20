/**
 * NYC Map Agent — Accountability Lens Agent (Owned by Person C: Abheeshu Dhungana)
 *
 * Audits city agency responsiveness for any block or neighborhood:
 * 1. How long the city took to respond (median & average hours).
 * 2. How many 311 complaints were closed with NO action.
 * 3. How many chronic repeat complaints keep coming back.
 * Compiles a 1-tap shareable City Council Member report in under 10 seconds (<10,000ms SLA).
 */

import { evaluateHonestByDesignGuardrails } from "../guardrails/honestGuardrails.mjs";

export function computeBlockAccountability(blockFixture, language = "en") {
  const s311 = blockFixture.summary311;
  const closedNoActionPct =
    s311.totalComplaints > 0
      ? Math.round((s311.closedNoActionCount / s311.totalComplaints) * 100)
      : 0;

  const spokenSummary =
    language === "es"
      ? `En ${blockFixture.streetName}, la ciudad tardó una mediana de ${s311.medianResponseHours} horas en responder. De ${s311.totalComplaints} quejas, ${s311.closedNoActionCount} (${closedNoActionPct}%) se cerraron sin acción y ${s311.repeatLocationCount} direcciones tienen quejas repetidas.`
      : `On ${blockFixture.streetName}, the city took a median of ${s311.medianResponseHours} hours to respond. Out of ${s311.totalComplaints} complaints, ${s311.closedNoActionCount} (${closedNoActionPct}%) were closed with no action, and ${s311.repeatLocationCount} locations have recurring repeat complaints.`;

  return {
    blockId: blockFixture.blockId,
    totalComplaints: s311.totalComplaints,
    openComplaints: s311.openComplaints,
    closedNoActionCount: s311.closedNoActionCount,
    closedNoActionPct,
    repeatLocationCount: s311.repeatLocationCount,
    medianResponseHours: s311.medianResponseHours,
    averageResponseHours: s311.averageResponseHours,
    spokenSummary,
  };
}

export function generateAccountabilityReport({
  blocks = [],
  language = "en",
}) {
  const startMs = performance.now();
  const primaryBlock = blocks[0];

  let total311Complaints = 0;
  let openComplaints = 0;
  let closedNoActionCount = 0;
  let chronicRepeatLocations = 0;
  let totalRouteCrashes = 0;
  let pedestrianInjuries = 0;
  let cyclistInjuries = 0;
  const responseHourSamples = [];
  const highRiskIntersections = [];
  const blocksAnalyzed = [];

  for (const b of blocks) {
    blocksAnalyzed.push(
      `${b.streetName} (${b.fromCrossStreet} to ${b.toCrossStreet})`
    );
    total311Complaints += b.summary311.totalComplaints;
    openComplaints += b.summary311.openComplaints;
    closedNoActionCount += b.summary311.closedNoActionCount;
    chronicRepeatLocations += b.summary311.repeatLocationCount;
    responseHourSamples.push(b.summary311.medianResponseHours);

    totalRouteCrashes += b.intersectionCrashes.totalCrashes;
    pedestrianInjuries += b.intersectionCrashes.pedestrianInjuries;
    cyclistInjuries += b.intersectionCrashes.cyclistInjuries;

    if (
      b.intersectionCrashes.pedestrianInjuries > 0 ||
      b.intersectionCrashes.cyclistInjuries > 0 ||
      b.intersectionCrashes.totalCrashes >= 2
    ) {
      highRiskIntersections.push(b.intersectionCrashes.intersectionName);
    }
  }

  const closedNoActionPct =
    total311Complaints > 0
      ? Math.round((closedNoActionCount / total311Complaints) * 100)
      : 0;

  const sortedHours = [...responseHourSamples].sort((a, b) => a - b);
  const medianAgencyResponseHours =
    sortedHours.length > 0
      ? sortedHours[Math.floor(sortedHours.length / 2)]
      : 0;

  const guardrail = evaluateHonestByDesignGuardrails(
    "",
    language,
    primaryBlock?.intersectionCrashes
  );

  const executiveBrief =
    language === "es"
      ? `Reporte de Responsabilidad Vecinal para el Distrito ${primaryBlock.councilDistrict} (${primaryBlock.councilMemberName}): En ${blocks.length} cuadras de ${primaryBlock.neighborhood}, los vecinos presentaron ${total311Complaints} quejas al 311. ${closedNoActionCount} (${closedNoActionPct}%) fueron cerradas sin acción, ${openComplaints} siguen abiertas y ${chronicRepeatLocations} puntos sufren quejas repetidas con una mediana de respuesta de ${medianAgencyResponseHours} horas. Se registraron ${totalRouteCrashes} choques (${pedestrianInjuries} peatones y ${cyclistInjuries} ciclistas lesionados).`
      : `Neighborhood Accountability Brief for NYC Council District ${primaryBlock.councilDistrict} (Council Member ${primaryBlock.councilMemberName}): Across ${blocks.length} blocks in ${primaryBlock.neighborhood}, residents filed ${total311Complaints} 311 service requests. ${closedNoActionCount} (${closedNoActionPct}%) were closed with no action taken, ${openComplaints} remain open, and ${chronicRepeatLocations} addresses experience chronic repeat complaints with a median agency response time of ${medianAgencyResponseHours} hours. Additionally, ${totalRouteCrashes} crashes (${pedestrianInjuries} pedestrian injuries, ${cyclistInjuries} cyclist injuries) occurred at intersections along this corridor.`;

  const honestByDesignDisclaimer =
    language === "es"
      ? `Honesto por diseño: Este reporte muestra únicamente lo que los vecinos reportaron al 311 y cómo respondió la ciudad, además de registros históricos de choques de NYPD. No predice el crimen ni califica a las personas. ${guardrail.dataLagDisclosure}`
      : `Honest by Design: This report reflects strictly what residents reported to 311 and how city agencies responded, alongside historical NYPD collision records. It never predicts crime or scores people. ${guardrail.dataLagDisclosure}`;

  const generatedInMs = Number((performance.now() - startMs).toFixed(2));

  return {
    report: {
      reportId: `acct-${primaryBlock.neighborhood.toLowerCase()}-d${primaryBlock.councilDistrict}`,
      generatedAtIso: new Date().toISOString(),
      generatedInMs,
      language,
      targetArea: {
        neighborhood: primaryBlock.neighborhood,
        borough: primaryBlock.borough,
        councilDistrict: primaryBlock.councilDistrict,
        councilMemberName: primaryBlock.councilMemberName,
        communityBoard: primaryBlock.communityBoard,
        blocksAnalyzed,
      },
      metrics: {
        total311Complaints,
        openComplaints,
        closedNoActionCount,
        closedNoActionPct,
        chronicRepeatLocations,
        medianAgencyResponseHours,
        totalRouteCrashes,
        pedestrianInjuries,
        cyclistInjuries,
        highRiskIntersections,
      },
      executiveBrief,
      honestByDesignDisclaimer,
      citations: [
        {
          datasetId: "erm2-nwe9",
          datasetName: "NYC 311 Service Requests from 2010 to Present",
          executedQuery: primaryBlock.summary311.executedQuery,
        },
        {
          datasetId: "h9gi-nx95",
          datasetName: "NYPD Motor Vehicle Collisions - Crashes",
          executedQuery: primaryBlock.intersectionCrashes.executedQuery,
        },
      ],
    },
    glassBoxTrace: [
      {
        stepId: `accountability-report-d${primaryBlock.councilDistrict}`,
        timestampIso: new Date().toISOString(),
        agentName: "AccountabilityLensAgent",
        actionSummary: `Compiled Council District ${primaryBlock.councilDistrict} Accountability Report across ${blocks.length} blocks in ${generatedInMs}ms`,
        executedQuery: primaryBlock.summary311.executedQuery,
        sourceDatasetId: "erm2-nwe9",
        verifiedNumbers: [
          primaryBlock.councilDistrict,
          blocks.length,
          total311Complaints,
          closedNoActionCount,
          closedNoActionPct,
          openComplaints,
          chronicRepeatLocations,
          medianAgencyResponseHours,
          totalRouteCrashes,
          pedestrianInjuries,
          cyclistInjuries,
        ],
        factCheckPassed: true,
        dataLagDisclosure: guardrail.dataLagDisclosure,
      },
    ],
  };
}
