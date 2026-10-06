(() => {
  "use strict";

  const config = window.OPIFICIO_STUDIO_CONFIG;
  const sdk = window.supabase;
  const app = document.querySelector("#app");
  const STUDIO_ROUTES = new Set(["studio", "studio-allievi", "studio-allievo", "studio-lezione", "percorso", "reset-demo", "studio-reset"]);
  const RESET_BUCKET = "reset-vocale";
  const RESET_MAX_BYTES = 25 * 1024 * 1024;
  const isResetPackage = pkg => String(typeof pkg === "string" ? pkg : pkg?.nome_percorso || "").trim().toLowerCase() === "reset vocale";
  const packageUnit = pkg => isResetPackage(pkg) ? "giorni" : "incontri";
  const SELECTED_STUDENT_KEY = "opificio-studio-selected-student";
  const LOGIN_EMAIL_KEY = "opificio-studio-login-email";

  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient || !app) return;

  const client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  let session = null;
  let profile = null;
  let loading = false;
  let lastError = "";
  let uploadingReset = false;

  const escapeHTML = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const currentRoute = () => (location.hash || "#home").slice(1).split("?")[0] || "home";
  const isStudioRoute = () => STUDIO_ROUTES.has(currentRoute());

  const safeUrl = value => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };

  const SCHOOL_DAYS = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  const isDiapason = student => student?.tipo_studio === "diapason";
  const isDiapasonName = value => /^diapason\b/i.test(String(value || "").trim());
  const schoolSchedule = student => {
    const day = SCHOOL_DAYS[Number(student?.giorno_lezione)];
    const time = String(student?.ora_lezione || "").slice(0, 5);
    return day && /^\d{2}:\d{2}$/.test(time) ? `${day} · ore ${time}` : "Orario da definire";
  };
  const schoolConfigMarkup = (student = {}) => `
    <label><span>Percorso dell’allievo</span><select name="tipo_studio" data-school-type>
      <option value="privato" ${!isDiapason(student) ? "selected" : ""}>Opificio Vocale · privato</option>
      <option value="diapason" ${isDiapason(student) ? "selected" : ""}>Diapason · Canto</option>
    </select></label>
    <div class="studio-form-row" data-school-schedule ${isDiapason(student) ? "" : 'hidden style="display:none"'}>
      <label><span>Giorno fisso</span><select name="giorno_lezione">
        <option value="">Da definire</option>
        ${SCHOOL_DAYS.slice(1).map((day, index) => `<option value="${index + 1}" ${Number(student.giorno_lezione) === index + 1 ? "selected" : ""}>${day}</option>`).join("")}
      </select></label>
      <label><span>Ora</span><input type="time" name="ora_lezione" step="60" value="${escapeHTML(String(student.ora_lezione || "").slice(0, 5))}"></label>
    </div>`;
  const schoolConfigPayload = form => ({
    tipo_studio: form.elements.tipo_studio.value,
    giorno_lezione: form.elements.giorno_lezione.value ? Number(form.elements.giorno_lezione.value) : null,
    ora_lezione: form.elements.ora_lezione.value || null
  });
  const syncSchoolConfig = form => {
    const fields = form.querySelector("[data-school-schedule]");
    if (!fields) return;
    const school = form.elements.tipo_studio.value === "diapason";
    fields.hidden = !school;
    fields.style.display = school ? "" : "none";
    form.elements.giorno_lezione.required = school && Boolean(form.elements.ora_lezione.value);
    form.elements.ora_lezione.required = school && Boolean(form.elements.giorno_lezione.value);
  };
  const schoolSharedText = lesson => [...new Set([
    lesson.focus, lesson.riepilogo_allievo, lesson.esercizi,
    lesson.recording_url, lesson.transcript_url, lesson.materials_url
  ].map(value => String(value || "").trim()).filter(Boolean))].join("\n\n");
  const schoolNoteHTML = value => {
    const text = String(value || "");
    let html = "", offset = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const candidate = match[0].replace(/[.,;!?)\]]+$/, "");
      const url = safeUrl(candidate);
      html += escapeHTML(text.slice(offset, match.index));
      html += url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(candidate)}</a>` : escapeHTML(candidate);
      offset = match.index + candidate.length;
    }
    return html + escapeHTML(text.slice(offset));
  };
  const schoolLessonCards = lessons => lessons.map(lesson => `
    <details class="student-lesson-item school-lesson-item">
      <summary>
        <time>${escapeHTML(formatDate(lesson.data_ora))}</time>
        <span class="student-lesson-heading"><strong>${escapeHTML(({ presente: "Presente", assente: "Assente", recupero: "Recupero", annullata: "Annullata" })[lesson.stato] || "Incontro")}</strong><small>Apri le note della lezione</small></span>
        <span class="student-lesson-toggle" aria-hidden="true">＋</span>
      </summary>
      <div class="student-lesson-body"><p class="school-shared-note">${schoolNoteHTML(schoolSharedText(lesson)) || "Nessuna nota inserita."}</p></div>
    </details>`).join("") || '<div class="studio-empty"><p>Ancora nessun incontro condiviso.</p></div>';

  // Shared with the existing teacher editor; no private notes enter the public text.
  window.OPIFICIO_STUDIO_SCHOOL = { isDiapason, schoolSchedule, schoolConfigMarkup, schoolConfigPayload, schoolSharedText };

  const formatDate = value => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  };

  const calculateAge = value => {
    if (!value) return null;
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return null;
    const today = new Date();
    let age = today.getFullYear() - year;
    const beforeBirthday =
      (today.getMonth() + 1 < month) ||
      (today.getMonth() + 1 === month && today.getDate() < day);
    if (beforeBirthday) age -= 1;
    return age >= 0 ? age : null;
  };

  const formatDateTime = value => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("it-IT", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(new Date(value));
  };

  const toDatetimeLocal = date => {
    const d = date || new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const getSelectedStudentId = () => {
    try { return localStorage.getItem(SELECTED_STUDENT_KEY) || ""; }
    catch { return ""; }
  };

  const setSelectedStudentId = id => {
    try { localStorage.setItem(SELECTED_STUDENT_KEY, id); } catch {}
  };

  const getLoginEmail = () => {
    try { return localStorage.getItem(LOGIN_EMAIL_KEY) || ""; }
    catch { return ""; }
  };

  const clearLoginEmail = () => {
    try { localStorage.removeItem(LOGIN_EMAIL_KEY); } catch {}
  };

  const setStatus = (message, tone = "") => {
    const el = document.querySelector("[data-studio-status]");
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  };

  const copyText = async text => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy failed");
  };

  const studentInviteText = ({ nome, email }) => [
    `Ciao ${nome}! Ho attivato il tuo spazio personale su Opificio Vocale.`,
    "",
    "Puoi accedere qui:",
    "https://app.opificiovocale.it/#studio",
    "",
    `Usa questa email: ${email}`,
    "Riceverai un codice monouso via email: non serve creare una password.",
    "",
    "Da lì potrai ritrovare il tuo percorso, i riepiloghi delle lezioni e i materiali che scelgo di condividere con te."
  ].join("\n");

  const authMarkup = () => {
    const pendingEmail = getLoginEmail();
    return `
      <section class="page studio-page" aria-labelledby="studio-login-title">
        <header class="studio-hero">
          <button class="back-button" type="button" data-route="home"><span aria-hidden="true">←</span> Home</button>
          <p class="eyebrow">Area riservata</p>
          <h1 id="studio-login-title">Studio.</h1>
          <p class="lead">Accedi al tuo spazio Opificio Vocale.</p>
        </header>
        ${pendingEmail ? `
          <form class="studio-form studio-auth-form" data-studio-otp>
            <p class="studio-helper">Abbiamo inviato un codice a <strong>${escapeHTML(pendingEmail)}</strong>.</p>
            <label>
              <span>Codice di accesso</span>
              <input type="text" name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="12345678">
            </label>
            <button class="primary-button" type="submit">Entra in Studio <span aria-hidden="true">→</span></button>
            <button class="studio-text-button" type="button" data-studio-reset-login>Usa un’altra email</button>
            <p class="studio-status" data-studio-status role="status"></p>
          </form>
        ` : `
          <form class="studio-form studio-auth-form" data-studio-login>
            <label>
              <span>Email</span>
              <input type="email" name="email" autocomplete="email" required placeholder="nome@email.it">
            </label>
            <button class="primary-button" type="submit">Mandami il codice <span aria-hidden="true">→</span></button>
            <p class="studio-helper">Niente password e niente link: riceverai un codice monouso via email.</p>
            <p class="studio-status" data-studio-status role="status"></p>
          </form>
        `}
      </section>`;
  };

  const loadingMarkup = () => `
    <section class="page studio-page">
      <header class="studio-hero">
        <button class="back-button" type="button" data-route="home"><span aria-hidden="true">←</span> Home</button>
        <p class="eyebrow">Area riservata</p>
        <h1>Studio.</h1>
        <p class="lead">Sto aprendo il tuo spazio…</p>
      </header>
    </section>`;

  const errorMarkup = message => `
    <section class="page studio-page">
      <header class="studio-hero">
        <button class="back-button" type="button" data-route="home"><span aria-hidden="true">←</span> Home</button>
        <p class="eyebrow">Studio</p>
        <h1>Non riesco ad aprirlo.</h1>
        <p class="lead">${escapeHTML(message)}</p>
        <button class="primary-button" type="button" data-studio-retry>Riprova</button>
      </header>
    </section>`;

  const adminHomeMarkup = async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [{ count: studentCount }, lessonsResult, packagesResult] = await Promise.all([
      client.from("students").select("*", { count: "exact", head: true }).eq("attivo", true),
      client.from("lessons")
        .select("id,data_ora,stato,focus,student_id,students(nome,cognome)")
        .gte("data_ora", todayStart.toISOString())
        .lt("data_ora", tomorrow.toISOString())
        .order("data_ora"),
      client.from("packages")
        .select("id,student_id,nome_percorso,incontri_totali,incontri_usati,stato,students(nome,cognome)")
        .eq("stato", "attivo")
        .order("updated_at", { ascending: false })
    ]);

    const lessons = lessonsResult.data || [];
    const activePackages = packagesResult.data || [];
    const closingPackages = activePackages
      .filter(pkg => Math.max(0, pkg.incontri_totali - pkg.incontri_usati) <= 1)
      .sort((a, b) => (a.incontri_totali - a.incontri_usati) - (b.incontri_totali - b.incontri_usati));
    return `
      <section class="page studio-page" aria-labelledby="studio-title">
        <header class="studio-hero">
          <button class="back-button" type="button" data-route="home"><span aria-hidden="true">←</span> Home</button>
          <p class="eyebrow">Area riservata · Docente</p>
          <h1 id="studio-title">Studio.</h1>
          <p class="lead">Lezioni, percorsi, materiali e memoria didattica.</p>
          <div class="studio-session-line">
            <span>${escapeHTML(profile?.email || session?.user?.email || "")}</span>
            <button type="button" data-studio-signout>Esci</button>
          </div>
        </header>

        <section class="studio-summary-grid" aria-label="Riepilogo Studio">
          <article class="studio-stat"><small>Allievi attivi</small><strong>${studentCount ?? 0}</strong><span>persone</span></article>
          <article class="studio-stat"><small>Oggi</small><strong>${lessons.length}</strong><span>lezioni</span></article>
          <article class="studio-stat"><small>Percorsi attivi</small><strong>${activePackages.length}</strong><span>in corso</span></article>
        </section>

        <section class="studio-section" aria-labelledby="studio-today">
          <div class="studio-section-heading">
            <div>
              <p class="content-kicker"><span>Oggi</span> · Agenda</p>
              <h2 id="studio-today">Lezioni di oggi.</h2>
            </div>
            <span class="studio-count">${lessons.length}</span>
          </div>
          ${lessons.length ? `
            <div class="lesson-history">
              ${lessons.map(lesson => `
                <button type="button" data-studio-student="${lesson.student_id}">
                  <time>${escapeHTML(formatDateTime(lesson.data_ora).split(",").pop()?.trim() || "")}</time>
                  <span>
                    <strong>${escapeHTML([lesson.students?.nome, lesson.students?.cognome].filter(Boolean).join(" "))}</strong>
                    <small>${escapeHTML(lesson.focus || lesson.stato)}</small>
                  </span>
                  <span>→</span>
                </button>
              `).join("")}
            </div>` : `
            <div class="studio-empty">
              <p>Nessuna lezione registrata per oggi.</p>
              <button class="primary-button" type="button" data-route="studio-lezione">Nuova lezione <span aria-hidden="true">→</span></button>
            </div>`}
        </section>

        ${closingPackages.length ? `
        <section class="studio-section" aria-labelledby="studio-closing">
          <div class="studio-section-heading">
            <div>
              <p class="content-kicker"><span>Percorsi</span> · In chiusura</p>
              <h2 id="studio-closing">Ultimo incontro.</h2>
            </div>
            <span class="studio-count">${closingPackages.length}</span>
          </div>
          <div class="lesson-history">
            ${closingPackages.map(pkg => {
              const remaining = Math.max(0, pkg.incontri_totali - pkg.incontri_usati);
              return `
                <button type="button" data-studio-student="${pkg.student_id}">
                  <time>${remaining}</time>
                  <span>
                    <strong>${escapeHTML([pkg.students?.nome, pkg.students?.cognome].filter(Boolean).join(" "))}</strong>
                    <small>${escapeHTML(pkg.nome_percorso)} · ${remaining === 1 ? "1 incontro rimasto" : "da chiudere"}</small>
                  </span>
                  <span>→</span>
                </button>`;
            }).join("")}
          </div>
        </section>` : ""}

        <section class="studio-section studio-actions">
          <p class="content-kicker"><span>Accessi rapidi</span></p>
          <h2>Tutto a portata di mano.</h2>
          <div class="studio-action-grid">
            <button class="studio-action-card" type="button" data-route="studio-lezione">
              <span aria-hidden="true">＋</span><strong>Nuova lezione</strong><small>Registra l’incontro e i link Drive.</small>
            </button>
            <button class="studio-action-card" type="button" data-route="studio-allievi">
              <span aria-hidden="true">◎</span><strong>Allievi</strong><small>Schede, percorsi e storico.</small>
            </button>
            <button class="studio-action-card" type="button" data-route="percorso">
              <span aria-hidden="true">↗</span><strong>Vista allievo</strong><small>Anteprima del percorso selezionato.</small>
            </button>
            <button class="studio-action-card" type="button" data-route="reset-demo">
              <span aria-hidden="true">◉</span><strong>Test Reset</strong><small>Simula i 7 giorni e gli sblocchi lato allievo.</small>
            </button>
            <button class="studio-action-card" type="button" data-route="studio-reset">
              <span aria-hidden="true">♫</span><strong>Audio Reset</strong><small>Carica gli MP3 dei sette giorni.</small>
            </button>
          </div>
        </section>
      </section>`;
  };

  const studentsMarkup = async () => {
    const { data, error } = await client.from("students")
      .select("id,nome,cognome,email,data_nascita,attivo,tipo_studio,giorno_lezione,ora_lezione,packages(id,nome_percorso,incontri_totali,incontri_usati,stato)")
      .order("nome");
    if (error) throw error;
    const students = data || [];

    return `
      <section class="page studio-page" aria-labelledby="students-title">
        <header class="studio-compact-header">
          <button class="back-button" type="button" data-route="studio"><span aria-hidden="true">←</span> Studio</button>
          <p class="eyebrow">Studio · Allievi</p>
          <h1 id="students-title">Allievi.</h1>
          <p>${students.length} ${students.length === 1 ? "scheda" : "schede"} nel database.</p>
        </header>
        <section class="studio-list">
          ${students.map(student => {
            const activePackage = (student.packages || []).find(p => p.stato === "attivo");
            const age = calculateAge(student.data_nascita);
            const initials = `${student.nome?.[0] || ""}${student.cognome?.[0] || ""}`.toUpperCase();
            return `
              <button class="student-row" type="button" data-studio-student="${student.id}">
                <span class="student-avatar" aria-hidden="true">${escapeHTML(initials || "OV")}</span>
                <span>
                  <small>${escapeHTML([
                    age !== null ? `${age} anni` : "",
                    isDiapason(student) ? `Diapason · ${schoolSchedule(student)}` : activePackage ? `${activePackage.nome_percorso} · ${activePackage.incontri_usati}/${activePackage.incontri_totali}` : "Nessun percorso attivo",
                    student.attivo ? "scheda attiva" : "scheda in pausa"
                  ].filter(Boolean).join(" · "))}</small>
                  <strong>${escapeHTML([student.nome, student.cognome].filter(Boolean).join(" "))}</strong>
                  <em>${escapeHTML(student.email)}</em>
                </span>
                <span class="arrow" aria-hidden="true">→</span>
              </button>`;
          }).join("") || '<div class="studio-empty"><p>Non hai ancora inserito allievi.</p></div>'}

          <details class="studio-inline-panel">
            <summary>＋ Nuovo allievo</summary>
            <form class="studio-form studio-inline-form" data-studio-student-form>
              <div class="studio-form-row">
                <label><span>Nome</span><input name="nome" required></label>
                <label><span>Cognome</span><input name="cognome"></label>
              </div>
              <label><span>Email</span><input type="email" name="email" required autocomplete="email"></label>
              <label><span>Telefono</span><input type="tel" name="telefono" autocomplete="tel"></label>
              <label><span>Data di nascita</span><input type="date" name="data_nascita" autocomplete="bday"></label>
              ${schoolConfigMarkup()}
              <button class="primary-button" type="submit">Crea scheda</button>
              <p class="studio-status" data-studio-status role="status"></p>
            </form>
          </details>
        </section>
      </section>`;
  };

  const studentDetailMarkup = async studentId => {
    if (!studentId) return `
      <section class="page studio-page">
        <header class="studio-compact-header">
          <button class="back-button" type="button" data-route="studio-allievi"><span aria-hidden="true">←</span> Allievi</button>
          <h1>Scegli un allievo.</h1>
          <p>Apri prima una scheda dall’elenco.</p>
        </header>
      </section>`;

    const [studentRes, packagesRes, lessonsRes, noteRes] = await Promise.all([
      client.from("students").select("*").eq("id", studentId).single(),
      client.from("packages").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      client.from("lessons").select("*").eq("student_id", studentId).order("data_ora", { ascending: false }),
      client.from("student_private_notes").select("note").eq("student_id", studentId).maybeSingle()
    ]);
    if (studentRes.error) throw studentRes.error;

    const student = studentRes.data;
    const diapason = isDiapason(student);
    const packages = packagesRes.data || [];
    const lessons = lessonsRes.data || [];
    const activePackage = packages.find(p => p.stato === "attivo");
    const latest = lessons[0];
    const age = calculateAge(student.data_nascita);

    return `
      <section class="page studio-page" aria-labelledby="student-title">
        <header class="studio-compact-header">
          <button class="back-button" type="button" data-route="studio-allievi"><span aria-hidden="true">←</span> Allievi</button>
          <p class="eyebrow">Scheda allievo</p>
          <h1 id="student-title">${escapeHTML([student.nome, student.cognome].filter(Boolean).join(" "))}.</h1>
          <p>${age !== null ? `${age} anni · ` : ""}${escapeHTML(student.email)}${student.telefono ? ` · ${escapeHTML(student.telefono)}` : ""}</p>
          <div class="studio-student-header-actions">
            <button class="primary-button" type="button" data-copy-student-invite data-student-name="${escapeHTML(student.nome)}" data-student-email="${escapeHTML(student.email)}">Copia invito</button>
            <p class="studio-copy-status" data-copy-invite-status role="status"></p>
          </div>
        </header>

        <section class="studio-summary-grid">
          ${diapason ? `
          <article class="studio-stat"><small>Percorso</small><strong>Diapason</strong><span>Canto</span></article>
          <article class="studio-stat"><small>Orario settimanale</small><strong>${escapeHTML(schoolSchedule(student))}</strong><span>Modificabile in Dati allievo</span></article>` : `
          <article class="studio-stat"><small>Percorso</small><strong>${escapeHTML(activePackage?.nome_percorso || "—")}</strong><span>${activePackage ? `${activePackage.incontri_usati} di ${activePackage.incontri_totali}` : "nessuno attivo"}</span></article>
          <article class="studio-stat"><small>Residue</small><strong>${activePackage ? Math.max(0, activePackage.incontri_totali - activePackage.incontri_usati) : "—"}</strong><span>lezioni</span></article>
          <article class="studio-stat"><small>Ultima</small><strong>${latest ? escapeHTML(formatDate(latest.data_ora).split(" ")[0]) : "—"}</strong><span>${latest ? escapeHTML(formatDate(latest.data_ora).split(" ").slice(1).join(" ")) : "nessuna"}</span></article>`}
        </section>

        ${diapason ? "" : `<section class="studio-section">
          <p class="content-kicker"><span>Note private</span> · Solo docente</p>
          <form class="studio-form studio-inline-form private-field" data-studio-student-note>
            <input type="hidden" name="student_id" value="${student.id}">
            <textarea name="note" rows="4" placeholder="Osservazioni generali sul percorso…">${escapeHTML(noteRes.data?.note || "")}</textarea>
            <button class="primary-button secondary" type="submit">Salva nota privata</button>
            <p class="studio-status" data-studio-status role="status"></p>
          </form>
        </section>

        <section class="studio-section">
          <p class="content-kicker"><span>Percorsi</span></p>
          <h2>${activePackage ? "Percorso attivo." : "Nessun percorso attivo."}</h2>
          ${packages.length ? `
            <div class="lesson-history">
              ${packages.map(pkg => `
                <div class="studio-data-row">
                  <span><strong>${escapeHTML(pkg.nome_percorso)}</strong><small>${pkg.incontri_usati}/${pkg.incontri_totali} ${packageUnit(pkg)} · ${escapeHTML(pkg.stato)}</small></span>
                </div>
              `).join("")}
            </div>` : ""}
          <details class="studio-inline-panel">
            <summary>＋ Aggiungi percorso</summary>
            <form class="studio-form studio-inline-form" data-studio-package-form>
              <input type="hidden" name="student_id" value="${student.id}">
              <label><span>Nome percorso</span><input name="nome_percorso" list="studio-package-names" required placeholder="Es. Vocal Boom"></label>
              <datalist id="studio-package-names">
                <option value="Reset Vocale"></option>
                <option value="Vocal Boom"></option>
                <option value="Diapason"></option>
              </datalist>
              <label data-package-count-field><span>Numero incontri</span><input type="number" name="incontri_totali" min="1" max="100" value="4" required></label>
              <p class="studio-helper" data-reset-package-hint hidden>Reset Vocale dura 7 giorni: il totale è impostato automaticamente.</p>
              <button class="primary-button" type="submit">Crea percorso</button>
              <p class="studio-status" data-studio-status role="status"></p>
            </form>
          </details>
        </section>`}

        <section class="studio-section">
          <p class="content-kicker"><span>${diapason ? "Registro presenze" : "Storico"}</span></p>
          <h2>${diapason ? "Incontri." : "Lezioni."}</h2>
          <button class="primary-button" type="button" data-studio-new-lesson="${student.id}">＋ Nuova lezione</button>
          <div class="lesson-history">
            ${diapason ? schoolLessonCards(lessons) : lessons.map(lesson => `
              <div class="studio-data-row">
                <time>${escapeHTML(formatDate(lesson.data_ora))}</time>
                <span>
                  <strong>${escapeHTML(lesson.focus || "Lezione")}</strong>
                  <small>${escapeHTML(lesson.stato)} · ${lesson.durata_minuti} min${lesson.visible_to_student ? " · condivisa" : ""}</small>
                </span>
                <span class="studio-link-cluster">
                  ${safeUrl(lesson.recording_url) ? `<a href="${escapeHTML(safeUrl(lesson.recording_url))}" target="_blank" rel="noopener noreferrer">Video ↗</a>` : ""}
                  ${safeUrl(lesson.transcript_url) ? `<a href="${escapeHTML(safeUrl(lesson.transcript_url))}" target="_blank" rel="noopener noreferrer">Testo ↗</a>` : ""}
                </span>
              </div>
            `).join("") || '<div class="studio-empty"><p>Ancora nessuna lezione registrata.</p></div>'}
          </div>
        </section>
      </section>`;
  };

  const lessonFormMarkup = async () => {
    const [{ data: students, error }, { data: packages }] = await Promise.all([
      client.from("students").select("id,nome,cognome,tipo_studio").eq("attivo", true).order("nome"),
      client.from("packages").select("id,student_id,nome_percorso,incontri_totali,incontri_usati,stato").eq("stato", "attivo")
    ]);
    if (error) throw error;

    const selectedId = getSelectedStudentId() || students?.[0]?.id || "";
    const diapason = isDiapason((students || []).find(student => student.id === selectedId));
    return `
      <section class="page studio-page" aria-labelledby="lesson-form-title">
        <header class="studio-compact-header">
          <button class="back-button" type="button" data-route="studio"><span aria-hidden="true">←</span> Studio</button>
          <p class="eyebrow">Studio · Lezione</p>
          <h1 id="lesson-form-title">Nuova lezione.</h1>
          <p>Salvataggio reale nel database.</p>
        </header>

        <form class="studio-form" data-studio-lesson-form data-diapason="${diapason}">
          <label><span>Allievo</span>
            <select name="student_id" required>
              <option value="">Scegli…</option>
              ${(students || []).map(student => `<option value="${student.id}" data-school="${isDiapason(student)}" ${student.id === selectedId ? "selected" : ""}>${escapeHTML([student.nome, student.cognome].filter(Boolean).join(" "))}</option>`).join("")}
            </select>
          </label>
          <label data-private-lesson-field><span>Percorso</span>
            <select name="package_id">
              <option value="">Nessuno / singola lezione</option>
              ${(packages || []).map((pkg, index) => `<option value="${pkg.id}" data-student="${pkg.student_id}" ${pkg.student_id !== selectedId ? "hidden disabled" : ""} ${pkg.student_id === selectedId && !(packages || []).slice(0, index).some(previous => previous.student_id === selectedId) ? "selected" : ""}>${escapeHTML(pkg.nome_percorso)} · ${pkg.incontri_usati}/${pkg.incontri_totali}</option>`).join("")}
            </select>
          </label>
          <div class="studio-form-row">
            <label><span>Data e ora</span><input type="datetime-local" name="data_ora" value="${toDatetimeLocal(new Date())}" required></label>
            <label><span>Durata</span><select name="durata_minuti"><option value="60" ${!diapason ? "selected" : ""}>60 min</option><option value="45">45 min</option><option value="50" ${diapason ? "selected" : ""}>50 min</option><option value="30">30 min</option></select></label>
          </div>
          <label><span>Stato</span><select name="stato"><option value="presente">Presente</option><option value="assente">Assente</option><option value="recupero">Recupero</option><option value="annullata">Annullata</option></select></label>
          <label data-private-lesson-field><span>Focus / argomenti</span><input name="focus" placeholder="Es. ritmo, articolazione, dinamiche"></label>
          <label class="private-field" data-private-lesson-field><span>Note private · solo docente</span><textarea name="note_private" rows="4" placeholder="Queste note sono in una tabella separata e non sono leggibili dall’allievo."></textarea></label>
          <label><span data-shared-note-label>${diapason ? "Note per l’allievo" : "Riepilogo per l’allievo"}</span><textarea name="riepilogo_allievo" rows="6" placeholder="${diapason ? "Argomenti, suggerimenti, cose da provare e link: scrivi tutto qui." : "Che cosa abbiamo esplorato oggi?"}"></textarea></label>
          <label data-private-lesson-field><span>Da fare / esercizi</span><textarea name="esercizi" rows="3" placeholder="Indicazioni per il prossimo incontro."></textarea></label>
          <label data-private-lesson-field><span>Registrazione Drive</span><input type="url" name="recording_url" placeholder="https://drive.google.com/..."></label>
          <label data-private-lesson-field><span>Trascrizione</span><input type="url" name="transcript_url" placeholder="https://drive.google.com/..."></label>
          <label data-private-lesson-field><span>Materiali</span><input type="url" name="materials_url" placeholder="https://drive.google.com/..."></label>
          <label class="studio-check"><input type="checkbox" name="visible_to_student" checked><span>Rendi visibile il riepilogo all’allievo</span></label>
          <button class="primary-button" type="submit">Salva lezione</button>
          <p class="studio-status" data-studio-status role="status"></p>
        </form>
      </section>`;
  };

  const diapasonStudentMarkup = (student, lessons, previewStudents) => `
    <section class="page student-path-page" aria-labelledby="path-title">
      <header class="student-path-hero">
        <button class="back-button" type="button" data-route="${profile?.role === "admin" ? "studio-allievo" : "home"}"><span aria-hidden="true">←</span> Indietro</button>
        ${profile?.role === "admin" ? `<div class="student-preview-picker">
          <label for="studio-preview-student">Scegli allievo</label>
          <select id="studio-preview-student" data-studio-preview-student>${previewStudents.map(item => `<option value="${item.id}" ${item.id === student.id ? "selected" : ""}>${escapeHTML([item.nome, item.cognome].filter(Boolean).join(" "))}</option>`).join("")}</select>
        </div>` : '<button class="student-signout" type="button" data-studio-signout>Esci</button>'}
        <p class="eyebrow">Studio · Diapason</p>
        <h1 id="path-title">Le mie<br>lezioni.</h1>
        <p class="student-path-intro">Ciao ${escapeHTML(student.nome)}. Qui trovi le presenze e le note dei nostri incontri.</p>
      </header>
      <section class="path-stack">
        <article class="path-card"><small>Percorso</small><strong>Diapason</strong><p>Canto</p></article>
        <article class="path-card school-schedule"><small>Orario settimanale</small><strong>${escapeHTML(schoolSchedule(student))}</strong></article>
      </section>
      <section class="studio-section">
        <p class="content-kicker"><span>Registro presenze</span></p>
        <h2>I nostri incontri.</h2>
        <p class="studio-helper">Apri un incontro per ritrovare le note, i suggerimenti e i link.</p>
        <div class="student-lesson-history">${schoolLessonCards(lessons)}</div>
      </section>
    </section>`;

  const studentPathMarkup = async () => {
    let studentId = profile?.student_id || "";
    let previewStudents = [];

    if (profile?.role === "admin") {
      const { data, error } = await client
        .from("students")
        .select("id,nome,cognome,attivo")
        .order("nome", { ascending: true })
        .order("cognome", { ascending: true });
      if (error) throw error;

      previewStudents = data || [];
      studentId = getSelectedStudentId();

      if (!studentId && previewStudents[0]?.id) {
        studentId = previewStudents[0].id;
        setSelectedStudentId(studentId);
      }
    }

    if (!studentId) return `
      <section class="page student-path-page">
        <header class="student-path-hero">
          <button class="back-button" type="button" data-route="${profile?.role === "admin" ? "studio" : "home"}"><span aria-hidden="true">←</span> Indietro</button>
          <p class="eyebrow">Il mio percorso</p>
          <h1>Non è ancora<br>collegato.</h1>
          <p class="student-path-intro">${profile?.role === "admin" ? "Non ci sono ancora allievi da visualizzare." : "Il tuo account è attivo, ma non è ancora associato a una scheda allievo."}</p>
        </header>
      </section>`;

    const [studentRes, packageRes, lessonsRes] = await Promise.all([
      client.from("students").select("id,nome,cognome,tipo_studio,giorno_lezione,ora_lezione").eq("id", studentId).single(),
      client.from("packages").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(20),
      client.from("lessons").select("*").eq("student_id", studentId).eq("visible_to_student", true).order("data_ora", { ascending: false })
    ]);
    if (studentRes.error) throw studentRes.error;

    const student = studentRes.data;
    if (packageRes.error) throw packageRes.error;
    if (lessonsRes.error) throw lessonsRes.error;
    if (isDiapason(student)) return diapasonStudentMarkup(student, lessonsRes.data || [], previewStudents);
    const packages = packageRes.data || [];
    const activePackages = packages.filter(item => item.stato === "attivo");
    const displayPackages = activePackages.length ? activePackages : packages.slice(0, 1);
    const lessons = lessonsRes.data || [];
    const latest = lessons[0];
    const resetPackage = packages.find(item => isResetPackage(item) && item.stato === "attivo")
      || packages.find(item => isResetPackage(item) && item.stato === "completato");
    // Un Reset completato resta riascoltabile anche se un altro percorso è attivo.
    if (resetPackage && !displayPackages.some(pkg => pkg.id === resetPackage.id)) {
      displayPackages.push(resetPackage);
    }
    if (displayPackages.length === 1 && displayPackages[0].id === resetPackage?.id) {
      return resetStudentMarkup(student, resetPackage, previewStudents);
    }

    const resetSections = await Promise.all(displayPackages
      .filter(pkg => isResetPackage(pkg) && ["attivo", "completato"].includes(pkg.stato))
      .map(async pkg => resetUnlockedDay(pkg) ? `
        <section class="studio-section" aria-label="Giorni di Reset Vocale">
          <p class="content-kicker"><span>Reset Vocale</span></p>
          <h2>I tuoi giorni.</h2>
          ${await resetDaysMarkup(pkg)}
        </section>` : ""));

    const linkButton = (url, label) => {
      const safe = safeUrl(url);
      return safe ? `<a class="path-link-button" href="${escapeHTML(safe)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : "";
    };

    return `
      <section class="page student-path-page" aria-labelledby="path-title">
        <header class="student-path-hero">
          <button class="back-button" type="button" data-route="${profile?.role === "admin" ? "studio-allievo" : "home"}"><span aria-hidden="true">←</span> Indietro</button>
          ${profile?.role === "admin" ? `
            <div class="student-preview-picker">
              <label for="studio-preview-student">Scegli allievo</label>
              <select id="studio-preview-student" data-studio-preview-student aria-label="Scegli quale vista allievo visualizzare">
                ${previewStudents.map(item => `
                  <option value="${item.id}" ${item.id === studentId ? "selected" : ""}>
                    ${escapeHTML([item.nome, item.cognome].filter(Boolean).join(" "))}${item.attivo ? "" : " · in pausa"}
                  </option>
                `).join("")}
              </select>
              <small>Stai visualizzando: <strong>${escapeHTML([student.nome, student.cognome].filter(Boolean).join(" "))}</strong></small>
            </div>
          ` : '<button class="student-signout" type="button" data-studio-signout>Esci</button>'}
          <p class="eyebrow">Il tuo spazio in Opificio Vocale</p>
          <h1 id="path-title">${displayPackages.length > 1 ? "I miei<br>percorsi." : "Il mio<br>percorso."}</h1>
          <p class="student-path-intro">Ciao ${escapeHTML(student.nome)}. Qui ritrovi ciò che Riccardo ha scelto di condividere con te.</p>

        </header>

        <section class="path-stack">
          ${displayPackages.length ? displayPackages.map(pkg => isResetPackage(pkg) && ["attivo", "completato"].includes(pkg.stato) ? resetProgressMarkup(pkg) : `
            <article class="path-card">
              <small>${pkg.stato === "completato" ? "Percorso completato" : pkg.stato === "sospeso" ? "Percorso in pausa" : "Percorso attivo"}</small>
              <strong>${escapeHTML(pkg.nome_percorso || "Percorso individuale")}</strong>
              <p>${pkg.stato === "completato"
                ? `${pkg.incontri_usati} di ${pkg.incontri_totali} ${packageUnit(pkg)} · percorso completato`
                : `${pkg.incontri_usati} di ${pkg.incontri_totali} ${packageUnit(pkg)} completati · ${Math.max(0, pkg.incontri_totali - pkg.incontri_usati)} rimanenti`}</p>
            </article>
          `).join("") : `
            <article class="path-card">
              <small>Percorso</small>
              <strong>Nessun percorso associato.</strong>
              <p>Quando Riccardo attiverà un percorso, comparirà qui.</p>
            </article>
          `}

          <article class="path-card payment-card">
            <small>Pagamenti</small>
            <strong>IBAN</strong>
            <p class="iban-value">IT05 Z036 6901 6001 6202 7305 710</p>
            <div class="payment-meta">
              <p><b>Intestatario:</b> Riccardo Primitivo</p>
              <p><b>Causale:</b> Opificio Vocale + nome del tuo percorso</p>
            </div>
            <button class="iban-copy-button" type="button" data-copy-iban data-iban="IT05 Z036 6901 6001 6202 7305 710">Copia IBAN</button>
          </article>

          ${latest ? `
            <article class="path-card">
              <small>Ultima lezione · ${escapeHTML(formatDate(latest.data_ora))}</small>
              <strong>${escapeHTML(latest.focus || "Ultima lezione")}</strong>
              <p>${escapeHTML(latest.riepilogo_allievo || "Riepilogo non inserito.")}</p>
              ${latest.esercizi ? `<p class="path-task"><b>Da fare:</b> ${escapeHTML(latest.esercizi)}</p>` : ""}
              <div class="path-links">
                ${linkButton(latest.recording_url, "▶ Rivedi lezione")}
                ${linkButton(latest.transcript_url, "▤ Trascrizione")}
                ${linkButton(latest.materials_url, "＋ Materiali")}
              </div>
            </article>` : `
            <article class="path-card">
              <small>Lezioni</small><strong>Ancora nessun riepilogo.</strong>
              <p>Quando una lezione verrà condivisa, comparirà qui.</p>
            </article>`}
        </section>

        ${resetSections.join("")}

        <section class="studio-section">
          <p class="content-kicker"><span>Storico</span></p>
          <h2>Lezioni precedenti.</h2>
          <p class="studio-helper">Apri una lezione per ritrovare riepilogo, esercizi e materiali condivisi.</p>
          <div class="student-lesson-history">
            ${lessons.slice(1).map(lesson => `
              <details class="student-lesson-item">
                <summary>
                  <time>${escapeHTML(formatDate(lesson.data_ora))}</time>
                  <span class="student-lesson-heading">
                    <strong>${escapeHTML(lesson.focus || "Lezione")}</strong>
                    <small>${lesson.durata_minuti ? `${lesson.durata_minuti} min` : "Lezione"}</small>
                  </span>
                  <span class="student-lesson-toggle" aria-hidden="true">＋</span>
                </summary>
                <div class="student-lesson-body">
                  <p>${escapeHTML(lesson.riepilogo_allievo || "Riepilogo non inserito.")}</p>
                  ${lesson.esercizi ? `<p class="path-task"><b>Da fare:</b> ${escapeHTML(lesson.esercizi)}</p>` : ""}
                  <div class="path-links">
                    ${linkButton(lesson.recording_url, "▶ Rivedi lezione")}
                    ${linkButton(lesson.transcript_url, "▤ Trascrizione")}
                    ${linkButton(lesson.materials_url, "＋ Materiali")}
                  </div>
                </div>
              </details>
            `).join("") || '<div class="studio-empty"><p>Non ci sono ancora lezioni precedenti condivise.</p></div>'}
          </div>
        </section>
      </section>`;
  };


  const resetStartDate = pkg => pkg.data_inizio || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(pkg.created_at));

  const resetUnlockedDay = pkg => {
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const elapsed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${resetStartDate(pkg)}T00:00:00Z`)) / 86400000);
    return Math.max(0, Math.min(7, elapsed + 1));
  };

  const getResetAudio = async (maxDay = 7) => {
    const { data, error } = await client.from("reset_audio").select("*").lte("day", maxDay).order("day");
    if (error) throw error;
    return data || [];
  };

  const resetAudioMarkup = async (audio, day) => {
    if (!audio) return '<p class="reset-audio-pending">Audio in preparazione.</p>';
    const { data, error } = await client.storage.from(RESET_BUCKET).createSignedUrl(audio.storage_path, 3600);
    const url = safeUrl(data?.signedUrl);
    if (error || !url) return '<p class="reset-audio-pending">Audio temporaneamente non disponibile. Riapri il percorso per riprovare.</p>';
    return `<div class="reset-player-wrap"><span class="reset-player-label">Ascolta il Giorno ${day}</span>
      <audio class="reset-player" data-reset-player controls preload="none" aria-label="Ascolta il Giorno ${day}" src="${escapeHTML(url)}"></audio>
    </div>`;
  };

  const resetAudioAdminMarkup = async () => {
    const audios = await getResetAudio();
    const cards = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
      const day = index + 1;
      const audio = audios.find(item => item.day === day);
      return `<article class="path-card reset-upload-card" data-reset-card="${day}">
        <small>Giorno ${day}</small><h2>${escapeHTML(audio?.title || `Giorno ${day}`)}</h2>
        ${audio ? `<p class="reset-file-name">${escapeHTML(audio.file_name)} · ${(audio.size_bytes / 1000000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB</p>${await resetAudioMarkup(audio, day)}` : '<p class="reset-audio-pending">Nessun audio caricato.</p>'}
        <form class="studio-form reset-upload-form" data-reset-upload="${day}" data-reset-old-path="${escapeHTML(audio?.storage_path || "")}">
          <label><span>Titolo</span><input name="title" maxlength="160" value="${escapeHTML(audio?.title || `Giorno ${day}`)}" required></label>
          <label><span>MP3 del Giorno ${day}</span><input type="file" name="audio" accept=".mp3,audio/mpeg,audio/mp3" required></label>
          <button class="primary-button" type="submit">${audio ? "Sostituisci audio" : "Carica audio"}</button>
          <p class="studio-status" data-reset-upload-status role="status" aria-live="polite"></p>
        </form>
      </article>`;
    }));
    return `<section class="page studio-page reset-upload-page" aria-labelledby="reset-upload-title">
      <header class="studio-compact-header">
        <button class="back-button" type="button" data-route="studio"><span aria-hidden="true">←</span> Studio</button>
        <p class="eyebrow">Studio · Reset Vocale</p><h1 id="reset-upload-title">Audio Reset.</h1>
        <p>Scegli il giorno, seleziona il suo MP3 e premi Carica audio. Ogni file è condiviso con tutte le persone iscritte al percorso.</p>
        <p class="studio-helper">MP3 fino a 25 MB. Per l’allievo si sblocca un giorno alla volta, dalla data di inizio del suo Reset.</p>
        <button class="studio-text-button" type="button" data-route="reset-demo">Apri Test Reset →</button>
      </header><section class="reset-upload-grid">${cards.join("")}</section>
    </section>`;
  };

  const resetProgressMarkup = pkg => {
    const day = resetUnlockedDay(pkg);
    return `<article class="path-card reset-progress-card"><small>Reset Vocale${pkg.stato === "completato" ? " · Percorso completato" : ""}</small>
      <strong>${day ? `Giorno ${day} di 7` : "Ci siamo quasi."}</strong>
      <p>${day ? "I giorni già sbloccati restano disponibili per riascoltarli." : `Il percorso inizia il ${escapeHTML(formatDate(resetStartDate(pkg)))}.`}</p>
      <div class="reset-progress-track" aria-label="${day} giorni sbloccati su 7"><span style="width:${Math.round(day / 7 * 100)}%"></span></div>
    </article>`;
  };

  const resetDaysMarkup = async pkg => {
    const day = resetUnlockedDay(pkg);
    if (!day) return "";
    let audios;
    try {
      audios = await getResetAudio(day);
    } catch {
      return '<article class="path-card"><small>Reset Vocale</small><p class="reset-audio-pending">Audio temporaneamente non disponibili. Riapri il percorso per riprovare.</p></article>';
    }
    const cards = await Promise.all(Array.from({ length: day }, async (_, index) => {
      const number = day - index;
      const audio = audios.find(item => item.day === number);
      return `<article class="path-card reset-day-card ${number === day ? "is-current" : "is-past"}">
        <small>${number === day ? "Oggi · " : ""}Giorno ${number}</small>
        <strong>${escapeHTML(audio?.title || `Giorno ${number}`)}</strong>${await resetAudioMarkup(audio, number)}
      </article>`;
    }));
    return cards.join("");
  };

  const resetStudentMarkup = async (student, pkg, previewStudents) => {
    const cards = await resetDaysMarkup(pkg);
    return `<section class="page student-path-page reset-student-page" aria-labelledby="reset-path-title">
      <header class="student-path-hero">
        <button class="back-button" type="button" data-route="${profile?.role === "admin" ? "studio" : "home"}"><span aria-hidden="true">←</span> Indietro</button>
        ${profile?.role === "admin" ? `<div class="student-preview-picker"><label for="studio-preview-student">Scegli allievo</label><select id="studio-preview-student" data-studio-preview-student>${previewStudents.map(item => `<option value="${item.id}" ${item.id === student.id ? "selected" : ""}>${escapeHTML([item.nome, item.cognome].filter(Boolean).join(" "))}</option>`).join("")}</select></div>` : '<button class="student-signout" type="button" data-studio-signout>Esci</button>'}
        <p class="eyebrow">Il tuo spazio in Opificio Vocale</p><h1 id="reset-path-title">Il tuo<br>Reset.</h1>
        <p class="student-path-intro">Ciao ${escapeHTML(student.nome)}. Un giorno alla volta, con la tua voce.</p>
      </header><section class="path-stack">
        ${resetProgressMarkup(pkg)}${cards}
      </section></section>`;
  };

  // Anteprima docente: simula il giorno e ascolta gli audio caricati.
  const resetDemoMarkup = async () => {
    if (profile?.role !== "admin") return errorMarkup("Questa anteprima è riservata al docente.");

    const days = Array.from({ length: 7 });

    const params = new URLSearchParams((location.hash.split("?")[1] || ""));
    const requestedDay = Number(params.get("day")) || 1;
    const day = Math.min(7, Math.max(1, requestedDay));
    const progress = Math.round((day / 7) * 100);
    const audios = await getResetAudio(day);
    const players = await Promise.all(Array.from({ length: day }, async (_, index) => resetAudioMarkup(audios.find(item => item.day === index + 1), index + 1)));

    return `
      <section class="page studio-page reset-demo-page" aria-labelledby="reset-demo-title">
        <header class="studio-compact-header">
          <button class="back-button" type="button" data-route="studio"><span aria-hidden="true">←</span> Studio</button>
          <p class="eyebrow">Studio · Anteprima privata</p>
          <h1 id="reset-demo-title">Test Reset.</h1>
          <p>Questa schermata serve solo a te: simula ciò che vedrebbe una persona iscritta a Reset Vocale.</p>
          <button class="studio-text-button" type="button" data-route="studio-reset">Carica gli audio →</button>

          <div class="reset-demo-controls" aria-label="Simula giorno del percorso">
            <small>Simula il giorno</small>
            <div class="reset-demo-switch">
              ${days.map((_, index) => `<a href="#reset-demo?day=${index + 1}" aria-current="${day === index + 1 ? "true" : "false"}">${index + 1}</a>`).join("")}
            </div>
          </div>
        </header>

        <section class="reset-student-preview" aria-label="Anteprima lato allievo">
          <div class="reset-preview-label">Da qui in giù · vista allievo</div>

          <article class="path-card reset-progress-card">
            <small>Percorso attivo</small>
            <strong>Reset Vocale</strong>
            <p>Giorno ${day} di 7</p>
            <div class="reset-progress-track" aria-label="${progress}% del percorso sbloccato">
              <span style="width:${progress}%"></span>
            </div>
          </article>

          <article class="path-card reset-day-card is-current">
            <small>Oggi · Giorno ${day}</small>
            <strong>${escapeHTML(audios.find(item => item.day === day)?.title || `Giorno ${day}`)}</strong>
            ${players[day - 1]}
          </article>

          ${day > 1 ? `
            <section class="reset-available" aria-labelledby="reset-available-title">
              <p class="content-kicker"><span>Già disponibili</span></p>
              <h2 id="reset-available-title">I giorni precedenti.</h2>
              <div class="reset-previous-list">
                ${days.slice(0, day - 1).map((item, index) => `
                  <article class="path-card reset-day-card is-past">
                    <small>Giorno ${index + 1}</small>
                    <strong>${escapeHTML(audios.find(audio => audio.day === index + 1)?.title || `Giorno ${index + 1}`)}</strong>
                    ${players[index]}
                  </article>
                `).join("")}
              </div>
            </section>
          ` : ""}

          <p class="reset-demo-note">I giorni futuri non compaiono. Per ogni allievo vengono sbloccati automaticamente dalla data di inizio del percorso.</p>
        </section>
      </section>`;
  };

  const renderStudio = async () => {
    if (!isStudioRoute()) return;
    if (uploadingReset) return;
    if (loading) { app.innerHTML = loadingMarkup(); return; }
    loading = true;
    app.innerHTML = loadingMarkup();

    try {
      if (!session) {
        app.innerHTML = authMarkup();
        return;
      }

      if (!profile) {
        const { data, error } = await client.from("profiles")
          .select("id,email,role,student_id")
          .eq("id", session.user.id)
          .single();
        if (error) throw error;
        profile = data;
      }

      const route = currentRoute();

      if (profile.role !== "admin" && route !== "percorso") {
        if (location.hash !== "#percorso") {
          location.hash = "percorso";
          return;
        }
      }

      if (route === "studio") app.innerHTML = await adminHomeMarkup();
      else if (route === "studio-allievi") app.innerHTML = await studentsMarkup();
      else if (route === "studio-allievo") app.innerHTML = await studentDetailMarkup(getSelectedStudentId());
      else if (route === "studio-lezione") app.innerHTML = await lessonFormMarkup();
      else if (route === "percorso") app.innerHTML = await studentPathMarkup();
      else if (route === "reset-demo") app.innerHTML = await resetDemoMarkup();
      else if (route === "studio-reset") app.innerHTML = await resetAudioAdminMarkup();
    } catch (error) {
      lastError = error?.message || "Errore inatteso.";
      app.innerHTML = errorMarkup(lastError);
    } finally {
      loading = false;
    }
  };

  const init = async () => {
    const { data: { session: initialSession } } = await client.auth.getSession();
    session = initialSession;
    if (session) {
      const { data } = await client.from("profiles").select("id,email,role,student_id").eq("id", session.user.id).maybeSingle();
      profile = data || null;
    }
    if (isStudioRoute()) renderStudio();
  };

  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    if (!nextSession) profile = null;
    window.setTimeout(() => {
      if (isStudioRoute()) renderStudio();
    }, 0);
  });

  window.addEventListener("hashchange", () => {
    if (isStudioRoute()) window.setTimeout(renderStudio, 0);
  });

  document.addEventListener("click", async event => {
    const copyIban = event.target.closest("[data-copy-iban]");
    if (copyIban) {
      const originalLabel = copyIban.textContent;
      try {
        await copyText(copyIban.dataset.iban || "");
        copyIban.textContent = "Copiato ✓";
        window.setTimeout(() => { copyIban.textContent = originalLabel; }, 1800);
      } catch {
        copyIban.textContent = "Copia non riuscita";
        window.setTimeout(() => { copyIban.textContent = originalLabel; }, 2200);
      }
      return;
    }

    const copyInvite = event.target.closest("[data-copy-student-invite]");
    if (copyInvite) {
      const status = document.querySelector("[data-copy-invite-status]");
      const originalLabel = copyInvite.textContent;
      try {
        await copyText(studentInviteText({
          nome: copyInvite.dataset.studentName || "!",
          email: copyInvite.dataset.studentEmail || ""
        }));
        copyInvite.textContent = "Copiato ✓";
        if (status) {
          status.textContent = "Invito copiato. Puoi incollarlo su WhatsApp, Messaggi o email.";
          status.dataset.tone = "success";
        }
        window.setTimeout(() => { copyInvite.textContent = originalLabel; }, 1800);
      } catch {
        if (status) {
          status.textContent = "Non riesco a copiarlo automaticamente su questo dispositivo.";
          status.dataset.tone = "error";
        }
      }
      return;
    }

    const studentButton = event.target.closest("[data-studio-student]");
    if (studentButton) {
      event.preventDefault();
      setSelectedStudentId(studentButton.dataset.studioStudent);
      location.hash = "studio-allievo";
      return;
    }

    const newLesson = event.target.closest("[data-studio-new-lesson]");
    if (newLesson) {
      setSelectedStudentId(newLesson.dataset.studioNewLesson);
      location.hash = "studio-lezione";
      return;
    }

    if (event.target.closest("[data-studio-signout]")) {
      await client.auth.signOut();
      session = null;
      profile = null;
      clearLoginEmail();
      location.hash = "home";
      return;
    }

    if (event.target.closest("[data-studio-reset-login]")) {
      clearLoginEmail();
      renderStudio();
      return;
    }

    if (event.target.closest("[data-studio-retry]")) {
      lastError = "";
      renderStudio();
    }
  }, true);


  document.addEventListener("input", event => {
    const packageName = event.target.closest('[data-studio-package-form] input[name="nome_percorso"]');
    if (!packageName) return;
    const form = packageName.closest("[data-studio-package-form]");
    const countField = form.querySelector("[data-package-count-field]");
    const hint = form.querySelector("[data-reset-package-hint]");
    const countInput = form.elements.incontri_totali;
    const reset = isResetPackage(packageName.value);
    const diapason = isDiapasonName(packageName.value);
    const fixed = reset || diapason;
    if (countField) {
      countField.hidden = fixed;
      countField.style.display = fixed ? "none" : "";
    }
    if (hint) {
      hint.hidden = !fixed;
      hint.style.display = fixed ? "" : "none";
      hint.textContent = diapason ? "Diapason usa il registro presenze. Potrai impostare giorno e ora in Dati allievo." : "Reset Vocale dura 7 giorni: il totale è impostato automaticamente.";
    }
    countInput.required = !fixed;
    countInput.disabled = fixed;
    if (reset) countInput.value = 7;
  }, true);

  document.addEventListener("change", event => {
    const previewSelect = event.target.closest("[data-studio-preview-student]");
    if (previewSelect) {
      setSelectedStudentId(previewSelect.value);
      renderStudio();
      return;
    }

    const schoolConfig = event.target.closest("[data-studio-student-form], [data-edit-student]");
    if (schoolConfig && ["tipo_studio", "giorno_lezione", "ora_lezione"].includes(event.target.name)) {
      syncSchoolConfig(schoolConfig);
      return;
    }

    const studentSelect = event.target.closest('[data-studio-lesson-form] select[name="student_id"]');
    if (!studentSelect) return;
    const form = studentSelect.closest("[data-studio-lesson-form]");
    const packageSelect = form.elements.package_id;
    const studentId = studentSelect.value;
    const diapason = studentSelect.selectedOptions[0]?.dataset.school === "true";
    form.dataset.diapason = String(diapason);
    form.querySelector("[data-shared-note-label]").textContent = diapason ? "Note per l’allievo" : "Riepilogo per l’allievo";
    form.elements.riepilogo_allievo.placeholder = diapason ? "Argomenti, suggerimenti, cose da provare e link: scrivi tutto qui." : "Che cosa abbiamo esplorato oggi?";
    form.elements.durata_minuti.value = diapason ? "50" : "60";
    let firstVisible = null;
    [...packageSelect.options].forEach((option, index) => {
      if (index === 0) {
        option.hidden = false;
        option.disabled = false;
        return;
      }
      const visible = option.dataset.student === studentId;
      option.hidden = !visible;
      option.disabled = !visible;
      if (visible && !firstVisible) firstVisible = option;
    });
    packageSelect.value = firstVisible?.value || "";
  });

  document.addEventListener("submit", async event => {
    const resetForm = event.target.closest("[data-reset-upload]");
    if (resetForm) {
      event.preventDefault();
      if (uploadingReset || profile?.role !== "admin") return;
      const day = Number(resetForm.dataset.resetUpload);
      const file = resetForm.elements.audio.files[0];
      const title = resetForm.elements.title.value.trim();
      const status = resetForm.querySelector("[data-reset-upload-status]");
      const buttons = [...document.querySelectorAll("[data-reset-upload] button")];
      const report = (message, tone) => { status.textContent = message; status.dataset.tone = tone || ""; };
      if (!Number.isInteger(day) || day < 1 || day > 7) return;
      if (!file || !/\.mp3$/i.test(file.name) || (file.type && !["audio/mpeg", "audio/mp3", "audio/x-mp3", "audio/mpeg3", "audio/x-mpeg-3", "application/octet-stream"].includes(file.type))) {
        report("Scegli un file MP3.", "error"); return;
      }
      if (!file.size || file.size > RESET_MAX_BYTES) { report("Il file deve contenere audio e non superare 25 MB.", "error"); return; }
      if (!title || title.length > 160) { report("Inserisci un titolo fino a 160 caratteri.", "error"); return; }
      const path = `giorno-${day}/${crypto.randomUUID()}.mp3`;
      const oldPath = resetForm.dataset.resetOldPath;
      let uploaded = false;
      let saved = false;
      uploadingReset = true;
      buttons.forEach(button => { button.disabled = true; });
      report("Caricamento in corso…");
      try {
        const { error: uploadError } = await client.storage.from(RESET_BUCKET).upload(path, file, { contentType: "audio/mpeg", cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        uploaded = true;
        const { error: saveError } = await client.from("reset_audio").upsert({ day, title, storage_path: path, file_name: file.name.slice(0, 240), size_bytes: file.size, updated_at: new Date().toISOString() }, { onConflict: "day" });
        if (saveError) throw saveError;
        saved = true;
        if (oldPath && oldPath !== path) await client.storage.from(RESET_BUCKET).remove([oldPath]);
        uploadingReset = false;
        if (currentRoute() === "studio-reset") {
          await renderStudio();
          const success = document.querySelector(`[data-reset-card="${day}"] [data-reset-upload-status]`);
          if (success) { success.textContent = `Audio del Giorno ${day} caricato.`; success.dataset.tone = "success"; }
        }
      } catch (error) {
        if (uploaded && !saved) {
          try { await client.storage.from(RESET_BUCKET).remove([path]); } catch {}
        }
        report(saved ? "Audio salvato. Riapri Audio Reset per ascoltarlo." : `Caricamento non riuscito: ${error?.message || "riprova."}`, saved ? "success" : "error");
      } finally {
        uploadingReset = false;
        buttons.forEach(button => { button.disabled = false; });
        if (currentRoute() !== "studio-reset" && isStudioRoute()) renderStudio();
      }
      return;
    }

    const loginForm = event.target.closest("[data-studio-login]");
    if (loginForm) {
      event.preventDefault();
      const email = loginForm.elements.email.value.trim().toLowerCase();
      setStatus("Invio il codice…");
      try {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true }
        });
        if (error) throw error;
        localStorage.setItem(LOGIN_EMAIL_KEY, email);
        app.innerHTML = authMarkup();
        setStatus("Codice inviato. Inserisci qui il codice ricevuto via email.", "success");
      } catch (error) {
        const message = error?.code === "over_email_send_rate_limit"
          ? "Hai richiesto troppe email in poco tempo. Non inviarne altre adesso: riprova con un solo codice quando Supabase sblocca l’invio."
          : (error.message || "Non riesco a inviare il codice.");
        setStatus(message, "error");
      }
      return;
    }

    const otpForm = event.target.closest("[data-studio-otp]");
    if (otpForm) {
      event.preventDefault();
      const email = getLoginEmail();
      const token = otpForm.elements.token.value.replace(/\D/g, "").slice(0, 10);
      if (!email || token.length < 6 || token.length > 10) {
        setStatus("Inserisci il codice numerico ricevuto via email.", "error");
        return;
      }
      setStatus("Verifico il codice…");
      try {
        const { data, error } = await client.auth.verifyOtp({
          email,
          token,
          type: "email"
        });
        if (error) throw error;
        session = data.session;
        profile = null;
        clearLoginEmail();
        await renderStudio();
      } catch (error) {
        setStatus(error.message || "Codice non valido o scaduto.", "error");
      }
      return;
    }

    const studentForm = event.target.closest("[data-studio-student-form]");
    if (studentForm) {
      event.preventDefault();
      setStatus("Creo la scheda…");
      const payload = {
        nome: studentForm.elements.nome.value.trim(),
        cognome: studentForm.elements.cognome.value.trim(),
        email: studentForm.elements.email.value.trim().toLowerCase(),
        telefono: studentForm.elements.telefono.value.trim() || null,
        data_nascita: studentForm.elements.data_nascita.value || null,
        ...schoolConfigPayload(studentForm)
      };
      const { data, error } = await client.from("students").insert(payload).select("id").single();
      if (error) { setStatus(error.message, "error"); return; }
      setSelectedStudentId(data.id);
      location.hash = "studio-allievo";
      return;
    }

    const packageForm = event.target.closest("[data-studio-package-form]");
    if (packageForm) {
      event.preventDefault();
      setStatus("Creo il percorso…");
      if (isDiapasonName(packageForm.elements.nome_percorso.value)) {
        const { error } = await client.from("students").update({ tipo_studio: "diapason" }).eq("id", packageForm.elements.student_id.value);
        if (error) { setStatus(error.message, "error"); return; }
        await renderStudio();
        return;
      }
      const payload = {
        student_id: packageForm.elements.student_id.value,
        nome_percorso: packageForm.elements.nome_percorso.value.trim(),
        incontri_totali: isResetPackage(packageForm.elements.nome_percorso.value) ? 7 : Number(packageForm.elements.incontri_totali.value),
        incontri_usati: 0,
        data_inizio: new Date().toISOString().slice(0, 10),
        stato: "attivo"
      };
      const { error } = await client.from("packages").insert(payload);
      if (error) { setStatus(error.message, "error"); return; }
      await renderStudio();
      return;
    }

    const noteForm = event.target.closest("[data-studio-student-note]");
    if (noteForm) {
      event.preventDefault();
      setStatus("Salvo…");
      const { error } = await client.from("student_private_notes").upsert({
        student_id: noteForm.elements.student_id.value,
        note: noteForm.elements.note.value.trim() || null,
        updated_at: new Date().toISOString()
      });
      setStatus(error ? error.message : "Nota privata salvata.", error ? "error" : "success");
      return;
    }

    const lessonForm = event.target.closest("[data-studio-lesson-form]");
    if (lessonForm) {
      event.preventDefault();
      const button = lessonForm.querySelector('button[type="submit"]');
      button.disabled = true;
      setStatus("Salvo la lezione…");

      const diapason = lessonForm.dataset.diapason === "true";
      const packageId = diapason ? null : lessonForm.elements.package_id.value || null;
      const studentId = lessonForm.elements.student_id.value;

      try {
        const { error } = await client.rpc("create_studio_lesson", {
          p_student_id: studentId,
          p_package_id: packageId,
          p_data_ora: new Date(lessonForm.elements.data_ora.value).toISOString(),
          p_durata_minuti: Number(lessonForm.elements.durata_minuti.value),
          p_stato: lessonForm.elements.stato.value,
          p_focus: diapason ? null : lessonForm.elements.focus.value.trim() || null,
          p_note_private: diapason ? null : lessonForm.elements.note_private.value.trim() || null,
          p_riepilogo_allievo: lessonForm.elements.riepilogo_allievo.value.trim() || null,
          p_esercizi: diapason ? null : lessonForm.elements.esercizi.value.trim() || null,
          p_recording_url: diapason ? null : lessonForm.elements.recording_url.value.trim() || null,
          p_transcript_url: diapason ? null : lessonForm.elements.transcript_url.value.trim() || null,
          p_materials_url: diapason ? null : lessonForm.elements.materials_url.value.trim() || null,
          p_visible_to_student: lessonForm.elements.visible_to_student.checked
        });
        if (error) throw error;

        setSelectedStudentId(studentId);
        location.hash = "studio-allievo";
      } catch (error) {
        setStatus(error.message || "Salvataggio non riuscito.", "error");
        button.disabled = false;
      }
    }
  }, true);

  document.addEventListener("play", event => {
    if (!event.target.matches?.("[data-reset-player]")) return;
    document.querySelectorAll("[data-reset-player]").forEach(player => {
      if (player !== event.target) player.pause();
    });
  }, true);

  init();
})();
