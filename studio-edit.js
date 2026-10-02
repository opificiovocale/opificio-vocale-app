(() => {
  "use strict";
  const config = window.OPIFICIO_STUDIO_CONFIG;
  const sdk = window.supabase;
  const app = document.querySelector("#app");
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient || !app) return;

  const client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const key = "opificio-studio-selected-student";
  const esc = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const dt = value => {
    if (!value) return "";
    const d = new Date(value);
    const pad = n => String(n).padStart(2,"0");
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes());
  };
  const selectedStudentId = () => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
  const setMessage = (form, message, error=false) => {
    const el = form.querySelector("[data-edit-status]");
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = error ? "error" : "success";
  };

  async function injectEditor() {
    if ((location.hash || "").split("?")[0] !== "#studio-allievo") return;
    if (document.querySelector("[data-studio-edit-hub]")) return;
    const studentId = selectedStudentId();
    if (!studentId) return;

    const [studentRes, packageRes, lessonRes] = await Promise.all([
      client.from("students").select("*").eq("id", studentId).single(),
      client.from("packages").select("*").eq("student_id", studentId).order("created_at", { ascending:false }),
      client.from("lessons").select("*").eq("student_id", studentId).order("data_ora", { ascending:false }).limit(30)
    ]);
    if (studentRes.error) return;
    const student = studentRes.data;
    const packages = packageRes.data || [];
    const lessons = lessonRes.data || [];

    const section = document.createElement("section");
    section.className = "studio-section studio-edit-hub";
    section.dataset.studioEditHub = "";
    section.innerHTML =
      '<p class="content-kicker"><span>Modifica</span> · Scheda completa</p>' +
      '<h2>Gestisci allievo.</h2>' +
      '<details class="studio-inline-panel" open>' +
        '<summary>Dati allievo</summary>' +
        '<form class="studio-form studio-inline-form" data-edit-student>' +
          '<input type="hidden" name="student_id" value="'+esc(student.id)+'">' +
          '<div class="studio-form-row">' +
            '<label><span>Nome</span><input name="nome" value="'+esc(student.nome)+'" required></label>' +
            '<label><span>Cognome</span><input name="cognome" value="'+esc(student.cognome)+'"></label>' +
          '</div>' +
          '<label><span>Email</span><input type="email" name="email" value="'+esc(student.email)+'" required></label>' +
          '<label><span>Telefono</span><input type="tel" name="telefono" value="'+esc(student.telefono)+'"></label>' +
          '<label class="studio-check"><input type="checkbox" name="attivo" '+(student.attivo ? "checked" : "")+'> <span>Allievo attivo</span></label>' +
          '<button class="primary-button" type="submit">Salva dati allievo</button>' +
          '<p class="studio-status" data-edit-status role="status"></p>' +
        '</form>' +
      '</details>' +
      '<details class="studio-inline-panel">' +
        '<summary>Percorsi · '+packages.length+'</summary>' +
        '<div data-edit-packages></div>' +
      '</details>' +
      '<details class="studio-inline-panel">' +
        '<summary>Lezioni, note e link · '+lessons.length+'</summary>' +
        '<div data-edit-lessons></div>' +
      '</details>';

    const packageBox = section.querySelector("[data-edit-packages]");
    packageBox.innerHTML = packages.length ? packages.map(pkg =>
      '<details class="studio-inline-panel">' +
        '<summary>'+esc(pkg.nome_percorso)+' · '+esc(pkg.incontri_usati)+'/'+esc(pkg.incontri_totali)+' · '+esc(pkg.stato)+'</summary>' +
        '<form class="studio-form studio-inline-form" data-edit-package>' +
          '<input type="hidden" name="package_id" value="'+esc(pkg.id)+'">' +
          '<label><span>Nome percorso</span><input name="nome_percorso" value="'+esc(pkg.nome_percorso)+'" required></label>' +
          '<div class="studio-form-row">' +
            '<label><span>Incontri totali</span><input type="number" min="1" max="100" name="incontri_totali" value="'+esc(pkg.incontri_totali)+'" required></label>' +
            '<label><span>Incontri usati</span><input type="number" min="0" max="100" name="incontri_usati" value="'+esc(pkg.incontri_usati)+'" required></label>' +
          '</div>' +
          '<label><span>Stato</span><select name="stato">' +
            '<option value="attivo" '+(pkg.stato==="attivo"?"selected":"")+'>Attivo</option>' +
            '<option value="completato" '+(pkg.stato==="completato"?"selected":"")+'>Completato</option>' +
            '<option value="sospeso" '+(pkg.stato==="sospeso"?"selected":"")+'>Sospeso</option>' +
          '</select></label>' +
          '<button class="primary-button secondary" type="submit">Salva percorso</button>' +
          '<p class="studio-status" data-edit-status role="status"></p>' +
        '</form>' +
      '</details>'
    ).join("") : '<p class="studio-helper">Nessun percorso ancora inserito.</p>';

    const lessonBox = section.querySelector("[data-edit-lessons]");
    lessonBox.innerHTML = lessons.length ? lessons.map(lesson =>
      '<details class="studio-inline-panel">' +
        '<summary>'+esc(new Intl.DateTimeFormat("it-IT",{day:"numeric",month:"short",year:"numeric"}).format(new Date(lesson.data_ora)))+' · '+esc(lesson.focus || "Lezione")+'</summary>' +
        '<form class="studio-form studio-inline-form" data-edit-lesson>' +
          '<input type="hidden" name="lesson_id" value="'+esc(lesson.id)+'">' +
          '<div class="studio-form-row">' +
            '<label><span>Data e ora</span><input type="datetime-local" name="data_ora" value="'+esc(dt(lesson.data_ora))+'" required></label>' +
            '<label><span>Durata (min)</span><input type="number" name="durata_minuti" min="1" max="300" value="'+esc(lesson.durata_minuti || 60)+'" required></label>' +
          '</div>' +
          '<label><span>Stato</span><select name="stato">' +
            '<option value="presente" '+(lesson.stato==="presente"?"selected":"")+'>Presente</option>' +
            '<option value="assente" '+(lesson.stato==="assente"?"selected":"")+'>Assente</option>' +
            '<option value="recupero" '+(lesson.stato==="recupero"?"selected":"")+'>Recupero</option>' +
            '<option value="annullata" '+(lesson.stato==="annullata"?"selected":"")+'>Annullata</option>' +
          '</select></label>' +
          '<label><span>Focus / argomenti</span><input name="focus" value="'+esc(lesson.focus)+'"></label>' +
          '<label><span>Riepilogo / note per l’allievo</span><textarea rows="4" name="riepilogo_allievo">'+esc(lesson.riepilogo_allievo)+'</textarea></label>' +
          '<label><span>Da fare / esercizi</span><textarea rows="3" name="esercizi">'+esc(lesson.esercizi)+'</textarea></label>' +
          '<label><span>Registrazione Drive</span><input type="url" name="recording_url" value="'+esc(lesson.recording_url)+'"></label>' +
          '<label><span>Trascrizione</span><input type="url" name="transcript_url" value="'+esc(lesson.transcript_url)+'"></label>' +
          '<label><span>Materiali</span><input type="url" name="materials_url" value="'+esc(lesson.materials_url)+'"></label>' +
          '<label class="studio-check"><input type="checkbox" name="visible_to_student" '+(lesson.visible_to_student ? "checked" : "")+'> <span>Visibile all’allievo</span></label>' +
          '<button class="primary-button secondary" type="submit">Salva lezione, note e link</button>' +
          '<p class="studio-status" data-edit-status role="status"></p>' +
        '</form>' +
      '</details>'
    ).join("") : '<p class="studio-helper">Nessuna lezione ancora registrata.</p>';

    const summary = document.querySelector(".studio-summary-grid");
    if (summary) summary.insertAdjacentElement("afterend", section);
  }

  document.addEventListener("submit", async event => {
    const studentForm = event.target.closest("[data-edit-student]");
    const packageForm = event.target.closest("[data-edit-package]");
    const lessonForm = event.target.closest("[data-edit-lesson]");
    if (!studentForm && !packageForm && !lessonForm) return;
    event.preventDefault();

    if (studentForm) {
      setMessage(studentForm, "Salvo…");
      const payload = {
        nome: studentForm.elements.nome.value.trim(),
        cognome: studentForm.elements.cognome.value.trim(),
        email: studentForm.elements.email.value.trim().toLowerCase(),
        telefono: studentForm.elements.telefono.value.trim() || null,
        attivo: studentForm.elements.attivo.checked
      };
      const res = await client.from("students").update(payload).eq("id", studentForm.elements.student_id.value);
      if (res.error) return setMessage(studentForm, res.error.message, true);
      setMessage(studentForm, "Dati allievo aggiornati.");
      window.setTimeout(() => location.reload(), 450);
      return;
    }

    if (packageForm) {
      setMessage(packageForm, "Salvo…");
      const payload = {
        nome_percorso: packageForm.elements.nome_percorso.value.trim(),
        incontri_totali: Number(packageForm.elements.incontri_totali.value),
        incontri_usati: Number(packageForm.elements.incontri_usati.value),
        stato: packageForm.elements.stato.value
      };
      const res = await client.from("packages").update(payload).eq("id", packageForm.elements.package_id.value);
      if (res.error) return setMessage(packageForm, res.error.message, true);
      setMessage(packageForm, "Percorso aggiornato.");
      window.setTimeout(() => location.reload(), 450);
      return;
    }

    if (lessonForm) {
      setMessage(lessonForm, "Salvo…");
      const payload = {
        data_ora: new Date(lessonForm.elements.data_ora.value).toISOString(),
        durata_minuti: Number(lessonForm.elements.durata_minuti.value),
        stato: lessonForm.elements.stato.value,
        focus: lessonForm.elements.focus.value.trim() || null,
        riepilogo_allievo: lessonForm.elements.riepilogo_allievo.value.trim() || null,
        esercizi: lessonForm.elements.esercizi.value.trim() || null,
        recording_url: lessonForm.elements.recording_url.value.trim() || null,
        transcript_url: lessonForm.elements.transcript_url.value.trim() || null,
        materials_url: lessonForm.elements.materials_url.value.trim() || null,
        visible_to_student: lessonForm.elements.visible_to_student.checked
      };
      const res = await client.from("lessons").update(payload).eq("id", lessonForm.elements.lesson_id.value);
      if (res.error) return setMessage(lessonForm, res.error.message, true);
      setMessage(lessonForm, "Lezione, note e link aggiornati.");
      window.setTimeout(() => location.reload(), 450);
    }
  }, true);

  const observer = new MutationObserver(() => { window.clearTimeout(observer._t); observer._t = window.setTimeout(injectEditor, 80); });
  observer.observe(app, { childList:true, subtree:true });
  window.addEventListener("hashchange", () => window.setTimeout(injectEditor, 120));
  window.setTimeout(injectEditor, 250);
})();