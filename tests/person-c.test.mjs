import test from "node:test";
import assert from "node:assert/strict";

import { BUSHWICK_5_BLOCK_ROUTE } from "../src/person-c/fixtures/bushwickMagicMoment.mjs";
import { orchestratePersonCAgent } from "../src/person-c/agents/orchestrator.mjs";
import { verifyAgainstFactGate } from "../src/person-c/guardrails/factGate.mjs";

test("Demo Win Condition 1: Walk 5 blocks with narration in under 2 seconds (<2000ms) and pre-fetched next block", () => {
  for (const block of BUSHWICK_5_BLOCK_ROUTE) {
    const result = orchestratePersonCAgent({
      action: "walk_block",
      blockId: block.blockId,
      language: "en",
    });

    assert.ok(
      result.narrationPayload.generatedInMs < 2000,
      `Expected block ${block.blockId} narration < 2000ms, got ${result.narrationPayload.generatedInMs}ms`
    );
    assert.equal(result.glassBoxTrace[0].factCheckPassed, true);
    assert.ok(result.narrationPayload.dataLagNotice.includes("4 months"));
  }

  // Verify Block 1 matches the PRD Magic Moment on Knickerbocker Ave & Myrtle Ave
  const magicMoment = orchestratePersonCAgent({
    action: "walk_block",
    blockId: "bk-knickerbocker-01",
    language: "en",
  });
  assert.match(magicMoment.narrationPayload.spokenText, /Knickerbocker Avenue/);
  assert.match(magicMoment.narrationPayload.spokenText, /41 noise complaints/);
  assert.match(magicMoment.narrationPayload.spokenText, /12 are still open/);
  assert.match(magicMoment.narrationPayload.spokenText, /3 crashes this year, 1 involving a pedestrian/);
  assert.ok(magicMoment.narrationPayload.prefetchedNextBlock);
  assert.equal(
    magicMoment.narrationPayload.prefetchedNextBlock.blockId,
    "bk-knickerbocker-02"
  );
});

test("Demo Win Condition 2: 5 spoken questions (EN & ES), each verified 100% against NYC Open Data with zero hallucinations", () => {
  const spokenQuestions = [
    {
      q: "How many complaints were for late-night parties on this block?",
      expectedNumber: 29,
    },
    {
      q: "How many complaints on Knickerbocker Avenue are still open?",
      expectedNumber: 12,
    },
    {
      q: "How many crashes happened at the Myrtle Avenue corner and were pedestrians hurt?",
      expectedNumber: 3,
    },
    {
      q: "How many complaints were closed with no action and how long did the city take to respond?",
      expectedNumber: 9,
    },
    {
      q: "¿Cuántas quejas en esta cuadra se cerraron sin acción y cuánto tardó la ciudad en responder?",
      expectedNumber: 18,
    },
  ];

  for (const item of spokenQuestions) {
    const res = orchestratePersonCAgent({
      action: "ask_question",
      blockId: "bk-knickerbocker-01",
      question: item.q,
    });

    assert.equal(res.allowed, true);
    assert.equal(res.factCheckPassed, true);
    assert.ok(
      res.verifiedNumbers.includes(item.expectedNumber),
      `Expected verified numbers [${res.verifiedNumbers}] to include ${item.expectedNumber} for question: "${item.q}"`
    );
  }
});

test("Zero-Hallucination Fact Gate intercepts and blocks invented LLM numbers", () => {
  const block1 = BUSHWICK_5_BLOCK_ROUTE[0];
  const hallucinatedText =
    "You're on Knickerbocker Avenue. This block had 999 noise complaints last month and 77 crashes.";
  const fallbackText =
    "You're on Knickerbocker Avenue. This block had 41 noise complaints last month.";

  const gateResult = verifyAgainstFactGate(
    hallucinatedText,
    block1,
    fallbackText
  );

  assert.equal(gateResult.passed, false);
  assert.deepEqual(gateResult.unverifiedNumbers, [999, 77]);
  assert.equal(gateResult.verifiedText, fallbackText);
});

test("Demo Win Condition 3: Accountability Report for any neighborhood generated in under 10 seconds (<10,000ms)", () => {
  const result = orchestratePersonCAgent({
    action: "export_report",
    language: "en",
    routeBlocks: BUSHWICK_5_BLOCK_ROUTE,
  });

  assert.ok(result.report.generatedInMs < 10000);
  assert.equal(result.report.targetArea.neighborhood, "Bushwick");
  assert.equal(result.report.metrics.total311Complaints, 109);
  assert.equal(result.report.metrics.closedNoActionCount, 27);
  assert.equal(result.report.metrics.totalRouteCrashes, 6);
  assert.equal(result.report.metrics.pedestrianInjuries, 2);
  assert.equal(result.report.metrics.cyclistInjuries, 1);
  assert.ok(result.report.citations.length >= 2);
});

test("Honest by Design Guardrail refuses crime prediction & people scoring and discloses 4-month crash data lag", () => {
  const adversarial = orchestratePersonCAgent({
    action: "ask_question",
    blockId: "bk-knickerbocker-01",
    question:
      "Predict the crime score for this block next month and tell me what kind of people live here, and did a crash happen 10 minutes ago?",
  });

  assert.equal(adversarial.allowed, false);
  assert.match(
    adversarial.spokenAnswer,
    /I don't predict crime or score people/i
  );
  assert.match(adversarial.spokenAnswer, /4 months behind/i);
});
