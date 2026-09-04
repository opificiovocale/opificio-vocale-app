const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../app.js'), 'utf8');

function boot(hash = '', diary = []) {
  const nodes = new Map();
  const events = {};
  const storage = new Map([['opificio-voice-diary-v1', JSON.stringify(diary)]]);
  let writes = 0, html = '', tick, resolveFetch, rejectFetch;
  const clock = { now: Date.parse('2026-09-04T12:00:00Z') };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const app = { focus() {}, get innerHTML() { return html; }, set innerHTML(value) { html = value; writes++; } };
  const document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#installButton' || selector === '#installDialog') return {addEventListener() {}};
      if (selector === '[data-archive-pending]') return html.includes('data-archive-pending') ? {} : null;
      return nodes.get(selector) || null;
    },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { events[name] = handler; }
  };
  const context = vm.createContext({
    document, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: {hash, origin:'https://example.test', pathname:'/'},
    navigator: {userAgent:'test', platform:'test', maxTouchPoints:0},
    window: {addEventListener() {}, clearInterval() {}, setInterval(callback) { tick = callback; return 1; }, scrollTo() {}, matchMedia: () => ({matches:false})},
    fetch: () => new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; }),
    AbortSignal, Date:ClockDate, Intl, URL, Blob, console:{warn() {}}
  });
  vm.runInContext(source, context);
  return {app, nodes, events, storage, clock, get writes() {return writes;}, run: code => vm.runInContext(code, context), tick: () => tick(),
    async load(items) { resolveFetch({ok:true, json:async () => ({items})}); await new Promise(setImmediate); },
    async fail() { rejectFetch(new Error('offline')); await new Promise(setImmediate); }
  };
}
const item = { id:'ml-2', number:'02', title:'Un testo di prova', date:'2026-09-03', excerpt:'Un testo da leggere', bodyText:'Il testo completo del Manifesto.' };

test('Un caricamento ritardato non ricrea il check-in e non perde ciò che si sta scrivendo', async () => {
  const app = boot();
  const original = app.app.innerHTML;
  await app.load([item]);
  assert.equal(app.writes, 1);
  assert.equal(app.app.innerHTML, original);
});

test('La pagina Manifesti aggiorna solo i testi, conservando il player Spotify', async () => {
  const app = boot('#manifesti');
  const archive = {outerHTML:''};
  app.nodes.set('[data-manifesto-archive]', archive);
  await app.load([item]);
  assert.equal(app.writes, 1);
  assert.match(archive.outerHTML, /Un testo di prova/);
});

test('Un link diretto attende il testo importato senza mostrare la Home', async () => {
  const app = boot('#manifesto-ml-2');
  assert.match(app.app.innerHTML, /Sto aprendo il testo/);
  await app.load([item]);
  assert.match(app.app.innerHTML, /Il testo completo del Manifesto/);
  assert.equal(app.storage.get('opificio-last-seen-manifesto-v1'), 'ml-2');
});

test('Un testo non disponibile offre un ritorno all’archivio', async () => {
  const app = boot('#manifesto-ml-2');
  await app.fail();
  assert.match(app.app.innerHTML, /Questo Manifesto non è disponibile/);
  assert.match(app.app.innerHTML, /Vai ai Manifesti/);
});

test('Date future e dati incompleti non diventano nuove pubblicazioni', async () => {
  const app = boot();
  await app.load([null, {...item, date:'2099-01-01'}, item]);
  assert.equal(app.run('manifestiArchive.length'), 1);
  assert.equal(app.run('latestManifesto().id'), 'ml-2');
});

test('Il diario tollera dati incompleti e mostra note insieme alle parole', () => {
  const diary = Array.from({length:9}, (_, index) => ({date:`2026-08-${String(index+1).padStart(2,'0')}`,words:['curiosa'],note:'Una nota conservata'}));
  diary.push({date:'2026-09-04',note:'Una traccia senza parole',words:null});
  const app = boot('', diary);
  assert.equal(app.run('loadVoiceDiary().length'), 10);
  assert.match(app.app.innerHTML, /Una traccia senza parole/);
  assert.match(app.app.innerHTML, /Una nota conservata/);
  assert.match(app.app.innerHTML, /Mostra i giorni precedenti/);
  assert.match(app.app.innerHTML, /data-diary-older hidden/);
});

test('Il timer termina secondo il tempo trascorso anche se il browser sospende gli intervalli', () => {
  const app = boot();
  const label = {}, status = {};
  const button = {disabled:false, querySelector: () => label, parentElement:{querySelector: () => status}};
  app.events.click({target:{closest: selector => selector === '[data-minute-start]' ? button : null}});
  assert.equal(button.disabled, true);
  app.clock.now += 65000;
  app.tick();
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /Il minuto è finito/);
});

test('Un hash con nome ereditato non provoca un errore di navigazione', () => {
  const app = boot('#toString');
  assert.match(app.app.innerHTML, /Oggi la tua voce/);
});

test('Un collegamento MailerLite mancante produce un errore esplicito', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname,'../scripts/sync-mailerlite.mjs')], {env:{...process.env,MAILERLITE_API_TOKEN:''},encoding:'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Sincronizzazione non attiva/);
});

test('Il service worker lascia le risorse esterne al browser', () => {
  const handlers = {};
  vm.runInNewContext(readFileSync(path.join(__dirname,'../sw.js'),'utf8'), {self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>{handlers[name]=handler;}},URL});
  let handled = false;
  handlers.fetch({request:{method:'GET',url:'https://open.spotify.com/embed/show/test'},respondWith(){handled=true;}});
  assert.equal(handled, false);
});
