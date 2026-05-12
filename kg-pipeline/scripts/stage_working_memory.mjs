#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const GRAPH_NAME = 'PharmAgent';
const jsonldDir = process.argv[2] || '/root/npm/data/aipharmagent.com/kg/jsonld';
const publishMode = process.argv.includes('--publish') || process.env.DKG_PUBLISH === '1';
const adapterPath = process.env.OPENCLAW_DKG_ADAPTER_PATH || '/usr/lib/node_modules/@origintrail-official/dkg/node_modules/@origintrail-official/dkg-adapter-openclaw/dist/index.js';
const daemonUrl = process.env.DKG_DAEMON_URL || 'http://127.0.0.1:9200';
const apiToken = process.env.DKG_AUTH_TOKEN || process.env.OPENCLAW_DKG_TOKEN || '';

function literal(value) {
  return JSON.stringify(String(value ?? ''));
}

function triplesForEntity(entity) {
  const subject = entity['@id'];
  const triples = [{ subject, predicate: 'rdf:type', object: entity['@type'] }];
  for (const [key, value] of Object.entries(entity)) {
    if (key.startsWith('@')) continue;
    const predicate = key.includes(':') ? key : `https://aipharmagent.com/ontology#${key}`;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item && typeof item === 'object' && item['@id']) triples.push({ subject, predicate, object: item['@id'] });
      else triples.push({ subject, predicate, object: literal(item) });
    }
  }
  return triples;
}

async function main() {
  if (!apiToken) throw new Error('Set DKG_AUTH_TOKEN or OPENCLAW_DKG_TOKEN to stage working memory.');
  if (!existsSync(adapterPath)) throw new Error(`Adapter not found: ${adapterPath}`);
  const { DkgDaemonClient } = await import(pathToFileURL(adapterPath).href);
  const client = new DkgDaemonClient({ baseUrl: daemonUrl, apiToken, timeoutMs: 30000 });
  try {
    await client.createContextGraph(GRAPH_NAME, 'PharmAgent', 'Clinical working memory for PharmAgent JSON-LD knowledge assets.');
  } catch (error) {
    if (!/exists|already|duplicate/i.test(error.message || String(error))) throw error;
  }
  const files = (await fs.readdir(jsonldDir)).filter((name) => name.endsWith('.jsonld'));
  for (const file of files) {
    const payload = JSON.parse(await fs.readFile(`${jsonldDir}/${file}`, 'utf8'));
    const triples = payload['@graph'].flatMap(triplesForEntity);
    if (!triples.length) continue;
    const result = await client.share(GRAPH_NAME, triples, { localOnly: !publishMode });
    console.log(`${file}: ${result.graph || ''} ${result.workspaceOperationId || result.shareOperationId || ''}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
