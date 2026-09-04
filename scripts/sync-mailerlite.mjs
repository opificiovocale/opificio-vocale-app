import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { manifestoNumber, campaignEmail, readBody, mergeManifesto } from './manifesti-import.mjs';

const token = process.env.MAILERLITE_API_TOKEN?.trim();
const dataPath = process.env.MANIFESTI_DATA_PATH || fileURLToPath(new URL('../manifesti.json', import.meta.url));
if (!token) throw new Error('Sincronizzazione non attiva: configura MAILERLITE_API_TOKEN nei repository secrets di GitHub.');

const campaigns = [];
let page = 1;
while (true) {
  const response = await fetch(`https://connect.mailerlite.com/api/campaigns?filter%5Bstatus%5D=sent&limit=100&page=${page}`, {
    headers:{Accept:'application/json',Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`MailerLite ha risposto ${response.status}. Verifica il collegamento e riprova.`);
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('MailerLite non ha restituito un elenco di campagne valido.');
  campaigns.push(...payload.data);
  if (!payload.links?.next) break;
  if (++page > 100) throw new Error('L’archivio richiede una verifica della paginazione.');
}

const stored = JSON.parse(await readFile(dataPath,'utf8'));
const existingItems = Array.isArray(stored.items) ? stored.items : [];
// Ricostruisci gli importati dalla fonte: elimina gli inviti non numerati e i vecchi duplicati.
const items = existingItems.filter(item => item.bodySource !== 'mailerlite');
const editions = campaigns.filter(campaign => campaign.status === 'sent' && manifestoNumber(campaign,campaignEmail(campaign)) !== null)
  .sort((a,b) => String(a.finished_at || a.started_at).localeCompare(String(b.finished_at || b.started_at)));

for (const campaign of editions) {
  const email = campaignEmail(campaign);
  const number = manifestoNumber(campaign,email);
  const builtin = items.some(item => item.number === number && item.bodySource === 'builtin');
  const body = builtin ? null : await readBody(email,email.preview_url || campaign.preview_url);
  mergeManifesto(items,campaign,email,body);
  console.log(`Manifesto ${number}: ${builtin ? 'testo editoriale conservato' : `${body.length} caratteri importati`}.`);
}

items.sort((a,b) => b.date.localeCompare(a.date) || Number(b.number)-Number(a.number));
if (JSON.stringify(items) === JSON.stringify(existingItems)) {
  console.log('Nessun nuovo Manifesto da sincronizzare.');
} else {
  await writeFile(dataPath,`${JSON.stringify({version:1,updatedAt:new Date().toISOString(),items},null,2)}\n`,'utf8');
  console.log(`Archivio aggiornato: ${items.length} Manifesti.`);
}
