import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const numberPattern = /\bmanifest[oi](?:\s+delle\s+voci\s+libere)?\s*(?:n[.°º]?\s*)?#?\s*(\d{1,3})\b/i;

export function manifestoNumber(campaign, email) {
  const combined = `${email.subject || ''} ${campaign.name || ''}`;
  const value = combined.match(numberPattern)?.[1] ?? (/\bmanifest[oi]\b/i.test(combined) ? combined.match(/(?:^|\s)#\s*(\d{1,3})\b/)?.[1] : undefined);
  return value === undefined ? null : String(Number(value)).padStart(2, '0');
}
export function cleanTitle(subject, name) {
  const candidate = String(subject || name || 'Nuovo Manifesto').replace(/\{\$[^}]+\}/g, '').trim();
  return candidate.replace(numberPattern, '').replace(/^#\s*\d{1,3}\b/, '').replace(/^\s*[-—:|·#]+\s*|\s*[-—:|·#]+\s*$/g, '').trim() || candidate;
}
export function cleanText(value) {
  const paragraphs = String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split(/\n\s*\n/);
  const cleaned = [];
  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (/^(?:ricevi questa (?:email|e-mail)|you (?:are receiving|received)|non (?:ti interessa|vuoi ricevere)|not interested|disiscriviti|unsubscribe|gestisci le preferenze)/i.test(paragraph)) break;
    if (/^(?:leggi|visualizza|view).{0,35}(?:browser|online)/i.test(paragraph)) continue;
    paragraph = paragraph.split('\n').filter(line => !/\{\$[^}]+\}/.test(line)).join('\n').trim();
    if (paragraph) cleaned.push(paragraph);
  }
  return cleaned.join('\n\n');
}
export function usableBody(value) {
  return typeof value === 'string' && value.length >= 120 && !/(?:software.{0,100}(?:supporta|support|display).{0,30}html|visualizzare il tuo messaggio cliccando)/is.test(value);
}
export function htmlToText(html) {
  const result = spawnSync('python3', [fileURLToPath(new URL('./newsletter-text.py', import.meta.url))], {input:html, encoding:'utf8', maxBuffer:5*1024*1024});
  if (result.status !== 0) throw new Error('Non riesco a convertire il testo della newsletter.');
  return cleanText(result.stdout);
}
export async function readBody(email, previewUrl, fetchPage = fetch) {
  const plain = cleanText(email.plain_text);
  if (usableBody(plain)) return plain;
  if (email.content && /<\w+[\s>]/.test(email.content)) {
    const body = htmlToText(email.content);
    if (usableBody(body)) return body;
  }
  const url = new URL(previewUrl || 'https://invalid.invalid');
  if (url.protocol !== 'https:' || !['preview.mailerlite.io','preview.mailerlite.com'].includes(url.hostname)) throw new Error('Anteprima della newsletter non disponibile.');
  const response = await fetchPage(url, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Anteprima newsletter non disponibile (${response.status}).`);
  const body = htmlToText(await response.text());
  if (!usableBody(body) || /^(?:access denied|just a moment|verify you are human|sign in|login)\b/i.test(body)) throw new Error('La newsletter non contiene un testo completo leggibile.');
  return body;
}
export const campaignEmail = campaign => {
  const emails = Array.isArray(campaign.emails) ? campaign.emails : [];
  return emails.find(email => email.is_winner) || emails[0] || {};
};
export function mergeManifesto(items, campaign, email, bodyText) {
  const number = manifestoNumber(campaign, email);
  if (number === null || campaign.status !== 'sent') return;
  const index = items.findIndex(item => item.number === number);
  const current = index >= 0 ? items[index] : null;
  const deliveredAt = campaign.finished_at || campaign.started_at;
  if (!deliveredAt || !/^\d{4}-\d{2}-\d{2}/.test(deliveredAt)) throw new Error(`Data di invio non valida per Manifesto ${number}.`);
  const date = deliveredAt.slice(0,10);
  const previewUrl = email.preview_url || campaign.preview_url || null;
  if (current?.bodySource === 'builtin') {
    items[index] = {...current,campaignId:String(campaign.id),previewUrl,deliveredAt};
    return;
  }
  if (!usableBody(bodyText)) throw new Error(`Testo incompleto per Manifesto ${number}.`);
  const paragraph = bodyText.split(/\n\s*\n/).find(value => value.length > 70) || bodyText;
  const month = new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00Z`));
  const item = {
    id:current?.id || `ml-${campaign.id}`, campaignId:String(campaign.id), number,
    title:cleanTitle(email.subject,campaign.name), date, month:month[0].toUpperCase()+month.slice(1),
    deck:'Una riflessione di Manifesti delle voci libere.',
    excerpt:paragraph.length > 220 ? `${paragraph.slice(0,216).trimEnd()}…` : paragraph,
    bodySource:'mailerlite', bodyText, previewUrl, deliveredAt
  };
  if (index >= 0) items[index] = item;
  else items.push(item);
}
