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

test('I collegamenti audio importati sono cliccabili e il testo HTML resta innocuo', () => {
  const app = boot();
  const rendered = app.run(`bodyTextMarkup('https://on.soundcloud.com/audio\\n\\nAscolta https://example.test/?a=1&b=2. <script>alert(1)</script> javascript:alert(1)')`);
  assert.match(rendered, /<p><a href="https:\/\/on.soundcloud.com\/audio"/);
  assert.match(rendered, /href="https:\/\/example.test\/\?a=1&amp;b=2"/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.doesNotMatch(rendered, /<script>|href="javascript:|<h2>https:/);
});

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

test('Stanchezza, tensione, fragilità e voce trattenuta hanno proposte distinte', () => {
  const app = boot();
  for (const [word, category] of [['stanca','tired'],['tesa','tense'],['fragile','fragile'],['trattenuta','held'],['curiosa','open']]) {
    assert.equal(app.run(`reflectionType({words:[${JSON.stringify(word)}]})`), category);
  }
  assert.equal(app.run(`reflectionType({words:['stanca','libera']})`), 'tired');
  assert.equal(app.run(`reflectionType({words:[], note:'Non viene interpretata'})`), 'unknown');
  assert.equal(app.run(`reflectionType({words:['tesa','libera']})`), 'mixed');
});

test('Le note libere e l’ordine delle parole non modificano la proposta', () => {
  const app = boot();
  const one = app.run(`JSON.stringify(reflectionFor({date:'2026-09-15', words:['tesa','fragile'], note:'prima'}, 'tense'))`);
  const two = app.run(`JSON.stringify(reflectionFor({date:'2026-09-15', words:['fragile','tesa'], note:'seconda'}, 'tense'))`);
  assert.equal(one, two);
});

test('La sola traccia non suggerisce esercizi e l’ascolto non chiede di produrre voce', () => {
  const app = boot();
  const trace = app.run(`voiceReflectionMarkup({date:'2026-09-15', words:['stanca'],note:'<img onerror=alert(1)>',intent:'note'})`);
  assert.match(trace, /Può bastare questo/);
  assert.match(trace, /&lt;img/);
  assert.doesNotMatch(trace, /data-minute-start|data-practice-toggle|<img/);
  const listen = app.run(`voiceReflectionMarkup({date:'2026-09-15',words:['curiosa'],note:'',intent:'listen'})`);
  assert.match(listen, /senza voce/);
  assert.match(listen, /mentalmente|Ripensa/);
});

test('Ogni parola e intenzione produce una restituzione completa', () => {
  const app = boot();
  assert.equal(app.run(`VOICE_WORDS.every(word => Object.keys(VOICE_INTENTS).every(intent => {
    const html = voiceReflectionMarkup({date:'2026-09-15',words:[word],note:'',intent});
    return html.includes('reflection-title') && !html.includes('undefined');
  }))`), true);
  assert.equal(app.run('Object.values(REFLECTIONS).flat().length'), 28);
});

test('Con impastata e ruvida le tre intenzioni cambiano titolo, testo e proposta visibile', () => {
  const app = boot();
  const responses = ['listen','explore','note'].map(intent => app.run(`voiceReflectionMarkup({date:'2026-09-15',words:['impastata','ruvida'],note:'',intent:'${intent}'})`));
  const titles = responses.map(html => html.match(/<h3 id="reflection-title">([^<]+)<\/h3>/)[1]);
  const copies = responses.map(html => html.match(/<p class="reflection-copy">([^<]+)<\/p>/)[1]);
  assert.equal(new Set(titles).size, 3);
  assert.equal(new Set(copies).size, 3);
  assert.match(responses[0], /data-voice-intent="listen"/);
  assert.match(responses[0], /silenzio|senza produrre voce/);
  assert.match(responses[1], /data-voice-intent="explore"/);
  assert.match(responses[1], /Scegli una frase quotidiana/);
  for (const html of responses.slice(0,2)) {
    assert.match(html, /<div class="micro-practice" data-reflection-practice>/);
    assert.doesNotMatch(html, /<div class="micro-practice"[^>]*hidden/);
  }
  assert.doesNotMatch(responses[2], /data-reflection-practice|data-minute-start|data-practice-toggle/);
});

test('Tutte le parole distinguono ascolto, esplorazione e sola traccia', () => {
  const app = boot();
  assert.equal(app.run(`VOICE_WORDS.every(word => {
    const entry = {date:'2026-09-15',words:[word],note:''};
    const results = Object.keys(VOICE_INTENTS).map(intent => reflectionFor({...entry,intent},reflectionType(entry)));
    return new Set(results.map(result => result.title)).size === 3 &&
      new Set(results.map(result => result.copy)).size === 3 &&
      results[0].practice !== results[1].practice && results[2].practice === null;
  })`), true);
});

test('La descrizione cambia subito selezionando un’intenzione, senza salvare il diario', () => {
  const app = boot();
  const description = {}, status = {};
  const form = {querySelector:selector => selector === '[data-intent-description]' ? description : status};
  for (const [value, expected] of [['listen',/senza produrre voce/],['explore',/proposta da provare/],['note',/Nessun esercizio, nessun timer/]]) {
    app.events.change({target:{name:'voiceIntent',value,closest:selector => selector === '#voiceCheckIn' ? form : null}});
    assert.match(description.textContent,expected);
    assert.match(status.textContent,/Conferma/);
  }
  assert.equal(app.run('loadVoiceDiary().length'),0);
});

test('Il riepilogo offre un pulsante di modifica riconoscibile e collegato al modulo', () => {
  const app = boot('', [{date:'2026-09-04',words:['impastata','ruvida'],note:'',intent:'listen'}]);
  assert.match(app.app.innerHTML, /class="check-edit-button"[^>]*data-check-edit[^>]*aria-controls="voiceCheckIn"/);
  assert.match(app.app.innerHTML, /Modifica le parole o la proposta/);
  assert.match(app.app.innerHTML, /class="check-edit-icon" aria-hidden="true"/);
});

test('Le versioni di codice e stile coincidono con quelle precache del service worker', () => {
  const shell = readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const worker = readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  const version = worker.match(/const CACHE = "opificio-vocale-v(\d+)"/)[1];
  for (const asset of ['app.js','styles.css']) {
    assert.ok(shell.includes(`./${asset}?v=${version}`));
    assert.ok(worker.includes(`./${asset}?v=${version}`));
  }
});

test('Le nuove intenzioni preservano il diario precedente', () => {
  const app = boot('', [{date:'2026-09-04',words:['curiosa'],note:'Conservami'}]);
  assert.equal(app.run('loadVoiceDiary()[0].intent'), 'listen');
  assert.equal(app.run('loadVoiceDiary()[0].note'), 'Conservami');
  app.run(`saveVoiceEntry({date:'2026-09-04',words:['curiosa'],note:'Conservami',intent:'note'})`);
  assert.equal(app.run('loadVoiceDiary()[0].intent'), 'note');
  assert.match(app.app.innerHTML, /id="voiceCheckIn" novalidate hidden/);
  assert.match(app.app.innerHTML, /data-check-edit/);
});

test('Altre parole mantiene la selezione e permette di raggiungere tutte le parole', () => {
  const app = boot();
  assert.equal(app.run('voiceWordChoices().length'), 7);
  assert.equal(app.run(`(() => { const seen = new Set(); for (let page = 0; page < 10; page++) {
    voiceWordPage = page; voiceWordChoices(['fragile']).forEach(word => seen.add(word));
    if (!voiceWordChoices(['fragile']).includes('fragile')) return false;
  } return seen.size === VOICE_WORDS.length; })()`), true);
});

test('Il lettore resta fuori dalle pagine e non viene ricreato navigando', () => {
  const app = boot('#manifesti');
  const classes = new Set();
  const classList = {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }};
  const label = {};
  const toggle = {setAttribute(){},focus(){}};
  const dock = {hidden:true,classList,querySelector:s => s === '[data-player-toggle-label]' ? label : toggle};
  let mounts = 0, html = '';
  const frame = {inert:false,querySelector:() => html ? {stable:true} : null, get innerHTML(){return html;}, set innerHTML(v){html=v; mounts++;}};
  app.nodes.set('#podcastPlayer', dock);
  app.nodes.set('#podcastFrame', frame);
  app.nodes.set('.app-shell', {classList});
  app.run('openPodcastPlayer()');
  assert.equal(mounts, 1);
  app.run(`location.hash='#home'; render(); setPodcastExpanded(false)`);
  assert.equal(frame.inert, true);
  assert.match(html, /open.spotify.com\/embed/);
  app.run(`location.hash='#manifesto-1'; render(); openPodcastPlayer()`);
  assert.equal(mounts, 1);
  assert.equal(frame.inert, false);
  assert.equal(dock.hidden, false);
  app.events.click({target:{closest: s => s === '[data-podcast-close]' ? {} : null}});
  assert.equal(html, '');
  assert.equal(dock.hidden, true);
  assert.equal(classes.has('has-player'), false);
  const shell = readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(shell.indexOf('id="podcastPlayer"') > shell.indexOf('</main>'));
  assert.doesNotMatch(app.app.innerHTML, /<iframe/);
});

test('Le Comunicazioni rispettano intervallo, priorità e testo sicuro', () => {
  const app = boot();
  app.run(`communications = [
    {title:'Scaduta',end:'2026-09-03',priority:99},
    {title:'Futura',start:'2026-09-05',priority:99},
    {title:'Spenta',active:false,priority:99},
    {title:'<script>prova</script>',start:'2026-09-04',end:'2026-09-04',priority:2,url:'javascript:alert(1)'},
    {title:'Secondaria',priority:1}
  ]`);
  const html = app.run('communicationMarkup()');
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /Scaduta|Futura|Spenta|Secondaria|href="javascript:/);
});

test('Le Comunicazioni usano la rete prima della cache', async () => {
  const handlers = {};
  const used = [];
  const response = {status:200,clone(){return this;}};
  vm.runInNewContext(readFileSync(path.join(__dirname,'../sw.js'),'utf8'), {
    self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>{handlers[name]=handler;}},
    URL,fetch:async()=>{used.push('network');return response;},caches:{open:async()=>({put(){used.push('cache-write');}}),match:async()=>{used.push('cache-read');return response;}}
  });
  let result;
  handlers.fetch({request:{method:'GET',url:'https://example.test/comunicazioni.json'},respondWith(p){result=p;}});
  assert.equal(await result,response);
  assert.equal(used[0],'network');
});

