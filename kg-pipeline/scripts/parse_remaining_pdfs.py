#!/usr/bin/env python3
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/root/npm/data/aipharmagent.com')
PIPELINE = ROOT / 'kg-pipeline'
PYTHON = PIPELINE / '.venv/bin/python'
PARSE_SCRIPT = PIPELINE / 'scripts/parse_pdfs.py'
SOURCE_DIR = Path('/root/npm/data/reclamacie.com/ajustements')
OUT_DIR = ROOT / 'kg'
STATE_PATH = OUT_DIR / 'index/parse-remaining-state.json'
LOG_PATH = OUT_DIR / 'index/parse-remaining.log'
MAX_FILES_PER_RUN = 1
TIMEOUT_SECONDS = 50 * 60


def slugify(filename: str) -> str:
    value = filename.lower().replace('.pdf', '')
    result = []
    dash = False
    for char in value:
        if char.isalnum():
            result.append(char)
            dash = False
        elif not dash:
            result.append('-')
            dash = True
    return ''.join(result).strip('-') or 'document'


def log(message: str):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.now(timezone.utc).isoformat()} {message}\n"
    LOG_PATH.open('a', encoding='utf-8').write(line)
    print(message, flush=True)


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding='utf-8'))
    return {"completed": [], "failed": []}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def is_parsed(pdf: Path) -> bool:
    return (OUT_DIR / 'parsed' / f'{slugify(pdf.name)}.json').exists()


def main():
    if not PYTHON.exists():
        raise SystemExit(f'Missing venv python: {PYTHON}')
    state = load_state()
    pdfs = sorted(SOURCE_DIR.glob('*.pdf'))
    remaining = [pdf for pdf in pdfs if not is_parsed(pdf)]
    if not remaining:
        log('No remaining adjustment PDFs to parse.')
        return
    batch = remaining[:MAX_FILES_PER_RUN]
    log(f'Starting batch: {len(batch)} file(s), {len(remaining)} remaining before run.')
    for pdf in batch:
        log(f'Parsing {pdf.name}')
        try:
            subprocess.run(
                [str(PYTHON), str(PARSE_SCRIPT), '--input', str(pdf.parent), '--out', str(OUT_DIR), '--single', str(pdf)],
                cwd=str(PIPELINE),
                timeout=TIMEOUT_SECONDS,
                check=True
            )
            state['completed'] = sorted(set(state.get('completed', []) + [pdf.name]))
            log(f'Completed {pdf.name}')
        except subprocess.TimeoutExpired:
            state.setdefault('failed', []).append({"file": pdf.name, "reason": "timeout"})
            log(f'Timeout {pdf.name}')
            save_state(state)
            raise SystemExit(124)
        except subprocess.CalledProcessError as error:
            state.setdefault('failed', []).append({"file": pdf.name, "reason": f'exit {error.returncode}'})
            log(f'Failed {pdf.name}: exit {error.returncode}')
            save_state(state)
            raise
        save_state(state)
    after = [pdf for pdf in pdfs if not is_parsed(pdf)]
    log(f'Batch done. {len(after)} file(s) remaining.')


if __name__ == '__main__':
    main()
