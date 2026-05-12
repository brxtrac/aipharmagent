import fs from 'node:fs/promises';

const embeddingIndexPath = '/root/npm/data/aipharmagent.com/kg/index/entities.embeddings.json';
const jsonldDir = '/root/npm/data/aipharmagent.com/kg/jsonld';
let cache = null;
const stopwords = new Set([
  'avec', 'sans', 'sous', 'pour', 'dans', 'note', 'suivi', 'patient', 'patiente', 'rediger', 'rédiger',
  'clinique', 'question', 'adulte', 'aigue', 'aiguë', 'mg', 'die', 'bid', 'tid'
]);

function textForEntity(entity = {}) {
  return [
    entity.name,
    entity.description,
    entity.recommendation,
    entity.intervention,
    Array.isArray(entity.requiresMonitoring) ? entity.requiresMonitoring.join(' ') : entity.requiresMonitoring,
    Array.isArray(entity.requiresFollowUp) ? entity.requiresFollowUp.join(' ') : entity.requiresFollowUp,
    entity.sourceQuote,
    entity.sourceDocument
  ].filter(Boolean).join('\n');
}

function textValue(value) {
  if (Array.isArray(value)) return value.map(textValue).join(' ');
  if (value && typeof value === 'object') return value.name || value.title || value['@id'] || '';
  return String(value || '');
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function keywordScore(query, text) {
  const q = normalize(query).split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !stopwords.has(term));
  const haystack = normalize(text);
  let score = q.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
  const normalizedQuery = normalize(query);
  if (/\brn?i\b/.test(normalizedQuery) && /\brn?i\b/.test(haystack)) score += 4;
  if (/\b5[,.]\d|\b[5-9]\b/.test(normalizedQuery) && /5 a 9|5 à 9|rni 5/.test(haystack)) score += 8;
  if (/sans saignement|pas de saignement/.test(normalizedQuery) && /sans saignement significatif/.test(haystack)) score += 6;
  if (/supratherapeutique|supra therapeutique|supra-th/.test(normalizedQuery) && /supratherapeutique|supra-therapeutique/.test(haystack)) score += 5;
  if (/hba1c|a1c/.test(normalizedQuery) && /hba1c|a1c|hb a1c/.test(haystack)) score += 6;
  if (/diabet/.test(normalizedQuery) && /diabete|diabetique|antidiabetique/.test(haystack)) score += 4;
  if (/ajust/.test(normalizedQuery) && /ajust/.test(haystack)) score += 4;
  if (/cible|elevee|élevée/.test(normalizedQuery) && /cible|seuil|objectif|elevee|élevée/.test(haystack)) score += 3;
  if (/ta\b|tension|hypertension|amlodipine/.test(normalizedQuery) && /hypertension|tension|antihypertenseur|amlodipine|seuils/.test(haystack)) score += 6;
  if (/amlodipine/.test(normalizedQuery) && /amlodipine|bloqueurs des canaux calciques|bcc/.test(haystack)) score += 8;
  if (/\b7[5-9]\b|\b8[0-9]\b|\b9[0-9]\b|age|ans/.test(normalizedQuery) && /age|personne agee|personnes agees|75 ans|≥ 75|>= 75/.test(haystack)) score += 4;
  if (/188|18[0-9]|19[0-9]|\bta\b/.test(normalizedQuery) && /160|180|pression|tension|seuil|cible|objectif|urgence|reference/.test(haystack)) score += 5;
  if (/traitement|optimal|intervention|ajust/.test(normalizedQuery) && /traitement|ajust|posologie|mol[eé]cules|cible|suivi|surveillance/.test(haystack)) score += 6;
  return score;
}

function queryDomains(query) {
  const q = normalize(query);
  const domains = new Set();
  if (/warfarine|coumadin|rni|inr|anticoag|saignement|thrombo|heparine|hfpm|vitamine k/.test(q)) domains.add('anticoag');
  if (/hta|hypertension|tension|pression|ta\b|amlodipine|antihypertenseur|ramipril|perindopril|chlorthalidone|hydrochlorothiazide/.test(q)) domains.add('hta');
  if (/diab|glyc|hba1c|a1c|insuline|metformine|antidiabet|hyperglyc|hypoglyc/.test(q)) domains.add('dm');
  if (/asthme|inhal|ventolin|salbutamol|corticosteroide|csi|debit expiratoire|debit de pointe/.test(q)) domains.add('asthme');
  if (/dlp|dyslip|cholesterol|ldl|hdl|triglycer|statine|rosuvastatine|atorvastatine/.test(q)) domains.add('dlp');
  if (/mpoc|copd|bronchodilat|vems|exacerbation/.test(q)) domains.add('mpoc');
  if (/migraine|cephalee|triptan|sumatriptan|rizatriptan/.test(q)) domains.add('migraine');
  if (/tdah|attention|hyperactiv|methylphenidate|lisdexamfetamine|atomoxetine/.test(q)) domains.add('tdah');
  if (/hypothyro|hypot4|tsh|levothyroxine|synthroid/.test(q)) domains.add('hypot4');
  return domains;
}

function recordDomain(record) {
  const id = normalize(record.id || record.entity?.['@id'] || textValue(record.entity?.sourceDocument));
  for (const domain of ['anticoag', 'asthme', 'dlp', 'dm', 'hta', 'hypot4', 'migraine', 'mpoc', 'tdah']) {
    if (id.includes(domain)) return domain;
  }
  return '';
}

