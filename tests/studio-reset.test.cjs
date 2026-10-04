const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const source = readFileSync(require('node:path').join(__dirname, '../studio.js'), 'utf8');

const audio = day => ({ day, title: `Audio ${day}`, storage_path: `giorno-${day}/${randomUUID()}.mp3`, file_name: `giorno-${day}.mp3`, size_bytes: 6682701 });
const defaultPackage = { id: 'package', student_id: 'student', nome_percorso: 'Reset Vocale', stato: 'attivo', data_inizio: '2026-10-04', created_at: '2026-10-03T12:00:00Z' };

async function boot({ hash = '#studio-reset', role = 'admin', audios = [], packages = [defaultPackage], now = '2026-10-04T10:00:00Z', saveError = false, signedError = false, loggedIn = true } = {}) {
  let html = '';
  const rows = [...audios];
  const calls = [], events = {}, statuses = new Map();
  const buttons = Array.from({ length: 7 }, () => ({ disabled: false }));
  const profile = { id: 'user', role, student_id: role === 'student' ? 'student' : null };
  const student = { id: 'student', nome: 'Riccardo', cognome: 'Test', attivo: true };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const app = { get innerHTML() { return html; }, set innerHTML(value) { html = value; } };
  const bucket = {
    async upload(path, file, options) { calls.push({ type: 'upload', path, file, options }); return { data: { path } }; },
    async remove(paths) { calls.push({ type: 'remove', paths }); return { data: [] }; },
    async createSignedUrl(path, expiry) { calls.push({ type: 'signed', path, expiry }); return signedError ? { error: new Error('unavailable') } : { data: { signedUrl: `https://example.test/audio/${path}` } }; }
  };
  const client = {
    auth: { async getSession() { return { data: { session: loggedIn ? { user: { id: 'user' } } : null } }; }, onAuthStateChange() {} },
    storage: { from(name) { assert.equal(name, 'reset-vocale'); return bucket; } },
    from(table) {
      let maxDay = 7;
      const result = () => ({ data: table === 'reset_audio' ? rows.filter(a => a.day <= maxDay) : table === 'packages' ? packages : table === 'students' ? [student] : [] });
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        lte(key, value) { if (key === 'day') maxDay = value; calls.push({ type: 'lte', table, key, value }); return this; },
        async single() { return { data: table === 'profiles' ? profile : student }; },
        async maybeSingle() { return { data: profile }; },
        async upsert(payload, options) {
          calls.push({ type: 'save', payload, options });
          if (saveError) return { error: new Error('salvataggio fallito') };
          const index = rows.findIndex(a => a.day === payload.day);
          if (index >= 0) rows[index] = payload; else rows.push(payload);
          return { data: null };
        },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
      };
      return query;
    }
  };
  const location = { hash };
  const document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      const match = selector.match(/^\[data-reset-card="(\d)"\]/);
      if (match) { const n = Number(match[1]); if (!statuses.has(n)) statuses.set(n, { textContent: '', dataset: {} }); return statuses.get(n); }
      return null;
    },
    querySelectorAll(selector) { return selector === '[data-reset-upload] button' ? buttons : []; },
    addEventListener(type, handler) { events[type] = handler; }
  };
  vm.runInNewContext(source, {
    window: { OPIFICIO_STUDIO_CONFIG: { supabaseUrl: 'https://example.test', supabasePublishableKey: 'test' }, supabase: { createClient: () => client }, addEventListener() {}, setTimeout(callback) { callback(); } },
    document, location, localStorage: { getItem(key) { return key.includes('selected-student') ? 'student' : null; } },
    Intl, URL, URLSearchParams, Date: ClockDate, crypto: { randomUUID }, console
  });
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return {
    app, calls, rows, statuses, buttons, location,
    async upload({ day = 1, file = { name: 'Reset_Vocale_Giorno_1.mp3', type: 'audio/mpeg', size: 6682701 }, title = 'Giorno 1' } = {}) {
      const status = { textContent: '', dataset: {} };
      const form = { dataset: { resetUpload: String(day), resetOldPath: audios.find(a => a.day === day)?.storage_path || '' }, elements: { audio: { files: file ? [file] : [] }, title: { value: title } }, querySelector: () => status };
      await events.submit({ preventDefault() {}, target: { closest: selector => selector === '[data-reset-upload]' ? form : null } });
      return status;
    }
  };
}

