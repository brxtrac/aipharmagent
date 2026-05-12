# PharmAgent

PharmAgent is a clinical note assistant for pharmacists. It helps turn a patient scenario into a concise French intervention note that can be reviewed and copied into the pharmacy file.

The tool is designed for practical pharmacotherapy questions: hypertension, diabetes, anticoagulation, asthma, dyslipidemia, hypothyroidism, migraine, COPD/MPOC, ADHD/TDAH, and other supported domains as the knowledge base grows. PharmAgent retrieves evidence from local professional documents before drafting; if it cannot find relevant local knowledge, it refuses to provide a clinical recommendation.

PharmAgent supports documentation. It does not replace the pharmacist's clinical judgment.

## Why It Exists

Pharmacists often need to document a clear intervention quickly while still grounding the recommendation in clinical references. The goal of PharmAgent is to reduce drafting friction without turning the answer into a generic chatbot response.

The expected output is always structured for charting:

- **Collecte de données** — only the facts provided in the case.
- **Analyse** — targeted clinical reasoning for this patient.
- **Intervention et recommandations** — the recommended plan, monitoring, and follow-up.
- **Sources** — the main references found in the retrieved documents.

## How It Works

1. The pharmacist enters a patient scenario and may attach supporting documents.
2. PharmAgent retrieves relevant excerpts from the local clinical knowledge base.
3. If the retrieved evidence is sufficient, an OpenClaw-authenticated model drafts the note.
4. If the evidence is insufficient, PharmAgent returns a refusal note instead of guessing.

## Clinical Knowledge Base

The current demo corpus includes parsed French clinical toolboxes covering:

- anticoagulation
- asthme
- dyslipidémie
- diabète
- hypertension artérielle
- hypothyroïdie
- migraine
- MPOC
- TDAH

The PDF-derived content is converted into JSON-LD/RDF source excerpts. Generated clinical source entries are marked for human review before any verified-memory promotion.

## Local Development

```bash
npm run check
PORT=3088 npm start
```

The default generation path expects a local OpenClaw installation already authenticated with OAuth.

## Knowledge Pipeline

Install Python dependencies:

```bash
python3 -m venv kg-pipeline/.venv
kg-pipeline/.venv/bin/pip install -r kg-pipeline/requirements.txt
```

Validate JSON-LD:

```bash
kg-pipeline/.venv/bin/python kg-pipeline/scripts/validate_jsonld.py
```

Build the keyword retrieval index:

```bash
kg-pipeline/.venv/bin/python kg-pipeline/scripts/build_embeddings.py --keyword-only
```

Stage reviewed knowledge to the local graph memory layer:

```bash
DKG_AUTH_TOKEN=<token> node kg-pipeline/scripts/stage_working_memory.mjs
```

Run readiness checks:

```bash
node bounty/verify-readiness.mjs
```

## Safety and Privacy Notes

- PharmAgent is for pharmacist documentation support, not autonomous prescribing.
- Recommendations are limited by the quality and coverage of the local knowledge base.
- Unsupported cases should return a clear refusal rather than an LLM-only answer.
- Do not commit local `.dkg`, `.openclaw`, `.env`, API keys, OAuth tokens, embeddings, or runtime logs.
