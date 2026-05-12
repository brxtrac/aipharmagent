import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GRAPH_NAME = 'PharmAgent';
const NS = 'https://aipharmagent.com/ontology#';
const adapterPath = process.env.OPENCLAW_DKG_ADAPTER_PATH || '/usr/lib/node_modules/@origintrail-official/dkg/node_modules/@origintrail-official/dkg-adapter-openclaw/dist/index.js';
const daemonUrl = process.env.DKG_DAEMON_URL || 'http://127.0.0.1:9200';
const apiToken = process.env.DKG_AUTH_TOKEN || process.env.OPENCLAW_DKG_TOKEN || '';

function literal(value) {
  return JSON.stringify(String(value ?? ''));
}

function iri(value) {
  return `${NS}${String(value).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function assetTriples(asset) {
  const subject = iri(`asset/${asset.id}`);
  const triples = [
    { subject, predicate: 'rdf:type', object: 'http://dkg.io/ontology#KnowledgeAsset' },
    { subject, predicate: 'rdf:type', object: `${NS}ClinicalKnowledgeAsset` },
    { subject, predicate: `${NS}assetId`, object: literal(asset.id) },
    { subject, predicate: `${NS}title`, object: literal(asset.title) },
    { subject, predicate: `${NS}assetType`, object: literal(asset.type) },
    { subject, predicate: `${NS}sourcePath`, object: literal(asset.path) },
    { subject, predicate: `${NS}citation`, object: literal(asset.citation) },
    { subject, predicate: `${NS}provenance`, object: literal(asset.title) },
    { subject, predicate: `${NS}clinicalUse`, object: literal('Soutien au jugement clinique du pharmacien avec sources documentaires') }
  ];
  for (const tag of asset.tags || []) {
    triples.push({ subject, predicate: `${NS}tag`, object: literal(tag) });
  }
  return triples;
}

async function main() {
  if (!apiToken) {
    throw new Error('Set DKG_AUTH_TOKEN or OPENCLAW_DKG_TOKEN before publishing.');
  }
  const assets = JSON.parse(await fs.readFile(path.join(process.cwd(), 'assets.json'), 'utf8'));
  const { DkgDaemonClient } = await import(pathToFileURL(adapterPath).href);
  const client = new DkgDaemonClient({ baseUrl: daemonUrl, apiToken, timeoutMs: 30000 });

  try {
    await client.createContextGraph(
      GRAPH_NAME,
      'PharmAgent',
      'Base de connaissances clinique pour soutenir le jugement professionnel du pharmacien.'
    );
  } catch (error) {
    if (!/exists|already|duplicate/i.test(error.message || String(error))) throw error;
  }

  for (const asset of assets) {
    const result = await client.share(GRAPH_NAME, assetTriples(asset), { localOnly: false });
    console.log(`${asset.id}: ${result.graph || ''} ${result.shareOperationId || result.workspaceOperationId || ''}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
