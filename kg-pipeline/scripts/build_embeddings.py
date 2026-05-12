#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

from openai import OpenAI


def entity_text(entity):
    def text_value(value):
        if isinstance(value, dict):
            return value.get('@id', '')
        if isinstance(value, list):
            return ' '.join(text_value(item) for item in value)
        return str(value) if value is not None else ''

    parts = [
        text_value(entity.get("name", "")),
        text_value(entity.get("description", "")),
        text_value(entity.get("recommendation", "")),
        text_value(entity.get("intervention", "")),
        text_value(entity.get("requiresMonitoring", "")),
        text_value(entity.get("requiresFollowUp", "")),
        text_value(entity.get("sourceQuote", "")),
        text_value(entity.get("sourceDocument", ""))
    ]
    return "\n".join([p for p in parts if p])[:8000]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jsonld", default="/root/npm/data/aipharmagent.com/kg/jsonld")
    parser.add_argument("--out", default="/root/npm/data/aipharmagent.com/kg/index/entities.embeddings.json")
    parser.add_argument("--model", default="text-embedding-3-small")
    parser.add_argument("--keyword-only", action="store_true")
    args = parser.parse_args()
    client = None if args.keyword_only else OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    records = []
    for path in sorted(Path(args.jsonld).glob("*.jsonld")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for entity in payload.get("@graph", []):
            text = entity_text(entity)
            if not text.strip():
                continue
            record = {"id": entity.get("@id"), "text": text, "entity": entity}
            if client:
                record["embedding"] = client.embeddings.create(model=args.model, input=text).data[0].embedding
                print(f"embedded {entity.get('@id')}")
            else:
                print(f"indexed {entity.get('@id')}")
            records.append(record)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    mode = "keyword" if args.keyword_only else "embedding"
    out.write_text(json.dumps({"model": args.model, "mode": mode, "records": records}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
