# PharmAgent DKG v10 Bounty Readiness

PharmAgent is a clinical-pharmacy integration for the DKG v10 Round 1 theme: Working Memory and Shared Memory for LLM-wiki / autoresearch-style agents.

## What PharmAgent Does

PharmAgent lets a pharmacist enter a patient case, retrieves relevant local guideline evidence, and asks an OpenClaw OAuth-backed LLM to produce a concise French chart note with exactly four sections:

- Collecte de données
- Analyse
- Intervention et recommandations
- Sources

If no local PharmAgent knowledge is retrieved, the app refuses to provide a clinical recommendation.

## DKG v10 Memory Fit

- Working Memory: per-case pharmacist input and optional document metadata are transient session context.
- Shared Memory: validated PDF-derived JSON-LD/RDF guideline excerpts are staged into `did:dkg:context-graph:PharmAgent/_shared_memory`.
- Verified Memory roadmap: human-reviewed guideline assets can be promoted to verified/on-chain DKG memory once curator review/publish is enabled.

## Current Evidence Corpus

The local PharmAgent context graph currently includes 9 parsed guideline/toolbox PDFs converted to JSON-LD:

- Anticoagulation
- Asthme
- Dyslipidemie
- Diabete
- Hypertension arterielle
- Hypothyroidie
- Migraine
- MPOC
- TDAH

The current RAG index contains 522 records.

## Key Commands

Validate JSON-LD:

```bash
/root/npm/data/aipharmagent.com/kg-pipeline/.venv/bin/python \
  /root/npm/data/aipharmagent.com/kg-pipeline/scripts/validate_jsonld.py
```

Rebuild keyword RAG index:

```bash
/root/npm/data/aipharmagent.com/kg-pipeline/.venv/bin/python \
  /root/npm/data/aipharmagent.com/kg-pipeline/scripts/build_embeddings.py --keyword-only
```

Stage to DKG v10 working/shared memory:

```bash
DKG_AUTH_TOKEN=<daemon-token> \
node /root/npm/data/aipharmagent.com/kg-pipeline/scripts/stage_working_memory.mjs
```

Publish mode, for curator-reviewed verified-memory flow when available:

```bash
DKG_AUTH_TOKEN=<daemon-token> \
node /root/npm/data/aipharmagent.com/kg-pipeline/scripts/stage_working_memory.mjs --publish
```

Run readiness verification:

```bash
node /root/npm/data/aipharmagent.com/bounty/verify-readiness.mjs
```

## Bounty Status

Ready for Round 1 working/shared-memory demonstration, subject to packaging in a contributor-owned repository and any official submission form/registry requirements. Verified memory/on-chain anchoring is intentionally treated as roadmap/future curator action for Round 2-style requirements.
