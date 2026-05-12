# PharmAgent DKG v10 Bounty Submission Draft

## Submission Summary

PharmAgent is a DKG v10 Working Memory and Shared Memory integration for clinical pharmacy autoresearch/documentation. It converts pharmacist-owned guideline PDFs into JSON-LD/RDF source excerpts, stages them to the `PharmAgent` context graph shared memory, retrieves relevant evidence for patient cases, and uses OpenClaw OAuth to draft concise French pharmacist chart notes.

## Official Round 1 Fit

The OriginTrail DKG v10 bounty Round 1 is focused on integrations that bring Working Memory and Shared Memory into LLM-wiki / autoresearch-style agents. PharmAgent fits this scope as follows:

- Agent integration: OpenClaw-backed clinical note generation.
- Working memory: transient pharmacist case details and optional document metadata.
- Shared memory: validated guideline excerpts staged to `did:dkg:context-graph:PharmAgent/_shared_memory`.
- Knowledge loop: PDF parsing -> JSON-LD/RDF -> DKG shared memory -> RAG retrieval -> LLM note -> source-backed refusal when knowledge is missing.

## Current Demo Evidence

- Website: https://aipharmagent.com
- Context graph: `PharmAgent`
- JSON-LD files: 9
- RAG records: 522
- Validation: all JSON-LD files pass `validate_jsonld.py`
- DKG staging: all 9 JSON-LD documents stage to `did:dkg:context-graph:PharmAgent/_shared_memory`
- Verification command: `node /root/npm/data/aipharmagent.com/bounty/verify-readiness.mjs`

## Recent Staging Proof

The latest working/shared-memory staging run returned SWM operation IDs for all current PharmAgent documents:

```text
anticoag-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528871765-r2e4zmzo
asthme-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528873302-6rcun7yq
dlp-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528880054-fzvnxjpz
dm-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528890563-fskkke7n
hta-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528901643-kmlrnp5w
hypot4-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528904472-b28p3kc7
migraine-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528906921-wbf2botz
mpoc-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528910598-041or4l0
tdah-boite-a-outil.jsonld: did:dkg:context-graph:PharmAgent/_shared_memory swm-1778528914020-sc7a0x1o
```

## Demo Script

1. Open https://aipharmagent.com.
2. Enter: `Patient de 76 ans avec TA 188/80 prend amlodipine 2,5 mg die. Rediger une intervention au dossier.`
3. PharmAgent retrieves HTA evidence from shared memory/RAG.
4. OpenClaw OAuth drafts a French note with:
   - Collecte de données
   - Analyse
   - Intervention et recommandations
   - Sources
5. Enter an unsupported case such as otite moyenne with amoxicilline/clavulanate.
6. PharmAgent refuses because no local PharmAgent evidence is available.

## Eligibility Assessment

Pass for Round 1 working/shared-memory demonstration:

- Uses DKG v10 context graph and shared-memory staging.
- Integrates with OpenClaw.
- Produces knowledge artifacts with provenance-oriented JSON-LD/RDF.
- Demonstrates retrieval, writing, collaboration-ready memory, and eventual verification path.
- Contributor-owned app can be packaged with registry manifest.

Not yet complete for future verified-memory rounds:

- Human curator workflow for promoting clinical sources to verified memory/on-chain DKG is not finalized.
- Pharmacist-uploaded guideline contribution flow is not yet public.
- Formal registry submission location and repository URL still need to be finalized.

## Files to Include in Repository

- `bounty/dkg-v10-integration.json`
- `bounty/verify-readiness.mjs`
- `bounty/SUBMISSION.md`
- `kg/schema/pharmagent.context.jsonld`
- `kg/schema/pharmagent.schema.json`
- `kg-pipeline/scripts/parsed_to_source_jsonld.py`
- `kg-pipeline/scripts/validate_jsonld.py`
- `kg-pipeline/scripts/build_embeddings.py`
- `kg-pipeline/scripts/stage_working_memory.mjs`
- `kg-rag.mjs`
- `server.mjs`
- `index.html`, `app.js`, `styles.css`

## Human Submission Steps Remaining

1. Publish the integration code to a contributor-owned repository.
2. Add screenshots or a short demo video showing the HTA supported case and unsupported refusal case.
3. Submit the repository, manifest, website URL, and DKG context graph details through the official bounty submission channel.
4. If requested by OriginTrail reviewers, run `stage_working_memory.mjs --publish` or the official verified-memory/registry flow with curator approval.
