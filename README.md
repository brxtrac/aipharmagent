# PharmAgent

PharmAgent is a clinical-pharmacy assistant and OriginTrail DKG v10 integration. It converts pharmacist-owned guideline/toolbox PDFs into JSON-LD/RDF source excerpts, stages them to the `PharmAgent` context graph shared memory, retrieves relevant evidence for a patient case, and uses an OpenClaw OAuth-backed LLM to draft a concise French chart note.

PharmAgent is documentation support for pharmacists. It does not replace professional judgment and refuses to provide a recommendation when local evidence is missing.

## DKG v10 Bounty Fit

Round 1 of the OriginTrail DKG v10 bounty focuses on Working Memory and Shared Memory integrations for LLM-wiki / autoresearch agents. PharmAgent demonstrates that flow for clinical pharmacy:

- Working memory: transient patient case and optional attachment metadata.
- Shared memory: validated PDF-derived JSON-LD/RDF guideline excerpts staged to `did:dkg:context-graph:PharmAgent/_shared_memory`.
- Agent integration: OpenClaw OAuth-backed drafting over retrieved evidence.
- Safety policy: no relevant local evidence means no clinical recommendation.

See [`bounty/SUBMISSION.md`](bounty/SUBMISSION.md) and [`bounty/dkg-v10-integration.json`](bounty/dkg-v10-integration.json).

## Current Corpus

The demo corpus includes 9 parsed French clinical toolboxes:

- anticoagulation
- asthme
- dyslipidémie
- diabète
- hypertension artérielle
- hypothyroïdie
- migraine
- MPOC
- TDAH

The current keyword RAG index contains 522 records when generated locally.

## Run Locally

```bash
npm run check
PORT=3088 npm start
```

The public app expects a local OpenClaw installation already authenticated with OAuth for default generation.

## Validate and Stage Knowledge

Install Python dependencies:

```bash
python3 -m venv kg-pipeline/.venv
kg-pipeline/.venv/bin/pip install -r kg-pipeline/requirements.txt
```

Validate JSON-LD:

```bash
kg-pipeline/.venv/bin/python kg-pipeline/scripts/validate_jsonld.py
```

Build keyword index:

```bash
kg-pipeline/.venv/bin/python kg-pipeline/scripts/build_embeddings.py --keyword-only
```

Stage to DKG shared memory:

```bash
DKG_AUTH_TOKEN=<token> node kg-pipeline/scripts/stage_working_memory.mjs
```

Run bounty readiness verification:

```bash
node bounty/verify-readiness.mjs
```

## Security Notes

- Do not commit local `.dkg`, `.openclaw`, `.env`, API keys, OAuth tokens, or generated embeddings containing operational data.
- JSON-LD clinical excerpts are marked `needsHumanReview: true` and `reviewStatus: human_review`.
- Verified/on-chain memory promotion is a separate curator review step.
