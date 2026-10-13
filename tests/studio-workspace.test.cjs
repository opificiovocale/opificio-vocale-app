const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../studio.js'), 'utf8');

function boot({ role = 'admin', directoryError = false, deferDirectory = false } = {}) {
  const students = [
    { id: 's1', nome: 'Zoë', cognome: 'Rossi', attivo: true, email: 'zoe@example.test' },
    { id: 's2', nome: '<img src=x onerror=alert(1)>', cognome: '"prova"', attivo: false }
  ];
  const calls = [], events = {}, timers = [];
  let releaseDirectory, authChange;
  const app = { innerHTML: '' };
  const location = { hash: '#studio-allievo' };
  const client = {
    auth: { onAuthStateChange(callback) { authChange = callback; } },
    from(table) {
      let fields;
      const filters = [];
      const result = () => ({ data: (table === 'students' ? students : []).filter(row => filters.every(([key, value]) => row[key] === value)), error: null });
      return {
        select(value) { fields = value; calls.push({ table, fields }); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        order() { return this; }, limit() { return this; },
        async single() { return { data: result().data[0], error: null }; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve, reject) {
          if (fields === 'id,nome,cognome,attivo') {
            if (deferDirectory) return new Promise(done => { releaseDirectory = () => done(result()); }).then(resolve, reject);
            if (directoryError) return Promise.resolve({ data: null, error: new Error('offline') }).then(resolve, reject);
          }
          return Promise.resolve(result()).then(resolve, reject);
        }
      };
    }
  };
  const window = {
    OPIFICIO_STUDIO_CONFIG: { supabaseUrl: 'https://example.test', supabasePublishableKey: 'test' },
    supabase: { createClient: () => client }, addEventListener() {},
    setTimeout(callback) { timers.push(callback); }
  };
  const document = { querySelector: selector => selector === '#app' ? app : null, addEventListener(type, callback) { events[type] = callback; } };
  const instrumented = source.replace('  init();', `
    profile = { role: ${JSON.stringify(role)}, student_id: 's1' };
    session = { user: { id: 'user' } };
    window.testApi = { workspaceMarkup, workspaceNavigationMarkup, renderStudio };`);
  vm.runInNewContext(instrumented, { window, document, location, localStorage: { getItem: () => 's1' }, URL, URLSearchParams, Intl, Date, console });
  return { app, location, students, calls, events, timers, api: window.testApi, release: () => releaseDirectory(), signOut: () => authChange('SIGNED_OUT', null) };
}

test('La vista allievo non legge la directory docente e non contiene i suoi comandi', async () => {
  const app = boot({ role: 'student' });
  const html = await app.api.workspaceMarkup('percorso', '<p>Il mio percorso</p>');
  assert.match(html, /Il mio percorso/);
  assert.doesNotMatch(html, /Nuova lezione|studio-workspace-sidebar|Audio Reset/);
  assert.equal(app.calls.length, 0);
});

test('La directory docente usa solo nomi e stato, rende sicuro il testo e conserva la scheda selezionata', async () => {
  const app = boot();
  const html = await app.api.workspaceMarkup('studio-allievo', '<p>Scheda</p>');
  assert.match(html, /data-studio-student="s1"[^>]*aria-current="true"/);
  assert.match(html, /Zoë Rossi/);
  assert.doesNotMatch(html, /<img|zoe@example.test/);
  assert.match(html, /&lt;img/);
  assert.deepEqual(app.calls, [{ table: 'students', fields: 'id,nome,cognome,attivo' }]);
});

test('La ricerca trova anche i nomi con accenti e può ripristinare tutte le schede', () => {
  const app = boot();
  const buttons = ['Zoë Rossi', 'Nicola Bianchi'].map(name => ({ dataset: { studioSearch: name }, hidden: false }));
  const status = { textContent: '' };
  const directory = { querySelectorAll: () => buttons, querySelector: () => status };
  const input = { value: 'zoe', closest: () => directory };
  const search = value => {
    input.value = value;
    app.events.input({ target: { closest: selector => selector === '[data-studio-directory-search]' ? input : null } });
  };
  search('zoe');
  assert.equal(buttons[0].hidden, false);
  assert.equal(buttons[1].hidden, true);
  assert.equal(status.textContent, '1 persona trovata.');
  search('inesistente');
  assert.ok(buttons.every(button => button.hidden));
  assert.match(status.textContent, /Nessun risultato/);
  search('');
  assert.ok(buttons.every(button => !button.hidden));
  assert.equal(status.textContent, '');
});

test('Una directory non disponibile non impedisce di compilare la lezione', async () => {
  const app = boot({ directoryError: true });
  const html = await app.api.workspaceMarkup('studio-lezione', '<form>Lezione in corso</form>');
  assert.match(html, /Lezione in corso/);
  assert.match(html, /Navigazione Studio/);
  assert.doesNotMatch(html, /studio-workspace-sidebar/);
});

test('Una lettura ritardata non sovrascrive la Home dopo il cambio di pagina', async () => {
  const app = boot({ deferDirectory: true });
  const render = app.api.renderStudio();
  await new Promise(setImmediate);
  app.location.hash = '#home';
  app.app.innerHTML = 'HOME';
  app.release();
  await render;
  assert.equal(app.app.innerHTML, 'HOME');
});

test('Una lettura ritardata non ripubblica la directory dopo la disconnessione', async () => {
  const app = boot({ deferDirectory: true });
  const render = app.api.renderStudio();
  await new Promise(setImmediate);
  app.signOut();
  app.app.innerHTML = 'LOGIN';
  app.release();
  await render;
  assert.equal(app.app.innerHTML, 'LOGIN');
  assert.ok(app.timers.length > 0);
});