function domainAllowed(query, text) {
  const q = normalize(query);
  const haystack = normalize(text);
  const anticoagQuery = /warfarine|coumadin|rni|inr|anticoag|saignement|thrombo|heparine|hfpm|vitamine k/.test(q);
  const anticoagDoc = /warfarine|rni|inr|anticoag|saignement|thrombo|heparine|hfpm|vitamine k/.test(haystack);
  if (anticoagDoc && !anticoagQuery) return false;
  return true;
}

function sourceLabel(entity = {}) {
  const source = entity.sourceDocument;
  const id = textValue(source);
  if (id.includes('anticoag')) return 'Anticoag-boite-a-outil';
  if (id.includes('asthme')) return 'Asthme-boite-a-outil';
  if (id.includes('dlp')) return 'DLP-boite-a-outil';
  if (id.includes('dm-boite-a-outil')) return 'DM-boite-a-outil';
  if (id.includes('hta')) return 'HTA-boite-a-outil';
  if (id.includes('hypot4')) return 'HypoT4-boite-a-outil';
  if (id.includes('migraine')) return 'Migraine-boite-a-outil';
  if (id.includes('mpoc')) return 'MPOC-boite-a-outil';
  if (id.includes('tdah')) return 'TDAH-boite-a-outil';
  return textValue(source || entity.name || entity['@id']);
}

function referenceHints(entity = {}) {
  const text = `${entity.sourceQuote || ''}\n${entity.description || ''}`;
  const hints = [];
  const patterns = [
    /Hypertension Canada[^.\n|]*/gi,
    /HTA Canada[^.\n|]*/gi,
    /Diab[eè]te Canada[^.\n|]*/gi,
    /Global Initiative for Asthma[^.\n|]*/gi,
    /GINA[^.\n|]*/gi,
    /INESSS[^.\n|]*/gi,
    /Institut national d'excellence en sant[eé] et en services sociaux[^.\n|]*/gi,
    /Canadian Journal of Diabetes[^.\n|]*/gi,
    /Hypertension[^.\n|]*SPRINT[^.\n|]*/gi,
    /SPRINT[^.\n|]*/gi,
    /RxFiles[^.\n|]*/gi,
    /Micromedex[^.\n|]*/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, ' ').trim();
      if (value && !hints.includes(value)) hints.push(value);
    }
  }
  return hints.slice(0, 4);
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function loadJsonldRecords() {
  const files = await fs.readdir(jsonldDir).catch(() => []);
  const records = [];
  for (const file of files.filter((name) => name.endsWith('.jsonld'))) {
    const payload = JSON.parse(await fs.readFile(`${jsonldDir}/${file}`, 'utf8'));
    for (const entity of payload['@graph'] || []) {
      records.push({ id: entity['@id'], entity, text: textForEntity(entity) });
    }
  }
  return records;
}

async function loadIndex() {
  if (cache) return cache;
  try {
    const payload = JSON.parse(await fs.readFile(embeddingIndexPath, 'utf8'));
    const hasEmbeddings = (payload.records || []).some((record) => Array.isArray(record.embedding));
    cache = { mode: payload.mode || (hasEmbeddings ? 'embedding' : 'keyword'), records: payload.records || [] };
  } catch {
    cache = { mode: 'keyword', records: await loadJsonldRecords() };
  }
  return cache;
}

async function embedQuery(question, apiKey, baseUrl, model = 'text-embedding-3-small') {
  if (!apiKey) return null;
  const response = await fetch(`${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: question })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.data?.[0]?.embedding || null;
}

export async function retrieveKnowledge({ question, apiKey = '', baseUrl = '', limit = 5 }) {
  const index = await loadIndex();
  if (!index.records.length) return [];
  const domains = queryDomains(question);
  if (!domains.size) return [];
  const queryEmbedding = index.mode === 'embedding' ? await embedQuery(question, apiKey, baseUrl) : null;
  return index.records
    .filter((record) => domains.has(recordDomain(record)))
    .map((record) => {
      const text = record.text || textForEntity(record.entity);
      const keyword = keywordScore(question, text);
      const vector = queryEmbedding && Array.isArray(record.embedding) ? cosine(queryEmbedding, record.embedding) : 0;
      return { ...record, keyword, vector, score: vector + keyword };
    })
    .filter((record) => record.keyword > 0 && record.score >= 2 && domainAllowed(question, record.text || textForEntity(record.entity)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit + 3);
}

export function formatKnowledgeForPrompt(records = []) {
  if (!records.length) return 'Aucune connaissance JSON-LD locale pertinente trouvee.';
  return records.map((record, index) => {
    const entity = record.entity || {};
    return [
      `Source ${index + 1}: ${sourceLabel(entity)}`,
      entity.sourcePage ? `Page: ${entity.sourcePage}` : '',
      entity.name ? `Sujet: ${entity.name}` : '',
      entity.recommendation ? `Recommandation: ${entity.recommendation}` : '',
      entity.intervention ? `Intervention: ${entity.intervention}` : '',
      entity.requiresFollowUp ? `Suivi: ${Array.isArray(entity.requiresFollowUp) ? entity.requiresFollowUp.join('; ') : entity.requiresFollowUp}` : '',
      entity.description && !entity.recommendation ? `Description: ${entity.description}` : '',
      entity.sourceQuote ? `Extrait: ${entity.sourceQuote}` : '',
      referenceHints(entity).length ? `References nommees dans l'extrait: ${referenceHints(entity).join('; ')}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}
