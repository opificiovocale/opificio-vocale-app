import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const token = process.env.MAILERLITE_API_TOKEN?.trim();
const dataPath = process.env.MANIFESTI_DATA_PATH || fileURLToPath(new URL("../manifesti.json", import.meta.url));

if (!token) {
  console.log("MAILERLITE_API_TOKEN non configurato: sincronizzazione saltata.");
  process.exit(0);
}

const response = await fetch(
  "https://connect.mailerlite.com/api/campaigns?filter%5Bstatus%5D=sent&limit=100",
  {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  }
);

if (!response.ok) {
  throw new Error(`MailerLite ha risposto ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
const stored = JSON.parse(await readFile(dataPath, "utf8"));
const existingItems = Array.isArray(stored.items) ? stored.items : [];

const normalize = value => String(value || "")
  .toLocaleLowerCase("it")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const campaignEmail = campaign => {
  const emails = Array.isArray(campaign.emails) ? campaign.emails : [];
  return emails.find(email => email.is_winner) || emails[0] || {};
};

const campaignDate = campaign =>
  campaign.finished_at || campaign.started_at || campaign.updated_at || campaign.created_at || "";

const cleanTitle = (subject, name) => {
  const candidate = String(subject || name || "Nuovo Manifesto").trim();
  const withoutPrefix = candidate
    .replace(/^\s*manifest[oi](?:\s+delle\s+voci\s+libere)?\s*(?:n[.°º]?\s*)?\d*\s*[-—:|·]*\s*/i, "")
    .trim();
  return withoutPrefix || candidate;
};

const cleanCampaignText = value => {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!normalized) return "";

  const footer = /\n(?:visualizza|leggi|view).{0,35}(?:browser|online)|\n.{0,30}(?:disiscriv|unsubscribe|annulla l.iscrizione|preferenze email)/i;
  const footerIndex = normalized.search(footer);
  const withoutFooter = footerIndex > 240 ? normalized.slice(0, footerIndex) : normalized;

  return withoutFooter
    .split("\n")
    .filter(line => !/\{\$[^}]+\}/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const excerptFrom = text => {
  const paragraph = text.split(/\n\s*\n/).map(part => part.trim()).find(part => part.length > 70) || "";
  if (paragraph.length <= 220) return paragraph;
  return `${paragraph.slice(0, 216).trimEnd()}…`;
};

const manifestCampaigns = (Array.isArray(payload.data) ? payload.data : [])
  .map(campaign => ({ campaign, email: campaignEmail(campaign) }))
  .filter(({ campaign, email }) => /manifest[oi]/i.test(`${campaign.name || ""} ${email.subject || ""}`))
  .sort((left, right) => new Date(campaignDate(left.campaign)) - new Date(campaignDate(right.campaign)));

let nextNumber = existingItems.reduce((highest, item) => {
  const number = Number.parseInt(item.number, 10);
  return Number.isFinite(number) ? Math.max(highest, number) : highest;
}, 0) + 1;

const items = [...existingItems];

for (const { campaign, email } of manifestCampaigns) {
  const label = `${campaign.name || ""} ${email.subject || ""}`;
  const parsedNumber = label.match(/manifest[oi](?:\s+delle\s+voci\s+libere)?\s*(?:n[.°º]?\s*)?(\d+)/i)?.[1];
  const number = parsedNumber
    ? String(Number.parseInt(parsedNumber, 10)).padStart(2, "0")
    : String(nextNumber++).padStart(2, "0");
  const bodyText = cleanCampaignText(email.plain_text);
  const title = cleanTitle(email.subject, campaign.name);
  const deliveredAt = campaignDate(campaign);
  const date = deliveredAt ? deliveredAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const previewUrl = email.preview_url || campaign.preview_url || null;
  const index = items.findIndex(item =>
    String(item.campaignId || "") === String(campaign.id) ||
    item.number === number ||
    normalize(item.title) === normalize(title)
  );

  if (index >= 0) {
    const current = items[index];
    items[index] = {
      ...current,
      campaignId: String(campaign.id),
      previewUrl: previewUrl || current.previewUrl || null,
      deliveredAt
    };
    continue;
  }

  const formattedMonth = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00Z`));

  items.push({
    id: `ml-${campaign.id}`,
    campaignId: String(campaign.id),
    number,
    title,
    date,
    month: formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1),
    deck: "Una nuova riflessione di Manifesti delle voci libere.",
    excerpt: excerptFrom(bodyText) || "Un nuovo Manifesto da leggere e attraversare.",
    bodySource: "mailerlite",
    bodyText: bodyText.length >= 120 ? bodyText : null,
    previewUrl,
    deliveredAt
  });
}

items.sort((left, right) => {
  const byDate = new Date(right.date || 0) - new Date(left.date || 0);
  return byDate || Number.parseInt(right.number, 10) - Number.parseInt(left.number, 10);
});

if (JSON.stringify(items) === JSON.stringify(existingItems)) {
  console.log("Nessun nuovo Manifesto da sincronizzare.");
  process.exit(0);
}

const nextData = {
  version: 1,
  updatedAt: new Date().toISOString(),
  items
};

await writeFile(dataPath, `${JSON.stringify(nextData, null, 2)}\n`, "utf8");
console.log(`Archivio aggiornato: ${items.length} Manifesti.`);
