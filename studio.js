(() => {
  "use strict";

  const config = window.OPIFICIO_STUDIO_CONFIG;
  const sdk = window.supabase;
  const app = document.querySelector("#app");
  const STUDIO_ROUTES = new Set(["studio", "studio-allievi", "studio-allievo", "studio-lezione", "percorso"]);
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
          </div>
        </section>
      </section>`;
  };

  const studentsMarkup = async () => {
    const { data, error } = await client.from("students")
      .select("id,nome,cognome,email,data_nascita,attivo,packages(id,nome_percorso,incontri_totali,incontri_usati,stato)")
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
                    activePackage ? `${activePackage.nome_percorso} · ${activePackage.incontri_usati}/${activePackage.incontri_totali}` : "Nessun percorso attivo",
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
      client.from("lessons").select("*").eq("student_id", studentId).order("data_ora", { ascending: false }).limit(20),
      client.from("student_private_notes").select("note").eq("student_id", studentId).maybeSingle()
    ]);
    if (studentRes.error) throw studentRes.error;

    const student = studentRes.data;
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
          <article class="studio-stat"><small>Percorso</small><strong>${escapeHTML(activePackage?.nome_percorso || "—")}</strong><span>${activePackage ? `${activePackage.incontri_usati} di ${activePackage.incontri_totali}` : "nessuno attivo"}</span></article>
          <article class="studio-stat"><small>Residue</small><strong>${activePackage ? Math.max(0, activePackage.incontri_totali - activePackage.incontri_usati) : "—"}</strong><span>lezioni</span></article>
          <article class="studio-stat"><small>Ultima</small><strong>${latest ? escapeHTML(formatDate(latest.data_ora).split(" ")[0]) : "—"}</strong><span>${latest ? escapeHTML(formatDate(latest.data_ora).split(" ").slice(1).join(" ")) : "nessuna"}</span></article>
        </section>

        <section class="studio-section">
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
                  <span><strong>${escapeHTML(pkg.nome_percorso)}</strong><small>${pkg.incontri_usati}/${pkg.incontri_totali} · ${escapeHTML(pkg.stato)}</small></span>
                </div>
              `).join("")}
            </div>` : ""}
          <details class="studio-inline-panel">
            <summary>＋ Aggiungi percorso</summary>
            <form class="studio-form studio-inline-form" data-studio-package-form>
              <input type="hidden" name="student_id" value="${student.id}">
              <label><span>Nome percorso</span><input name="nome_percorso" required placeholder="Es. Vocal Boom"></label>
              <label><span>Numero incontri</span><input type="number" name="incontri_totali" min="1" max="100" value="4" required></label>
              <button class="primary-button" type="submit">Crea percorso</button>
              <p class="studio-status" data-studio-status role="status"></p>
            </form>
          </details>
        </section>

        <section class="studio-section">
          <p class="content-kicker"><span>Storico</span></p>
          <h2>Lezioni.</h2>
          <button class="primary-button" type="button" data-studio-new-lesson="${student.id}">＋ Nuova lezione</button>
          <div class="lesson-history">
            ${lessons.map(lesson => `
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
      client.from("students").select("id,nome,cognome").eq("attivo", true).order("nome"),
      client.from("packages").select("id,student_id,nome_percorso,incontri_totali,incontri_usati,stato").eq("stato", "attivo")
    ]);
    if (error) throw error;

    const selectedId = getSelectedStudentId() || students?.[0]?.id || "";
    return `
      <section class="page studio-page" aria-labelledby="lesson-form-title">
        <header class="studio-compact-header">
          <button class="back-button" type="button" data-route="studio"><span aria-hidden="true">←</span> Studio</button>
          <p class="eyebrow">Studio · Lezione</p>
          <h1 id="lesson-form-title">Nuova lezione.</h1>
          <p>Salvataggio reale nel database.</p>
        </header>

        <form class="studio-form" data-studio-lesson-form>
          <label><span>Allievo</span>
            <select name="student_id" required>
              <option value="">Scegli…</option>
              ${(students || []).map(student => `<option value="${student.id}" ${student.id === selectedId ? "selected" : ""}>${escapeHTML([student.nome, student.cognome].filter(Boolean).join(" "))}</option>`).join("")}
            </select>
          </label>
          <label><span>Percorso</span>
            <select name="package_id">
              <option value="">Nessuno / singola lezione</option>
              ${(packages || []).map((pkg, index) => `<option value="${pkg.id}" data-student="${pkg.student_id}" ${pkg.student_id !== selectedId ? "hidden disabled" : ""} ${pkg.student_id === selectedId && !(packages || []).slice(0, index).some(previous => previous.student_id === selectedId) ? "selected" : ""}>${escapeHTML(pkg.nome_percorso)} · ${pkg.incontri_usati}/${pkg.incontri_totali}</option>`).join("")}
            </select>
          </label>
          <div class="studio-form-row">
            <label><span>Data e ora</span><input type="datetime-local" name="data_ora" value="${toDatetimeLocal(new Date())}" required></label>
            <label><span>Durata</span><select name="durata_minuti"><option value="60">60 min</option><option value="45">45 min</option><option value="50">50 min</option><option value="30">30 min</option></select></label>
          </div>
          <label><span>Stato</span><select name="stato"><option value="presente">Presente</option><option value="assente">Assente</option><option value="recupero">Recupero</option><option value="annullata">Annullata</option></select></label>
          <label><span>Focus / argomenti</span><input name="focus" placeholder="Es. ritmo, articolazione, dinamiche"></label>
          <label class="private-field"><span>Note private · solo docente</span><textarea name="note_private" rows="4" placeholder="Queste note sono in una tabella separata e non sono leggibili dall’allievo."></textarea></label>
          <label><span>Riepilogo per l’allievo</span><textarea name="riepilogo_allievo" rows="4" placeholder="Che cosa abbiamo esplorato oggi?"></textarea></label>
          <label><span>Da fare / esercizi</span><textarea name="esercizi" rows="3" placeholder="Indicazioni per il prossimo incontro."></textarea></label>
          <label><span>Registrazione Drive</span><input type="url" name="recording_url" placeholder="https://drive.google.com/..."></label>
          <label><span>Trascrizione</span><input type="url" name="transcript_url" placeholder="https://drive.google.com/..."></label>
          <label><span>Materiali</span><input type="url" name="materials_url" placeholder="https://drive.google.com/..."></label>
          <label class="studio-check"><input type="checkbox" name="visible_to_student" checked><span>Rendi visibile il riepilogo all’allievo</span></label>
          <button class="primary-button" type="submit">Salva lezione</button>
          <p class="studio-status" data-studio-status role="status"></p>
        </form>
      </section>`;
  };

  const studentPathMarkup = async () => {
    let studentId = profile?.student_id || "";
    if (profile?.role === "admin") studentId = getSelectedStudentId();

    if (!studentId) return `
      <section class="page student-path-page">
        <header class="student-path-hero">
          <button class="back-button" type="button" data-route="${profile?.role === "admin" ? "studio" : "home"}"><span aria-hidden="true">←</span> Indietro</button>
          <p class="eyebrow">Il mio percorso</p>
          <h1>Non è ancora<br>collegato.</h1>
          <p>${profile?.role === "admin" ? "Scegli prima un allievo dalla sezione Allievi per vedere la sua anteprima." : "Il tuo account è attivo, ma non è ancora associato a una scheda allievo."}</p>
        </header>
      </section>`;

    const [studentRes, packageRes, lessonsRes] = await Promise.all([
      client.from("students").select("id,nome,cognome").eq("id", studentId).single(),
      client.from("packages").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(20),
      client.from("lessons").select("*").eq("student_id", studentId).eq("visible_to_student", true).order("data_ora", { ascending: false }).limit(20)
    ]);
    if (studentRes.error) throw studentRes.error;

    const student = studentRes.data;
    const packages = packageRes.data || [];
    const pkg = packages.find(item => item.stato === "attivo") || packages[0] || null;
    const lessons = lessonsRes.data || [];
    const latest = lessons[0];

    const linkButton = (url, label) => {
      const safe = safeUrl(url);
      return safe ? `<a class="path-link-button" href="${escapeHTML(safe)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : "";
    };

    return `
      <section class="page student-path-page" aria-labelledby="path-title">
        <header class="student-path-hero">
          <button class="back-button" type="button" data-route="${profile?.role === "admin" ? "studio-allievo" : "home"}"><span aria-hidden="true">←</span> Indietro</button>
          <p class="eyebrow">Il tuo spazio in Opificio Vocale</p>
          <h1 id="path-title">Il mio<br>percorso.</h1>
          <p>Ciao ${escapeHTML(student.nome)}. Qui ritrovi ciò che Riccardo ha scelto di condividere con te.</p>
          ${profile?.role !== "admin" ? '<button class="student-signout" type="button" data-studio-signout>Esci</button>' : ""}
        </header>

        <section class="path-stack">
          <article class="path-card">
            <small>${pkg?.stato === "completato" ? "Percorso completato" : pkg?.stato === "sospeso" ? "Percorso in pausa" : "Percorso attivo"}</small>
            <strong>${escapeHTML(pkg?.nome_percorso || "Percorso individuale")}</strong>
            <p>${pkg
              ? (pkg.stato === "completato"
                ? `${pkg.incontri_usati} di ${pkg.incontri_totali} incontri · percorso completato`
                : `${pkg.incontri_usati} di ${pkg.incontri_totali} incontri utilizzati · ${Math.max(0, pkg.incontri_totali - pkg.incontri_usati)} rimanenti`)
              : "Nessun percorso associato."}</p>
          </article>

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

  const renderStudio = async () => {
    if (!isStudioRoute()) return;
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


  document.addEventListener("change", event => {
    const studentSelect = event.target.closest('[data-studio-lesson-form] select[name="student_id"]');
    if (!studentSelect) return;
    const form = studentSelect.closest("[data-studio-lesson-form]");
    const packageSelect = form.elements.package_id;
    const studentId = studentSelect.value;
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
        data_nascita: studentForm.elements.data_nascita.value || null
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
      const payload = {
        student_id: packageForm.elements.student_id.value,
        nome_percorso: packageForm.elements.nome_percorso.value.trim(),
        incontri_totali: Number(packageForm.elements.incontri_totali.value),
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

      const packageId = lessonForm.elements.package_id.value || null;
      const studentId = lessonForm.elements.student_id.value;

      try {
        const { error } = await client.rpc("create_studio_lesson", {
          p_student_id: studentId,
          p_package_id: packageId,
          p_data_ora: new Date(lessonForm.elements.data_ora.value).toISOString(),
          p_durata_minuti: Number(lessonForm.elements.durata_minuti.value),
          p_stato: lessonForm.elements.stato.value,
          p_focus: lessonForm.elements.focus.value.trim() || null,
          p_note_private: lessonForm.elements.note_private.value.trim() || null,
          p_riepilogo_allievo: lessonForm.elements.riepilogo_allievo.value.trim() || null,
          p_esercizi: lessonForm.elements.esercizi.value.trim() || null,
          p_recording_url: lessonForm.elements.recording_url.value.trim() || null,
          p_transcript_url: lessonForm.elements.transcript_url.value.trim() || null,
          p_materials_url: lessonForm.elements.materials_url.value.trim() || null,
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

  init();
})();
