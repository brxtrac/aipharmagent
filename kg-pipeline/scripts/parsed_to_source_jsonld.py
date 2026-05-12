#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


def clean_text(value):
    text = re.sub(r"<!-- image -->", " ", value or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_useful_excerpt(text):
    if len(text) < 80:
        return False
    lowered = text.lower()
    if "table des matières" in lowered and len(text) < 1000:
        return False
    clinical_terms = [
        "traitement", "ajust", "suivi", "diagnostic", "dose", "posologie", "contre-indication",
        "précaution", "effets secondaires", "cible", "surveillance", "référence", "patient",
        "glyc", "tension", "asthme", "migraine", "warfarine", "rni", "diab", "cholest",
        "mpoc", "thyro", "tdah", "hta", "insuline"
    ]
    return any(term in lowered for term in clinical_terms)


def source_page(chunk):
    text = chunk.get("text", "")
    match = re.search(r"\bpage\s+(\d+)\b", text, flags=re.IGNORECASE)
    return match.group(1) if match else "unknown"


def source_section(text):
    match = re.search(r"##\s*([^#\n]{3,120})", text)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parsed", default="/root/npm/data/aipharmagent.com/kg/parsed")
    parser.add_argument("--out", default="/root/npm/data/aipharmagent.com/kg/jsonld")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(Path(args.parsed).glob("*.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        document_id = document["documentId"]
        out_path = out_dir / f"{document_id}.jsonld"
        if out_path.exists() and not args.overwrite:
            print(f"skip {out_path}")
            continue

        graph = [{
            "@id": f"urn:pharmagent:{document_id}:doc",
            "@type": "pharm:ClinicalDocument",
            "name": document["title"],
            "description": f"Document clinique parse depuis {document['fileName']}",
            "sourceDocument": {"@id": f"urn:pharmagent:{document_id}:doc"},
            "sourcePage": "unknown",
            "sourceSection": "",
            "sourceQuote": document["title"],
            "needsHumanReview": True,
            "reviewStatus": "human_review",
            "publishStatus": "ready_for_working_memory"
        }]

        for chunk in document.get("chunks", []):
            raw = chunk.get("text", "")
            text = clean_text(raw)
            if not is_useful_excerpt(text):
                continue
            quote = text[:1600]
            sequence = chunk.get("sequence", len(graph))
            graph.append({
                "@id": f"urn:pharmagent:{document_id}:excerpt:{sequence:03d}",
                "@type": "pharm:SourceExcerpt",
                "name": f"{document['title']} - extrait {sequence}",
                "description": quote,
                "sourceDocument": {"@id": f"urn:pharmagent:{document_id}:doc"},
                "sourcePage": source_page(chunk),
                "sourceSection": source_section(raw),
                "sourceQuote": quote,
                "needsHumanReview": True,
                "reviewStatus": "human_review",
                "publishStatus": "ready_for_working_memory"
            })

        out_path.write_text(json.dumps({"@context": "/kg/schema/pharmagent.context.jsonld", "@graph": graph}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {out_path} ({len(graph)} entities)")


if __name__ == "__main__":
    main()
