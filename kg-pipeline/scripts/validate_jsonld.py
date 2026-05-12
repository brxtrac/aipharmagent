#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from jsonschema import Draft202012Validator


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jsonld", default="/root/npm/data/aipharmagent.com/kg/jsonld")
    parser.add_argument("--schema", default="/root/npm/data/aipharmagent.com/kg/schema/pharmagent.schema.json")
    parser.add_argument("--reviews", default="/root/npm/data/aipharmagent.com/kg/reviews")
    args = parser.parse_args()
    schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    review_dir = Path(args.reviews)
    review_dir.mkdir(parents=True, exist_ok=True)
    failed = False
    for path in sorted(Path(args.jsonld).glob("*.jsonld")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        errors = [e.message for e in validator.iter_errors(payload)]
        citation_errors = []
        for entity in payload.get("@graph", []):
            entity_type = entity.get("@type", "")
            if entity_type.startswith("pharm:") and entity_type not in ["pharm:ClinicalDocument", "pharm:SourceExcerpt"]:
                if not entity.get("sourceQuote"):
                    citation_errors.append(f"{entity.get('@id')}: missing sourceQuote")
                if not entity.get("sourceDocument"):
                    citation_errors.append(f"{entity.get('@id')}: missing sourceDocument")
        report = {
            "file": str(path),
            "status": "pass" if not errors and not citation_errors else "needs_fix",
            "schemaErrors": errors,
            "citationErrors": citation_errors
        }
        (review_dir / f"{path.stem}.review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if report["status"] != "pass":
            failed = True
            print(f"needs_fix {path}")
        else:
            print(f"pass {path}")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
