# Person C Module: Multi-Agent Brain, Safe Route Scout & Accountability Lens

**Owner:** Abheeshu Dhungana (**Person C**)  
**Branch:** `person-C`  

## What Person C Owns
1. **Multi-Agent Orchestrator (`src/person-c/agents/orchestrator.mjs`):** Routes `walk_block`, `scout_route`, `ask_question`, and `export_report` events across the specialist agents.
2. **Walk Narrator Agent (`src/person-c/agents/walkNarratorAgent.mjs`):** Synthesizes calm, street-level bilingual (`en` / `es`) narrations and pre-fetches the adjacent block (`adjacentNextBlockId`) so **Person D** hits the **$< 2.0\text{s}$** block-to-voice SLA.
3. **Safe Route Scout Agent (`src/person-c/agents/safeRouteScoutAgent.mjs`):** Evaluates pedestrian routes corner-by-corner, flagging pedestrian and cyclist injury hotspots (*"Heads up at this corner"*).
4. **Accountability Lens Agent (`src/person-c/agents/accountabilityLensAgent.mjs`):** Computes median agency response hours, *"Closed with no action"* percentages, and chronic repeat complaint locations, and generates a shareable **Council Member Accountability Report** in **$< 10\text{ seconds}$**.
5. **Zero-Hallucination Fact Gate (`src/person-c/guardrails/factGate.mjs`):** Verifies 100% of spoken integers against **Person B**'s structured NYC Open Data payloads (`erm2-nwe9` & `h9gi-nx95`).
6. **"Honest by Design" Guardrails (`src/person-c/guardrails/honestGuardrails.mjs`):** Blocks predictive crime scoring or people/demographic scoring and enforces the spoken + on-screen **~4-month NYPD crash data lag disclosure**.

## Running Automated Verification
```bash
node --test tests/person-c.test.mjs
```
