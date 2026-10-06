const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../studio.js'), 'utf8');
const editorSource = readFileSync(path.join(__dirname, '../studio-edit.js'), 'utf8');

function boot({ school = true, role = 'student', lessons = [] } = {}) {
  const student = { id: 'student', nome: 'Allievo', cognome: 'Test', attivo: true, email: 'test@example.invalid', tipo_studio: school ? 'diapason' : 'privato', giorno_lezione: 2, ora_lezione: '17:30:00' };
  const packages = [{ id: 'private-package', student_id: student.id, nome_percorso: 'Vocal Boom', stato: 'attivo', incontri_usati: 1, incontri_totali: 4 }];
  const events = {}, calls = [], status = { textContent: '', dataset: {} };
  const app = { innerHTML: '' };
  const client = {
    auth: { onAuthStateChange() {} },
    from(table) {
      const filters = [];
      let payload;
      const result = () => {
        if (payload) { calls.push({ table, payload, filters }); return { data: [{ id: student.id }], error: null }; }
        const rows = table === 'students' ? [student] : table === 'packages' ? packages : table === 'lessons' ? lessons : [];
        return { data: rows.filter(row => filters.every(([key, value]) => row[key] === value)), error: null };
      };
      return {
        select() { return this; }, order() { return this; }, limit() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        update(value) { payload = value; return this; }, insert(value) { payload = value; return this; },
        async single() { const r = result(); return { data: r.data[0], error: r.error }; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
      };
    },
    async rpc(name, payload) { calls.push({ name, payload }); return { error: null }; }
  };
  const document = {
    querySelector(selector) { return selector === '#app' ? app : selector === '[data-studio-status]' ? status : null; },
    addEventListener(type, fn) { (events[type] ||= []).push(fn); }
  };
  const window = { OPIFICIO_STUDIO_CONFIG: { supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'test' }, supabase: { createClient: () => client }, addEventListener() {}, setTimeout() {}, clearTimeout() {}, dispatchEvent() {} };
  const context = { window, document, location: { hash: '#home' }, localStorage: { getItem() { return student.id; }, setItem() {} }, Intl, Date, URL, URLSearchParams, console, MutationObserver: class { observe() {} } };
  const instrumented = source.replace('  init();', `  profile = { role: ${JSON.stringify(role)}, student_id: 'student' };
    window.testApi = { studentPathMarkup, studentDetailMarkup, lessonFormMarkup, schoolNoteHTML, schoolConfigMarkup, syncSchoolConfig, schoolLessonTimestamp };`);
  vm.runInNewContext(instrumented, context);
  vm.runInNewContext(editorSource, context);
  return {
    student, calls, status, api: window.testApi, helpers: window.OPIFICIO_STUDIO_SCHOOL,
    async submit(selector, form) {
      for (const listener of events.submit) await listener({ preventDefault() {}, target: { closest: query => query === selector ? form : null } });
    },
    async change(target) { for (const listener of events.change) await listener({ target }); }
  };
}

const field = value => ({ value, checked: false });
const form = (values, dataset = {}) => ({
  dataset, elements: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, field(value)])),
  querySelector() { return { textContent: '', dataset: {}, disabled: false }; }
});

test('Diapason mostra giorno e ora ricorrenti, senza date nel riquadro e senza pagamenti', async () => {
  const app = boot();
  const html = await app.api.studentPathMarkup();
  assert.match(html, /Diapason/);
  const card = html.match(/<article class="path-card school-schedule">([\s\S]*?)<\/article>/)[1];
  assert.match(card, /Martedì · ore 17:30/);
  assert.doesNotMatch(card, /2026|ottobre|Ott/);
  assert.doesNotMatch(html, /IBAN|Pagamenti|rimanenti|Vocal Boom/);
  app.student.giorno_lezione = 3;
  app.student.ora_lezione = '19:00:00';
  assert.match(await app.api.studentPathMarkup(), /Mercoledì · ore 19:00/);
});

