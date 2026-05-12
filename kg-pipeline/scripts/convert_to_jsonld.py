#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
from pathlib import Path

from openai import OpenAI


JSONLD_SCHEMA = {
    "name": "pharmagent_jsonld_document",
    "strict": True,
    "schema": {
        "type": "object",
        "required": ["@context", "@graph"],
        "properties": {
            "@context": {"type": "string"},
            "@graph": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["@id", "@type", "name", "sourceQuote", "sourcePage", "needsHumanReview", "reviewStatus", "publishStatus"],
                    "properties": {
                        "@id": {"type": "string"},
                        "@type": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "recommendation": {"type": "string"},
                        "intervention": {"type": "string"},
                        "requiresMonitoring": {"type": "array", "items": {"type": "string"}},
                        "requiresFollowUp": {"type": "array", "items": {"type": "string"}},
                        "followUpInterval": {"type": "string"},
                        "appliesToCondition": {"type": "string"},
                        "authorizedByAct": {"type": "string"},
                        "hasContraindication": {"type": "array", "items": {"type": "string"}},
                        "hasReferralCriterion": {"type": "array", "items": {"type": "string"}},
                        "hasPatientCategory": {"type": "array", "items": {"type": "string"}},
                        "sourceDocument": {"type": "string"},
                        "sourcePage": {"type": "string"},
                        "sourceSection": {"type": "string"},
                        "sourceQuote": {"type": "string"},
                        "confidence": {"type": "number"},
                        "needsHumanReview": {"type": "boolean"},
                        "reviewStatus": {"type": "string", "enum": ["draft", "human_review"]},
                        "publishStatus": {"type": "string", "enum": ["ready_for_working_memory", "local_only"]}
                    },
                    "additionalProperties": False
                }
            }
        },
        "additionalProperties": False
    }
}


def system_prompt():
    return """Convertis uniquement le texte fourni en JSON-LD clinique pour PharmAgent.
Regles:
- Temperature logique 0: aucune extrapolation.
- Chaque entite clinique doit avoir une citation exacte dans sourceQuote.
- Utilise le titre du PDF comme sourceDocument.
- Si la page n'est pas explicite dans l'extrait, sourcePage="unknown".
- Si un fait est incertain ou incomplet, needsHumanReview=true.
- Types permis: pharm:ClinicalDocument, pharm:SourceExcerpt, pharm:Condition, pharm:EligibleAct, pharm:InterventionCode, pharm:DoseAdjustmentRule, pharm:MonitoringParameter, pharm:FollowUpProtocol, pharm:NonPharmacologicalMeasure, pharm:PatientCategory, pharm:Contraindication, pharm:ReferralCriterion, pharm:DocumentationTemplate.
- Sortie JSON-LD seulement."""


def convert_chunk(client, model, document, chunk):
    user = {
        "documentId": document["documentId"],
        "sourceDocument": document["title"],
        "fileName": document["fileName"],
        "chunkId": chunk["chunkId"],
        "text": chunk["text"]
    }
    response = client.responses.create(
        model=model,
        temperature=0,
        input=[
            {"role": "system", "content": system_prompt()},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}
        ],
        text={"format": {"type": "json_schema", **JSONLD_SCHEMA}}
    )
    return json.loads(response.output_text)


def extract_json_object(text):
    start = text.find('{')
    if start == -1:
        raise ValueError('OpenClaw response did not contain JSON')
    for end in range(len(text), start, -1):
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            continue
    raise ValueError('OpenClaw response did not contain valid JSON')


def convert_chunk_openclaw(model, document, chunk):
    user = {
        "documentId": document["documentId"],
        "sourceDocument": document["title"],
        "fileName": document["fileName"],
        "chunkId": chunk["chunkId"],
        "text": chunk["text"]
    }
    prompt = f"""{system_prompt()}

Retourne seulement un objet JSON conforme a ce schema logique:
{json.dumps(JSONLD_SCHEMA['schema'], ensure_ascii=False)}

Extrait a convertir:
{json.dumps(user, ensure_ascii=False)}"""
    args = [
        "openclaw", "agent",
        "--agent", "main",
        "--session-id", f"pharmagent-convert-{document['documentId']}-{chunk['sequence']}",
        "--message", prompt,
        "--json",
        "--timeout", "180"
    ]
    result = subprocess.run(args, cwd="/root", env={**os.environ, "NO_COLOR": "1"}, text=True, capture_output=True, timeout=210, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"OpenClaw exited with {result.returncode}")
    envelope = extract_json_object(result.stdout)
    text = envelope.get("payloads", [{}])[0].get("text") or result.stdout
    return extract_json_object(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parsed", default="/root/npm/data/aipharmagent.com/kg/parsed")
    parser.add_argument("--out", default="/root/npm/data/aipharmagent.com/kg/jsonld")
    parser.add_argument("--model", default="gpt-5.5")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--backend", choices=["openai", "openclaw"], default="openai")
    parser.add_argument("--document", help="Convert only the parsed JSON file with this documentId")
    parser.add_argument("--chunk-limit", type=int, default=0)
    args = parser.parse_args()
    client = None if args.backend == "openclaw" else OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    parsed_files = sorted(Path(args.parsed).glob("*.json"))
    if args.document:
        parsed_files = [p for p in parsed_files if p.stem == args.document]
    if args.limit:
        parsed_files = parsed_files[: args.limit]
    for parsed_file in parsed_files:
        document = json.loads(parsed_file.read_text(encoding="utf-8"))
        graph = []
        chunks = document["chunks"][: args.chunk_limit] if args.chunk_limit else document["chunks"]
        for chunk in chunks:
            print(f"Converting {chunk['chunkId']}")
            if args.backend == "openclaw":
                converted = convert_chunk_openclaw(args.model, document, chunk)
            else:
                converted = convert_chunk(client, args.model, document, chunk)
            graph.extend(converted.get("@graph", []))
        payload = {"@context": "/kg/schema/pharmagent.context.jsonld", "@graph": graph}
        (out_dir / f"{document['documentId']}.jsonld").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
