#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import EasyOcrOptions, PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption


def slugify(value: str) -> str:
    value = value.lower().replace(".pdf", "")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "document"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def chunk_markdown(markdown: str, max_chars: int = 4500):
    blocks = [b.strip() for b in re.split(r"\n\s*\n", markdown) if b.strip()]
    chunks = []
    current = []
    size = 0
    for block in blocks:
        if current and size + len(block) > max_chars:
            chunks.append("\n\n".join(current))
            current = []
            size = 0
        current.append(block)
        size += len(block)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def parse_pdf(pdf_path: Path, out_dir: Path):
    pipeline_options = PdfPipelineOptions()
    pipeline_options.ocr_options = EasyOcrOptions(lang=["fr", "en"], use_gpu=False)
    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    result = converter.convert(str(pdf_path))
    markdown = result.document.export_to_markdown()
    document_id = slugify(pdf_path.name)
    parsed_dir = out_dir / "parsed"
    parsed_dir.mkdir(parents=True, exist_ok=True)
    (parsed_dir / f"{document_id}.md").write_text(markdown, encoding="utf-8")
    chunks = chunk_markdown(markdown)
    payload = {
        "documentId": document_id,
        "title": pdf_path.stem,
        "fileName": pdf_path.name,
        "sourcePath": str(pdf_path),
        "sha256": sha256(pdf_path),
        "parsedAt": datetime.now(timezone.utc).isoformat(),
        "parser": "docling",
        "chunks": [
            {
                "chunkId": f"{document_id}-c{i + 1:03d}",
                "sequence": i + 1,
                "text": text,
                "sourceTitle": pdf_path.stem
            }
            for i, text in enumerate(chunks)
        ]
    }
    (parsed_dir / f"{document_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="/root/npm/data/reclamacie.com")
    parser.add_argument("--out", default="/root/npm/data/aipharmagent.com/kg")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--single", default="")
    args = parser.parse_args()
    pdfs = [Path(args.single)] if args.single else sorted(Path(args.input).glob("**/*.pdf"))
    if args.limit:
        pdfs = pdfs[: args.limit]
    out = Path(args.out)
    for pdf in pdfs:
        print(f"Parsing {pdf}")
        parse_pdf(pdf, out)


if __name__ == "__main__":
    main()