test('Percorsi include l’affermazione vocale senza perdere le quattro offerte', () => {
  const app = boot('#percorsi');
  for (const title of ['Affermazione vocale','Check Vocale','Reset Vocale','Vocal Boom','Vocal Hit']) assert.ok(app.app.innerHTML.includes(title));
  assert.match(app.app.innerHTML,/https:\/\/opificiovocale.it\/gender-affirming-voice-training\//);
});

test('Il modulo salva l’intenzione, si compatta e si riapre senza perdere la nota', () => {
  const app = boot();
  const status = {}, submit = {}, summary = {hidden:true};
  const reflection = {innerHTML:'',scrollIntoView(){}};
  let focused = false;
  const word = {dataset:{voiceWord:'curiosa'},focus(){focused=true;}};
  const form = {id:'voiceCheckIn',hidden:false,elements:{voiceOwnWords:{value:'Una nota di prova'},voiceIntent:{value:'note'}},
    querySelectorAll(){return [word];},querySelector(s){return s === '.check-submit' ? submit : s === '[data-voice-word]' ? word : status;}};
  app.nodes.set('#voiceCheckIn',form);
  app.nodes.set('#voiceReflection',reflection);
  app.nodes.set('#voiceDiary',{});
  app.nodes.set('[data-check-complete]',summary);
  app.events.submit({target:form,preventDefault(){}});
  assert.equal(app.run('loadVoiceDiary()[0].intent'),'note');
  assert.equal(app.run('loadVoiceDiary()[0].note'),'Una nota di prova');
  assert.equal(form.hidden,true);
  assert.equal(summary.hidden,false);
  assert.doesNotMatch(reflection.innerHTML,/data-minute-start/);
  app.events.click({target:{closest:s=>s === '[data-check-edit]' ? {} : null}});
  assert.equal(form.hidden,false);
  assert.equal(reflection.hidden,true);
  assert.equal(focused,true);
  assert.equal(form.elements.voiceOwnWords.value,'Una nota di prova');
  form.elements.voiceIntent.value = 'explore';
  app.events.submit({target:form,preventDefault(){}});
  assert.equal(reflection.hidden,false);
  assert.match(reflection.innerHTML,/data-voice-intent="explore"/);
  assert.equal(app.run('loadVoiceDiary().length'),1);
  assert.equal(app.run('loadVoiceDiary()[0].intent'),'explore');
  assert.equal(app.run('loadVoiceDiary()[0].note'),'Una nota di prova');
});

test('Una risposta vuota resta correggibile senza salvare una traccia', () => {
  const app = boot();
  const status = {};
  let focused = false;
  const form = {id:'voiceCheckIn',elements:{voiceOwnWords:{value:''}},querySelectorAll(){return [];},
    querySelector(s){return s === '[data-voice-word]' ? {focus(){focused=true;}} : status;}};
  app.events.submit({target:form,preventDefault(){}});
  assert.equal(app.run('loadVoiceDiary().length'),0);
  assert.match(status.textContent,/Scegli almeno una parola/);
  assert.equal(focused,true);
});
