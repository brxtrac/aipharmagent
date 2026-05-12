#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = '/root/npm/data/aipharmagent.com';
const jsonldDir = `${root}/kg/jsonld`;
const indexPath = `${root}/kg/index/entities.embeddings.json`;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function main() {
  const files = (await fs.readdir(jsonldDir)).filter((file) => file.endsWith('.jsonld'));
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
  const validation = run(`${root}/kg-pipeline/.venv/bin/python`, [`${root}/kg-pipeline/scripts/validate_jsonld.py`]);
  const serverSyntax = run('node', ['--check', `${root}/server.mjs`]);
  const appSyntax = run('node', ['--check', `${root}/app.js`]);
  const stagingScript = existsSync(`${root}/kg-pipeline/scripts/stage_working_memory.mjs`);
  const manifest = existsSync(`${root}/bounty/dkg-v10-integration.json`);

  const report = {
    contextGraph: 'PharmAgent',
    jsonldFiles: files.length,
    ragRecords: index.records?.length || 0,
    ragMode: index.mode || 'unknown',
    validation: validation.ok,
    serverSyntax: serverSyntax.ok,
    appSyntax: appSyntax.ok,
    stagingScript,
    manifest,
    readyForRound1WorkingSharedMemoryDemo: files.length >= 1 && (index.records?.length || 0) > 0 && validation.ok && serverSyntax.ok && appSyntax.ok && stagingScript && manifest,
    verifiedMemoryOnChainStatus: 'roadmap: requires curator/human publish review before on-chain anchoring'
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.readyForRound1WorkingSharedMemoryDemo) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
