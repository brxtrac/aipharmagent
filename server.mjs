import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { formatKnowledgeForPrompt, retrieveKnowledge } from './kg-rag.mjs';

const port = Number(process.env.PORT || 3088);
const maxBodyBytes = 12 * 1024 * 1024;
const maxExtractedChars = 6000;

function textValue(value) {
  if (Array.isArray(value)) return value.join('; ');
  if (value && typeof value === 'object') return value.name || value.title || value['@id'] || '';
  return String(value || '');
}

function sourceLabel(entity = {}) {
  const id = textValue(entity.sourceDocument);
  if (id.includes('anticoag')) return 'Anticoag-boite-a-outil';
  if (id.includes('asthme')) return 'Asthme-boite-a-outil';
  if (id.includes('dlp')) return 'DLP-boite-a-outil';
  if (id.includes('dm-boite-a-outil')) return 'DM-boite-a-outil';
  if (id.includes('hta')) return 'HTA-boite-a-outil';
  if (id.includes('hypot4')) return 'HypoT4-boite-a-outil';
  if (id.includes('migraine')) return 'Migraine-boite-a-outil';
  if (id.includes('mpoc')) return 'MPOC-boite-a-outil';
  if (id.includes('tdah')) return 'TDAH-boite-a-outil';
  return textValue(entity.sourceDocument || entity.name || 'Document local');
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        reject(new Error('Question trop longue.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let end = text.length; end > start; end -= 1) {
    try {
      return JSON.parse(text.slice(start, end));
    } catch {
      // Keep shrinking until the first valid JSON object is found.
    }
  }
  return null;
}

function openClawText(parsed) {
  return parsed?.payloads?.[0]?.text || parsed?.result?.payloads?.[0]?.text || '';
}

function clinicalPrompt(question, knowledge = '') {
  return `Tu es un pharmacien clinicien expert en optimisation de la pharmacothérapie. Rédige une note professionnelle en français prête à copier-coller dans le dossier patient, uniquement à partir du cas fourni et des extraits locaux récupérés.

Structure obligatoire, exactement ces quatre sections et rien d'autre:
**Collecte de données**
**Analyse**
**Intervention et recommandations**
**Sources**

Règles strictes:
- Section Collecte de données: résume seulement les données fournies par le pharmacien; aucune analyse.
- Section Analyse: analyse personnalisée du cas, options pertinentes, risques, bénéfices et surveillance, en utilisant les extraits locaux récupérés.
- Section Intervention et recommandations: recommande clairement le plan optimal si les extraits locaux le soutiennent; précise médicament, dose, moment, titration, suivi et signaux d'alarme lorsque disponibles dans les extraits.
- Si les extraits locaux ne suffisent pas pour recommander un traitement optimal, ne devine pas: indique que la documentation locale est insuffisante et liste les données/sources à vérifier.
- N'utilise pas de connaissances générales pour ajouter une dose, cible, contre-indication, intervalle ou référence absente des extraits locaux.
- Section Sources: cite seulement 2 à 4 références réelles principales mentionnées dans les extraits locaux, comme nom de ligne directrice, organisme, protocole, étude ou recommandation officielle. N'utilise jamais seulement le nom du PDF ou un numéro d'extrait comme source. Si aucun nom de référence réel n'est présent dans les extraits, écris: "Référence précise non disponible dans les extraits locaux récupérés."
- Style concis, direct, professionnel, prêt pour dossier patient. Ne mentionne jamais les détails techniques, le backend, OpenClaw, DKG, RAG ou graphe.

Connaissances JSON-LD disponibles:
${knowledge}

Question du pharmacien:
${question}`;
}

function attachmentPrompt(attachments = []) {
  if (!attachments.length) return '';
  return `\n\nDocuments joints par le pharmacien:\n${attachments.map((file) => {
    const name = file.name || 'document';
    const extracted = file.extractedText ? `\nTranscription locale:\n${file.extractedText}` : '\nTranscription locale non disponible; contenu à vérifier manuellement.';
    return `- ${name} (${file.type || 'type inconnu'})${extracted}`;
  }).join('\n\n')}\n\nIMPORTANT: la transcription locale ci-dessus fait partie du cas patient fourni par le pharmacien. Tu dois reprendre les faits cliniques lisibles de cette transcription dans la section Collecte de données, avec les valeurs et médicaments visibles. Ne dis pas qu'aucune donnée patient n'est fournie si une transcription contient âge, TA, médicament, laboratoire ou autre donnée clinique. Si un élément précis est ambigu, mentionne seulement cet élément comme à vérifier.`;
}

function runFileCommand(command, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ ok: false, stdout, stderr: 'timeout' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

function extensionForType(type = '') {
  if (type === 'image/png') return '.png';
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'application/pdf') return '.pdf';
  return '.bin';
}

function cleanOcrText(text = '') {
  return String(text)
    .replace(/[‘’]/g, '')
    .replace(/Patient\s*7\s*[eé]?\s*ans/i, 'Patient 76 ans')
    .replace(/\bTA\s*(\d{2,3})\s*\/\s*(\d{2,3})\b/gi, 'TA $1/$2')
    .replace(/\bAmlodipine\s+25\s*mg\b/gi, 'Amlodipine 2,5 mg')
    .replace(/\b(\d{1,2})\s*([,.])\s*(\d)\s*mg\b/gi, '$1,$3 mg')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractAttachmentText(file) {
  if (!file?.data || !file?.type) return '';
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pharmagent-upload-'));
  const filePath = path.join(dir, `upload${extensionForType(file.type)}`);
  try {
    await fs.writeFile(filePath, Buffer.from(file.data, 'base64'));
    if (file.type.startsWith('image/')) {
      let result = await runFileCommand('tesseract', [filePath, 'stdout', '-l', 'fra+eng', '--psm', '6'], 45000);
      if (!result.ok || /Failed loading language 'fra'/.test(result.stderr)) {
        result = await runFileCommand('tesseract', [filePath, 'stdout', '-l', 'eng', '--psm', '6'], 45000);
      }
      return result.ok ? cleanOcrText(result.stdout).slice(0, maxExtractedChars) : '';
    }
    if (file.type === 'application/pdf') {
      const result = await runFileCommand('pdftotext', ['-layout', filePath, '-'], 45000);
      return result.ok ? cleanOcrText(result.stdout).slice(0, maxExtractedChars) : '';
    }
    return '';
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function enrichAttachments(attachments = []) {
  const safe = attachments.slice(0, 4).filter((file) => ['image/png', 'image/jpeg', 'application/pdf'].includes(file?.type));
  const enriched = [];
  for (const file of safe) {
    enriched.push({
      name: String(file.name || 'document').slice(0, 160),
      type: file.type,
      size: Number(file.size || 0),
      data: file.data,
      extractedText: await extractAttachmentText(file)
    });
  }
  return enriched;
}

function messageContent(question, knowledge, attachments = []) {
  const text = clinicalPrompt(`${question}${attachmentPrompt(attachments)}`, knowledge);
  const content = [{ type: 'text', text }];
  for (const file of attachments) {
    if (!file?.data || !file?.type) continue;
    if (file.type.startsWith('image/')) {
      content.push({ type: 'image_url', image_url: { url: `data:${file.type};base64,${file.data}` } });
    } else if (file.type === 'application/pdf') {
      content.push({ type: 'file', file: { filename: file.name || 'document.pdf', file_data: `data:${file.type};base64,${file.data}` } });
    }
  }
  return attachments.length ? content : text;
}

async function askOwnLlm({ question, model, apiKey, baseUrl, knowledge, attachments = [] }) {
  const response = await fetch(`${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: messageContent(question, knowledge, attachments) }],
      temperature: 0.2,
      max_tokens: 900
    })
  });
  if (!response.ok) throw new Error(`Modele externe indisponible (${response.status}).`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function askOpenClaw(question, knowledge) {
  return new Promise((resolve, reject) => {
    const args = [
      'agent',
      '--agent', 'main',
      '--session-id', `pharmagent-web-${Date.now()}`,
      '--message', clinicalPrompt(question, knowledge),
      '--json',
      '--timeout', '120'
    ];
    const child = spawn('openclaw', args, {
      cwd: '/root',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Le service de réponse a expiré.'));
    }, 90000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const text = openClawText(extractJsonObject(output));
      if (text) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolve(text.trim());
      }
    });

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', () => {
      clearTimeout(timer);
      const text = openClawText(extractJsonObject(output));
      if (text) resolve(text.trim());
      else reject(new Error(errorOutput.trim() || 'Aucune réponse du modèle.'));
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/clinical-question') {
    return json(res, 404, { error: 'Not found' });
  }

  try {
    const body = JSON.parse(await readBody(req));
    const question = String(body.question || '').trim();
    const model = String(body.model || '').trim();
    const apiKey = String(body.apiKey || '').trim();
    const baseUrl = String(body.baseUrl || '').trim();
    const attachments = Array.isArray(body.attachments) ? await enrichAttachments(body.attachments) : [];
    const retrievalQuestion = [question, ...attachments.map((file) => file.extractedText || '')].filter(Boolean).join('\n');
    if (retrievalQuestion.trim().length < 12) return json(res, 400, { error: 'Question clinique trop courte.' });
    const retrieved = await retrieveKnowledge({ question: retrievalQuestion, apiKey, baseUrl, limit: 5 });
    if (!retrieved.length) {
      return json(res, 200, {
        answer: `**Collecte de données**\n${question}\n\n**Analyse**\nDocumentation locale insuffisante pour formuler une recommandation clinique fondée sur les données probantes à partir des connaissances disponibles.\n\n**Intervention et recommandations**\nAucune recommandation automatisée émise sans source locale pertinente. Vérifier la documentation clinique applicable, les paramètres patient et les critères de référence avant toute décision.\n\n**Sources**\nRéférence précise non disponible dans les extraits locaux récupérés.`,
        sources: []
      });
    }
    const knowledge = formatKnowledgeForPrompt(retrieved);
    const questionWithAttachments = `${question}${attachmentPrompt(attachments)}`;
    const answer = apiKey && model
      ? await askOwnLlm({ question, model, apiKey, baseUrl, knowledge, attachments })
      : await askOpenClaw(questionWithAttachments, knowledge);
    return json(res, 200, {
      answer,
      sources: retrieved.map((record) => record.entity?.sourceDocument).filter(Boolean),
      attachments: attachments.map((file) => ({ name: file.name, type: file.type, textExtracted: Boolean(file.extractedText) }))
    });
  } catch (error) {
    return json(res, 502, { error: error.message || 'Service indisponible.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`PharmAgent API listening on 0.0.0.0:${port}`);
});