test('Audio Reset mostra sette caricamenti reali e un selettore MP3', async () => {
  const app = await boot();
  assert.equal((app.app.innerHTML.match(/data-reset-upload="/g) || []).length, 7);
  assert.match(app.app.innerHTML, /name="audio" accept="\.mp3,audio\/mpeg,audio\/mp3"/);
  assert.match(app.app.innerHTML, /Carica audio/);
});

test('Il caricamento salva il giorno e mostra il lettore, senza esporre HTML dal titolo', async () => {
  const app = await boot();
  await app.upload({ title: '<script>prova</script>' });
  const upload = app.calls.find(c => c.type === 'upload');
  assert.match(upload.path, /^giorno-1\/[0-9a-f-]{36}\.mp3$/);
  assert.equal(upload.options.contentType, 'audio/mpeg');
  assert.equal(upload.options.upsert, false);
  assert.equal(app.rows[0].day, 1);
  assert.equal(app.rows[0].size_bytes, 6682701);
  assert.match(app.app.innerHTML, /&lt;script&gt;prova&lt;\/script&gt;/);
  assert.doesNotMatch(app.app.innerHTML, /<script>/);
  assert.match(app.app.innerHTML, /<audio .*controls preload="none"/);
  assert.equal(app.statuses.get(1).textContent, 'Audio del Giorno 1 caricato.');
  assert.ok(app.buttons.every(button => !button.disabled));
});

test('La sostituzione elimina il vecchio file soltanto dopo il salvataggio', async () => {
  const previous = audio(1);
  const app = await boot({ audios: [previous] });
  await app.upload();
  assert.notEqual(app.rows[0].storage_path, previous.storage_path);
  const mutations = app.calls.filter(c => ['upload', 'save', 'remove'].includes(c.type));
  assert.deepEqual(mutations.map(c => c.type), ['upload', 'save', 'remove']);
  assert.equal(mutations[2].paths[0], previous.storage_path);
});

test('Un salvataggio fallito conserva il precedente e rimuove solo il nuovo file', async () => {
  const previous = audio(1);
  const app = await boot({ audios: [previous], saveError: true });
  const status = await app.upload();
  assert.equal(app.rows[0].storage_path, previous.storage_path);
  const upload = app.calls.find(c => c.type === 'upload');
  assert.equal(app.calls.find(c => c.type === 'remove').paths[0], upload.path);
  assert.match(status.textContent, /Caricamento non riuscito/);
  assert.ok(app.buttons.every(button => !button.disabled));
});

test('File diversi da MP3 o troppo grandi non vengono caricati', async () => {
  for (const file of [ { name: 'audio.wav', type: 'audio/wav', size: 200 }, { name: 'audio.mp3', type: 'audio/mpeg', size: 30 * 1024 * 1024 }, { name: 'vuoto.mp3', type: 'audio/mpeg', size: 0 } ]) {
    const app = await boot();
    assert.equal((await app.upload({ file })).dataset.tone, 'error');
    assert.ok(!app.calls.some(c => c.type === 'upload'));
  }
});

test('La vista allievo mostra soltanto i giorni sbloccati, con il calendario di Roma', async () => {
  const app = await boot({ hash: '#percorso', role: 'student', audios: [audio(1), audio(2)], now: '2026-10-03T22:05:00Z' });
  assert.match(app.app.innerHTML, /Giorno 1 di 7/);
  assert.match(app.app.innerHTML, /Ascolta il Giorno 1/);
  assert.doesNotMatch(app.app.innerHTML, /Giorno 2|Nuova lezione|MP3 del Giorno/);
  assert.ok(app.calls.filter(c => c.type === 'signed').every(c => c.path.startsWith('giorno-1/')));
});

test('Prima della data di inizio non viene richiesto alcun audio', async () => {
  const app = await boot({ hash: '#percorso', role: 'student', packages: [{ ...defaultPackage, data_inizio: '2026-10-05' }], audios: [audio(1)] });
  assert.match(app.app.innerHTML, /Il percorso inizia il/);
  assert.ok(!app.calls.some(c => c.type === 'signed'));
});

test('Cambio ora e assenza di data di inizio non spostano i giorni del Reset', async () => {
  const app = await boot({ hash: '#percorso', role: 'student', now: '2026-10-25T22:30:00Z', packages: [{ ...defaultPackage, data_inizio: null, created_at: '2026-10-23T21:30:00Z' }] });
  assert.match(app.app.innerHTML, /Giorno 3 di 7/);
});

test('Un allievo e una persona senza login non possono caricare file', async () => {
  const student = await boot({ role: 'student' });
  assert.equal(student.location.hash, 'percorso');
  await student.upload();
  assert.ok(!student.calls.some(c => c.type === 'upload'));
  const anonymous = await boot({ loggedIn: false });
  assert.doesNotMatch(anonymous.app.innerHTML, /data-reset-upload=/);
});

test('Un errore nella firma del file mantiene la schermata utilizzabile', async () => {
  const app = await boot({ audios: [audio(1)], signedError: true });
  assert.match(app.app.innerHTML, /Audio temporaneamente non disponibile/);
  assert.match(app.app.innerHTML, /Sostituisci audio/);
  assert.doesNotMatch(app.app.innerHTML, /src="undefined"/);
});

test('Test Reset usa gli audio caricati e collega il pannello di caricamento', async () => {
  const app = await boot({ hash: '#reset-demo?day=2', audios: [audio(1), audio(2), audio(3)] });
  assert.equal((app.app.innerHTML.match(/<audio /g) || []).length, 2);
  assert.match(app.app.innerHTML, /data-route="studio-reset">Carica gli audio/);
  assert.doesNotMatch(app.app.innerHTML, /Ascolta il Giorno 3/);
  assert.ok(!app.calls.some(c => c.type === 'upload'));
});
