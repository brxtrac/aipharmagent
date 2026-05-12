const outputEl = document.querySelector('#output');
const attachmentInput = document.querySelector('#attachments');
const attachmentList = document.querySelector('#attachmentList');
let currentAnswer = '';
let assets = [];
const maxAttachmentBytes = 7 * 1024 * 1024;

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function relevantAssets(question) {
  const q = normalize(question);
  const matches = assets.filter((asset) => normalize([asset.title, asset.type, ...(asset.tags || [])].join(' ')).split(/\s+/).some((term) => term && q.includes(term)));
  return (matches.length ? matches : assets).slice(0, 3);
}

function buildFallbackAnswer(question) {
  const sources = relevantAssets(question);
  return `**Collecte de données**\n${question}\n\n**Analyse**\nDonnées ou connexion IA insuffisantes pour rédiger une intervention définitive.\n\n**Intervention et recommandations**\nValider les données patient essentielles, les objectifs thérapeutiques, la tolérabilité, les interactions, contre-indications et critères de référence avant intervention.\n\n**Sources**\n${sources.map((asset) => `- ${asset.citation}`).join('\n') || 'Référence précise non disponible dans les extraits locaux récupérés.'}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[char]);
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(markdown) {
  outputEl.classList.add('clinical-note');
  const lines = String(markdown || '').split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))}</li>`;
      continue;
    }

    if (inList) {
      html += '</ul>';
      inList = false;
    }

    const heading = trimmed.replace(/^#+\s*/, '').replace(/^\*\*(.+?)\*\*:?$/, '$1').replace(/:$/, '');
    if (/^(note|evaluation|évaluation|intervention|plan|suivi|sources|objectif|donnees|données|collecte|impression|analyse|surveillance)/i.test(heading)) {
      html += `<h3>${inlineMarkdown(heading)}</h3>`;
    } else {
      html += `<p>${inlineMarkdown(trimmed)}</p>`;
    }
  }

  if (inList) html += '</ul>';
  outputEl.innerHTML = html;
}

function renderLoading() {
  currentAnswer = '';
  outputEl.classList.remove('clinical-note');
  outputEl.innerHTML = `
    <div class="thinking" role="status" aria-live="polite">
      <span></span><span></span><span></span>
      <p>PharmAgent analyse le cas et recherche les sources pertinentes.</p>
    </div>
  `;
}

function renderError(message) {
  currentAnswer = '';
  outputEl.classList.remove('clinical-note');
  outputEl.innerHTML = `<div class="error-box"><strong>Action requise</strong><p>${escapeHtml(message)}</p></div>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readAttachments() {
  const files = Array.from(attachmentInput.files || []);
  const attachments = [];
  for (const file of files) {
    if (file.size > maxAttachmentBytes) throw new Error(`${file.name} dépasse 7 Mo.`);
    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.split(',')[1] || '';
    attachments.push({ name: file.name, type: file.type, size: file.size, data: base64 });
  }
  return attachments;
}

async function askAgent(question) {
  const attachments = await readAttachments();
  const response = await fetch('/api/clinical-question', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, attachments })
  });

  if (!response.ok) throw new Error(`Service indisponible (${response.status})`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.answer || data.output || buildFallbackAnswer(question);
}

document.querySelector('#caseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const question = new FormData(event.currentTarget).get('question').trim();
  button.disabled = true;
  renderLoading();
  try {
    currentAnswer = await askAgent(question);
    renderMarkdown(currentAnswer);
  } catch (error) {
    renderError(error?.message || 'Impossible de produire une réponse pour le moment.');
  } finally {
    button.disabled = false;
  }
});

attachmentInput.addEventListener('change', () => {
  const files = Array.from(attachmentInput.files || []);
  attachmentList.innerHTML = files.length
    ? files.map((file) => `<span>${escapeHtml(file.name)} · ${(file.size / 1024 / 1024).toFixed(2)} Mo</span>`).join('')
    : '';
});

document.querySelector('#copyNote').addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentAnswer || outputEl.textContent);
});

fetch('assets.json')
  .then((response) => response.json())
  .then((data) => {
    assets = data;
  });
