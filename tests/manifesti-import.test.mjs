import test from 'node:test';
import assert from 'node:assert/strict';
import { manifestoNumber, cleanTitle, usableBody, htmlToText, readBody, mergeManifesto } from '../scripts/manifesti-import.mjs';

const text = 'La voce porta con sé le abitudini che abbiamo imparato. Possiamo fermarci ad ascoltarla, riconoscere quello che sentiamo e scegliere come darle spazio nella vita quotidiana.';
const italianFallback = 'Ciao,\n\nIl software che usi per leggere le e-mail non supporta il formato html. Puoi visualizzare il tuo messaggio cliccando qui:\n\nNon ti interessa più? Clicca qui per cancellarti:';
const englishFallback = "Hello,\n\nHowever, your email software can't display HTML emails. You can view the newsletter by clicking here:\n\nNot interested anymore? Click here to unsubscribe:";
const email = {subject:'Manifesti delle voci libere #0 - La tua voce: prima di cambiarla?', preview_url:'https://preview.mailerlite.io/preview/123/emails/456'};
const campaign = {id:'456', name:'Manifesto 0', status:'sent', finished_at:'2026-08-20 12:21:29'};

test('Riconosce #0, #1 e numeri in coda; esclude gli inviti generici', () => {
  assert.equal(manifestoNumber(campaign,email),'00');
  assert.equal(manifestoNumber({name:'Manifesti delle voci libere'}, {subject:'#1 — La voce che hai imparato'}),'01');
  assert.equal(manifestoNumber({}, {subject:'Il corpo e la voce — Manifesto 03'}),'03');
  assert.equal(manifestoNumber({name:'Invito Manifesti'}, {subject:'Ciao {$name}! Vuoi partecipare a Manifesti delle voci libere?'}),null);
  assert.equal(cleanTitle(email.subject,campaign.name),'La tua voce: prima di cambiarla?');
  assert.equal(cleanTitle('#1 — La voce che hai imparato','Manifesto 1'),'La voce che hai imparato');
});

test('Rifiuta i due messaggi generici effettivamente restituiti da MailerLite', () => {
  assert.equal(usableBody(italianFallback),false);
  assert.equal(usableBody(englishFallback),false);
  assert.equal(usableBody(text),true);
});

test('Converte HTML annidato senza preheader, codice o footer, conservando paragrafi e accenti', () => {
  const html = `<html><head><title>Pagina</title><style>body {}</style></head><body><div style="display: none"><p>Anteprima invisibile</p></div><table><tr><td><h1>La voce &amp; il corpo</h1><p>${text}</p><p>Una <strong>voce</strong> libera.<br>È possibile.</p></td></tr></table><div class="ml-footer"><p>Indirizzo postale</p></div><p>Non ti interessa più? Clicca qui per cancellarti:</p><p>Altri dati</p></body></html>`;
  assert.equal(htmlToText(html),`La voce & il corpo\n\n${text}\n\nUna voce libera.\nÈ possibile.`);
});

test('La versione generica attiva l’anteprima pubblica senza credenziali', async () => {
  let calls = 0;
  const body = await readBody({...email,plain_text:italianFallback},email.preview_url,async (url,options) => {
    calls++;
    assert.equal(url.hostname,'preview.mailerlite.io');
    assert.equal(options.headers,undefined);
    return {ok:true,text:async () => `<p>${text}</p>`};
  });
  assert.equal(calls,1);
  assert.equal(body,text);
  assert.equal(await readBody({plain_text:text},null,()=>assert.fail('Non serve la rete')),text);
});

test('Anteprime mancanti o non leggibili fermano l’importazione', async () => {
  await assert.rejects(readBody({},'https://example.org/private'),/Anteprima/);
  await assert.rejects(readBody({},email.preview_url,async () => ({ok:false,status:404})),/404/);
  await assert.rejects(readBody({},email.preview_url,async () => ({ok:true,text:async () => '<p>Sign in</p>'})),/testo completo/);
});

test('Aggiorna il Manifesto 1 esistente senza duplicarlo e non importa le bozze', () => {
  const original = {id:'01',number:'01',route:'manifesto-1',bodySource:'builtin',title:'La voce che hai imparato.'};
  const items = [{...original}];
  const first = {...campaign,name:'Manifesto 1'};
  const firstEmail = {...email,subject:'Manifesti #1 — La voce che hai imparato'};
  mergeManifesto(items,first,firstEmail,null);
  mergeManifesto(items,first,firstEmail,null);
  assert.equal(items.length,1);
  assert.equal(items[0].id,original.id);
  assert.equal(items[0].route,original.route);
  assert.equal(items[0].title,original.title);
  mergeManifesto(items,{...campaign,status:'draft'},email,text);
  assert.equal(items.length,1);
  mergeManifesto(items,campaign,email,text);
  assert.equal(items.length,2);
  assert.equal(items[1].number,'00');
  assert.equal(items[1].bodyText,text);
});