test('Ogni incontro condiviso è apribile; note non condivise e note private restano escluse', async () => {
  const lessons = Array.from({ length: 26 }, (_, i) => ({ id: `lesson-${i}`, student_id: 'student', data_ora: '2026-10-06T15:30:00Z', stato: i % 2 ? 'assente' : 'presente', visible_to_student: true, riepilogo_allievo: `Nota ${i}\nhttps://example.org/esercizio`, note_private: 'SEGRETO DOCENTE' }));
  lessons.push({ ...lessons[0], id: 'hidden', visible_to_student: false, riepilogo_allievo: 'NON CONDIVISO' });
  const app = boot({ lessons });
  const html = await app.api.studentPathMarkup();
  assert.equal((html.match(/<details /g) || []).length, 26);
  assert.match(html, /Presente/);
  assert.match(html, /Assente/);
  assert.match(html, /href="https:\/\/example.org\/esercizio"/);
  assert.doesNotMatch(html, /NON CONDIVISO|SEGRETO DOCENTE/);
});

test('Il campo unico conserva i vecchi contenuti pubblici e rende innocuo HTML incollato', () => {
  const app = boot();
  const note = app.helpers.schoolSharedText({ focus: 'Articolazione', riepilogo_allievo: 'Prova lentamente', esercizi: 'Ripeti domani', materials_url: 'https://example.org/prova', note_private: 'SEGRETO' });
  assert.match(note, /Articolazione\n\nProva lentamente\n\nRipeti domani\n\nhttps:/);
  assert.doesNotMatch(note, /SEGRETO/);
  const html = app.api.schoolNoteHTML('<img src=x onerror=alert(1)> https://example.org/prova. javascript:alert(1)');
  assert.doesNotMatch(html, /<img|href="javascript:/);
  assert.match(html, /&lt;img/);
  assert.match(html, /href="https:\/\/example.org\/prova"/);
  assert.match(html, /<\/a>\./);
});

test('Per Diapason rimane un solo campo note visibile nel modulo lezione', async () => {
  const app = boot({ role: 'admin' });
  const html = await app.api.lessonFormMarkup();
  assert.match(html, /data-diapason="true"/);
  const visible = html.replace(/<label\b[^>]*data-private-lesson-field[^>]*>[\s\S]*?<\/label>/g, '');
  assert.equal((visible.match(/<textarea/g) || []).length, 1);
  assert.match(visible, /Note per l’allievo/);
  assert.match(visible, /<span data-lesson-date-label>Data<\/span><input type="date"/);
  assert.match(visible, /value="50" selected/);
  const teacher = await app.api.studentDetailMarkup('student');
  assert.match(teacher, /Martedì · ore 17:30/);
  assert.doesNotMatch(teacher, /Residue|Aggiungi percorso|Salva nota privata/);
});

test('Il salvataggio docente memorizza giorno e ora sulla scheda giusta', async () => {
  const app = boot({ role: 'admin' });
  const edit = form({ student_id: 'student', nome: 'Allievo', cognome: 'Test', email: 'test@example.invalid', telefono: '', data_nascita: '', attivo: '', tipo_studio: 'diapason', giorno_lezione: '3', ora_lezione: '18:20' });
  edit.elements.attivo.checked = true;
  await app.submit('[data-edit-student]', edit);
  const update = app.calls.find(call => call.table === 'students');
  assert.equal(update.payload.tipo_studio, 'diapason');
  assert.equal(update.payload.giorno_lezione, 3);
  assert.equal(update.payload.ora_lezione, '18:20');
  assert.equal(update.filters[0][0], 'id');
  assert.equal(update.filters[0][1], 'student');
});

test('La nuova lezione Diapason salva il testo unico senza consumare pacchetti', async () => {
  const app = boot({ role: 'admin' });
  const lesson = form({ student_id: 'student', package_id: 'private-package', data_ora: '2026-10-06', durata_minuti: '50', stato: 'presente', focus: 'vecchio', note_private: 'vecchio', riepilogo_allievo: '  Suggerimento\nhttps://example.org/audio  ', esercizi: 'vecchio', recording_url: '', transcript_url: '', materials_url: '', visible_to_student: '' }, { diapason: 'true' });
  lesson.elements.visible_to_student.checked = true;
  await app.submit('[data-studio-lesson-form]', lesson);
  const call = app.calls.find(call => call.name === 'create_studio_lesson');
  assert.equal(call.payload.p_package_id, null);
  assert.equal(call.payload.p_data_ora, '2026-10-06T15:30:00.000Z');
  assert.equal(call.payload.p_focus, null);
  assert.equal(call.payload.p_note_private, null);
  assert.equal(call.payload.p_esercizi, null);
  assert.equal(call.payload.p_riepilogo_allievo, 'Suggerimento\nhttps://example.org/audio');
  assert.equal(call.payload.p_visible_to_student, true);
});

test('Modificare una lezione Diapason conserva le note private senza copiarle nel testo condiviso', async () => {
  const app = boot({ role: 'admin' });
  const lesson = form({ lesson_id: 'lesson', data_ora: '2026-10-06T17:30', durata_minuti: '50', stato: 'assente', focus: 'vecchio', note_private: 'Riservato docente', riepilogo_allievo: 'Nota unificata', esercizi: 'vecchio', recording_url: '', transcript_url: '', materials_url: '', visible_to_student: '' }, { diapason: 'true' });
  lesson.elements.visible_to_student.checked = true;
  await app.submit('[data-edit-lesson]', lesson);
  const call = app.calls.find(call => call.name === 'update_studio_lesson');
  assert.equal(call.payload.p_note_private, 'Riservato docente');
  assert.equal(call.payload.p_riepilogo_allievo, 'Nota unificata');
  assert.equal(call.payload.p_focus, null);
  assert.equal(call.payload.p_esercizi, null);
});

test('Aggiungi percorso Diapason attiva la modalità scuola senza creare un pacchetto', async () => {
  const app = boot({ role: 'admin', school: false });
  await app.submit('[data-studio-package-form]', form({ student_id: 'student', nome_percorso: 'Diapason', incontri_totali: '' }));
  assert.equal(app.calls.find(call => call.table === 'students').payload.tipo_studio, 'diapason');
  assert.ok(!app.calls.some(call => call.table === 'packages'));
});

test('La vista privata mantiene pacchetti, pagamenti e modulo completo', async () => {
  const app = boot({ school: false });
  const html = await app.api.studentPathMarkup();
  assert.match(html, /Vocal Boom/);
  assert.match(html, /3 rimanenti/);
  assert.match(html, /IBAN/);
  const form = await app.api.lessonFormMarkup();
  assert.match(form, /data-diapason="false"/);
  assert.match(form, /Registrazione Drive/);
  assert.match(form, /<input type="datetime-local" name="data_ora"/);
  assert.match(form, /Riepilogo per l’allievo/);
});

test('La data scelta usa sempre l’orario di Roma anche al cambio dell’ora e vicino a mezzanotte', () => {
  const { schoolLessonTimestamp } = boot().api;
  assert.equal(schoolLessonTimestamp('2026-10-24', '17:30:00'), '2026-10-24T15:30:00.000Z');
  assert.equal(schoolLessonTimestamp('2026-10-25', '17:30:00'), '2026-10-25T16:30:00.000Z');
  assert.equal(schoolLessonTimestamp('2026-10-06', '00:15:00'), '2026-10-05T22:15:00.000Z');
});

test('Un orario assente o impossibile non viene inventato', () => {
  const { schoolLessonTimestamp } = boot().api;
  assert.throws(() => schoolLessonTimestamp('2026-10-06', null), /Imposta prima l’orario fisso/);
  assert.throws(() => schoolLessonTimestamp('2027-03-28', '02:30:00'), /cambio dell’ora/);
});
