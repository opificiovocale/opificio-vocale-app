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

  const refreshStudio = () => {
    document.querySelector("[data-studio-edit-hub]")?.remove();
    window.dispatchEvent(new Event("hashchange"));
  };

  async function injectEditor() {
    if ((location.hash || "").split("?")[0] !== "#studio-allievo") return;
    if (document.querySelector("[data-studio-edit-hub]")) return;
    if (!document.querySelector(".studio-summary-grid")) return;
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
    const lessonNoteMap = new Map();
    if (lessons.length) {
      const { data: lessonNotes } = await client
        .from("lesson_private_notes")
        .select("lesson_id,note")
        .in("lesson_id", lessons.map(lesson => lesson.id));
      (lessonNotes || []).forEach(item => lessonNoteMap.set(item.lesson_id, item.note || ""));
    }

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
          '<label><span>Data di nascita</span><input type="date" name="data_nascita" autocomplete="bday" value="'+esc(student.data_nascita)+'"></label>' +
          '<label class="studio-check"><input type="checkbox" name="attivo" '+(student.attivo ? "checked" : "")+'> <span>Allievo attivo</span></label>' +
          '<button class="primary-button" type="submit">Salva dati allievo</button>' +
          '<p class="studio-status" data-edit-status role="status"></p>' +
        '</form>' +
      '</details>' +
      '<details class="studio-inline-panel">' +
        '<summary>Percorsi · '+packages.length+'</summary>' +
        '<div data-edit-packages></div>' +
      '</details>' +
      '<details class="studio-inline-panel" open>' +
        '<summary>Lezioni, note e link · '+lessons.length+'</summary>' +
        '<div data-edit-lessons></div>' +
      '</details>' +
      '<dialog class="app-dialog studio-delete-dialog" data-lesson-delete-dialog aria-labelledby="studioDeleteLessonTitle">' +
        '<form method="dialog">' +
          '<p class="eyebrow">Studio</p>' +
          '<h2 id="studioDeleteLessonTitle">Eliminare questa lezione?</h2>' +
          '<p data-delete-lesson-label></p>' +
          '<p class="studio-status" data-delete-dialog-status role="status"></p>' +
          '<div class="dialog-actions">' +
            '<button class="primary-button secondary" value="cancel">Annulla</button>' +
            '<button class="studio-delete-confirm" type="button" data-confirm-lesson-delete>Elimina</button>' +
          '</div>' +
        '</form>' +
      '</dialog>';

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
    lessonBox.innerHTML = lessons.length ? lessons.map(lesson => {
      const label = esc(new Intl.DateTimeFormat("it-IT",{day:"numeric",month:"short",year:"numeric"}).format(new Date(lesson.data_ora)));
      const focus = esc(lesson.focus || "Lezione");
      return '<article class="studio-lesson-editor" data-lesson-card data-lesson-id="'+esc(lesson.id)+'">' +
        '<div class="studio-lesson-row">' +
          '<div class="studio-lesson-row-copy">' +
            '<time>'+label+'</time>' +
            '<strong>'+focus+'</strong>' +
            '<small>'+esc(lesson.stato)+' · '+esc(lesson.durata_minuti || 60)+' min'+(lesson.visible_to_student ? ' · condivisa' : '')+'</small>' +
          '</div>' +
          '<div class="studio-row-actions">' +
            '<button class="studio-row-edit" type="button" data-toggle-lesson-edit aria-expanded="false">Modifica</button>' +
            '<button class="studio-row-delete" type="button" data-request-delete-lesson="'+esc(lesson.id)+'" data-lesson-label="'+label+' · '+focus+'">Elimina</button>' +
          '</div>' +
        '</div>' +
        '<form class="studio-form studio-inline-form studio-lesson-edit-form" data-edit-lesson hidden>' +
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
          '<label class="private-field"><span>Note private · solo docente</span><textarea rows="4" name="note_private">'+esc(lessonNoteMap.get(lesson.id) || "")+'</textarea></label>' +
          '<label><span>Riepilogo / note per l’allievo</span><textarea rows="4" name="riepilogo_allievo">'+esc(lesson.riepilogo_allievo)+'</textarea></label>' +
          '<label><span>Da fare / esercizi</span><textarea rows="3" name="esercizi">'+esc(lesson.esercizi)+'</textarea></label>' +
          '<label><span>Registrazione Drive</span><input type="url" name="recording_url" value="'+esc(lesson.recording_url)+'"></label>' +
          '<label><span>Trascrizione</span><input type="url" name="transcript_url" value="'+esc(lesson.transcript_url)+'"></label>' +
          '<label><span>Materiali</span><input type="url" name="materials_url" value="'+esc(lesson.materials_url)+'"></label>' +
          '<label class="studio-check"><input type="checkbox" name="visible_to_student" '+(lesson.visible_to_student ? "checked" : "")+'> <span>Visibile all’allievo</span></label>' +
          '<div class="studio-edit-actions">' +
            '<button class="primary-button" type="submit">Salva modifiche</button>' +
            '<button class="studio-cancel-edit" type="button" data-cancel-lesson-edit>Chiudi</button>' +
          '</div>' +
          '<p class="studio-status" data-edit-status role="status"></p>' +
        '</form>' +
      '</article>';
    }).join("") : '<p class="studio-helper">Nessuna lezione ancora registrata.</p>';

    const summary = document.querySelector(".studio-summary-grid");
    if (summary) summary.insertAdjacentElement("afterend", section);
  }

  document.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-toggle-lesson-edit]");
    if (editButton) {
      const card = editButton.closest("[data-lesson-card]");
      const form = card?.querySelector("[data-edit-lesson]");
      if (!form) return;
      const opening = form.hidden;
      form.hidden = !opening;
      editButton.setAttribute("aria-expanded", String(opening));
      editButton.textContent = opening ? "Chiudi" : "Modifica";
      if (opening) form.querySelector("input, select, textarea")?.focus({ preventScroll: true });
      return;
    }

    const cancelEdit = event.target.closest("[data-cancel-lesson-edit]");
    if (cancelEdit) {
      const card = cancelEdit.closest("[data-lesson-card]");
      const form = card?.querySelector("[data-edit-lesson]");
      const editButton = card?.querySelector("[data-toggle-lesson-edit]");
      if (form) form.hidden = true;
      if (editButton) {
        editButton.setAttribute("aria-expanded", "false");
        editButton.textContent = "Modifica";
      }
      return;
    }

    const requestDelete = event.target.closest("[data-request-delete-lesson]");
    if (requestDelete) {
      const dialog = document.querySelector("[data-lesson-delete-dialog]");
      if (!dialog) return;
      dialog.dataset.lessonId = requestDelete.dataset.requestDeleteLesson;
      dialog.querySelector("[data-delete-lesson-label]").textContent = requestDelete.dataset.lessonLabel || "Lezione selezionata";
      const status = dialog.querySelector("[data-delete-dialog-status]");
      if (status) status.textContent = "La cancellazione è definitiva. Le note private collegate verranno rimosse e il conteggio del percorso sarà aggiornato.";
      dialog.showModal();
      return;
    }

    const confirmDelete = event.target.closest("[data-confirm-lesson-delete]");
    if (confirmDelete) {
      const dialog = confirmDelete.closest("[data-lesson-delete-dialog]");
      const lessonId = dialog?.dataset.lessonId;
      if (!dialog || !lessonId) return;

      confirmDelete.disabled = true;
      const status = dialog.querySelector("[data-delete-dialog-status]");
      if (status) status.textContent = "Elimino la lezione…";

      const { error } = await client.rpc("delete_studio_lesson", { p_lesson_id: lessonId });
      if (error) {
        confirmDelete.disabled = false;
        if (status) {
          status.textContent = error.message || "Non riesco a eliminare la lezione.";
          status.dataset.tone = "error";
        }
        return;
      }

      if (status) {
        status.textContent = "Lezione eliminata.";
        status.dataset.tone = "success";
      }
      dialog.close();
      window.setTimeout(refreshStudio, 180);
    }
  }, true);

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
        data_nascita: studentForm.elements.data_nascita.value || null,
        attivo: studentForm.elements.attivo.checked
      };
      const res = await client.from("students").update(payload).eq("id", studentForm.elements.student_id.value);
      if (res.error) return setMessage(studentForm, res.error.message, true);
      setMessage(studentForm, "Dati allievo aggiornati.");
      window.setTimeout(refreshStudio, 220);
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
      window.setTimeout(refreshStudio, 220);
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
      const { error } = await client.rpc("update_studio_lesson", {
        p_lesson_id: lessonForm.elements.lesson_id.value,
        p_data_ora: payload.data_ora,
        p_durata_minuti: payload.durata_minuti,
        p_stato: payload.stato,
        p_focus: payload.focus,
        p_note_private: lessonForm.elements.note_private.value.trim() || null,
        p_riepilogo_allievo: payload.riepilogo_allievo,
        p_esercizi: payload.esercizi,
        p_recording_url: payload.recording_url,
        p_transcript_url: payload.transcript_url,
        p_materials_url: payload.materials_url,
        p_visible_to_student: payload.visible_to_student
      });
      if (error) return setMessage(lessonForm, error.message, true);
      setMessage(lessonForm, "Lezione, note e link aggiornati.");
      window.setTimeout(refreshStudio, 220);
    }
  }, true);

  const observer = new MutationObserver(() => { window.clearTimeout(observer._t); observer._t = window.setTimeout(injectEditor, 80); });
  observer.observe(app, { childList:true, subtree:true });
  window.addEventListener("hashchange", () => window.setTimeout(injectEditor, 120));
  window.setTimeout(injectEditor, 250);
})();