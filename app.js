const LINKS = {
  spotify: "https://open.spotify.com/show/5kI3dR9XNwBgsNVXvQc2Y7?si=bda30684cad04eef",
  spotifyEmbed: "https://open.spotify.com/embed/show/5kI3dR9XNwBgsNVXvQc2Y7?utm_source=generator&theme=0",
  manifesti: "https://opificiovocale.mailerpage.io/manifesti",
  audioteca: "https://buymeacoffee.com/opificiovocale/extras",
  free: "https://audiotecaopificiovocale.subscribepage.io",
  resetCheck: "https://opificiovocale.mailerpage.io/resetcheck",
  vocalBoom: "https://opificiovocale.mailerpage.io/vocalboom",
  vocalHit: "https://opificiovocale.mailerpage.io/vocalhit"
};

const app = document.querySelector("#app");
const navButtons = [...document.querySelectorAll("[data-route]")];

const external = (href, label, subtitle, mark = "↗") => `
  <a class="editorial-link" href="${href}" target="_blank" rel="noopener noreferrer">
    <span><strong>${label}</strong><small>${subtitle}</small></span>
    <span class="arrow" aria-hidden="true">${mark}</span>
  </a>`;

const VOICE_WORDS = [
  "stanca", "tesa", "fragile", "trattenuta", "libera",
  "viva", "curiosa", "presente", "potente", "non lo so"
];

const VOICE_DIARY_KEY = "opificio-voice-diary-v1";

const REFLECTIONS = {
  gentle: {
    title: "Può stare così.",
    copy: "Non c’è nulla da correggere adesso. Possiamo semplicemente darle un po’ di spazio.",
    practice: "Lascia uscire un respiro senza guidarlo. Poi lascia comparire un piccolo «mmm»: non deve essere bello, pieno o lungo. Nota soltanto dove lo senti."
  },
  open: {
    title: "C’è qualcosa da esplorare.",
    copy: "C’è qualcosa da esplorare, senza doverlo trattenere o rendere migliore.",
    practice: "Scegli una frase che dirai oggi. Dilla tre volte: una più lenta, una più ritmica, una lasciandola cambiare da sola. Nota quale possibilità ti incuriosisce."
  },
  unknown: {
    title: "Anche questo è ascolto.",
    copy: "Anche non saperlo è una risposta. Possiamo ascoltarla senza definirla.",
    practice: "Rimani qualche secondo senza produrre suono e nota il corpo. Poi lascia comparire una vocale breve, senza prepararla e senza darle un nome."
  },
  mixed: {
    title: "Può contenere più cose.",
    copy: "La voce non deve avere un solo stato. Possiamo accorgerci di ciò che c’è, senza scegliere una definizione definitiva.",
    practice: "Pronuncia una frase come viene. Poi cambia un solo parametro — ritmo, altezza o volume — e ripetila. Non cercare una versione migliore: nota cosa diventa possibile."
  }
};

const escapeHTML = value => String(value).replace(/[&<>'"]/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  "\"": "&quot;"
}[character]));

function localDayKey(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function loadVoiceDiary() {
  try {
    const diary = JSON.parse(localStorage.getItem(VOICE_DIARY_KEY) || "[]");
    return Array.isArray(diary) ? diary.filter(entry => entry && entry.date) : [];
  } catch {
    return [];
  }
}

function saveVoiceEntry(entry) {
  try {
    const diary = loadVoiceDiary();
    const updated = [entry, ...diary.filter(item => item.date !== entry.date)].slice(0, 90);
    localStorage.setItem(VOICE_DIARY_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

function reflectionType(entry) {
  if (entry.words.includes("non lo so")) return "unknown";
  const gentleWords = ["stanca", "tesa", "fragile", "trattenuta"];
  const openWords = ["libera", "viva", "curiosa", "presente", "potente"];
  const hasGentle = entry.words.some(word => gentleWords.includes(word));
  const hasOpen = entry.words.some(word => openWords.includes(word));
  if (hasGentle && !hasOpen) return "gentle";
  if (hasOpen && !hasGentle) return "open";
  return "mixed";
}

function voiceReflectionMarkup(entry) {
  const type = reflectionType(entry);
  const reflection = REFLECTIONS[type];
  const words = entry.words.length
    ? `<p class="chosen-words">${entry.words.map(escapeHTML).join(" · ")}</p>`
    : "";
  const ownWords = entry.note
    ? `<p class="own-words">“${escapeHTML(entry.note)}”</p>`
    : "";

  return `
    <section class="voice-reflection ${type}" aria-labelledby="reflection-title">
      <p class="content-kicker"><span>Il tuo specchio</span> · Oggi</p>
      <h3 id="reflection-title">${reflection.title}</h3>
      ${words}${ownWords}
      <p class="reflection-copy">${reflection.copy}</p>
      <button class="outline-button" type="button" data-practice-toggle aria-expanded="false">
        Un minuto per ascoltarla <span aria-hidden="true">＋</span>
      </button>
      <div class="micro-practice" hidden>
        <p>${reflection.practice}</p>
        <button class="minute-button" type="button" data-minute-start>
          Avvia il minuto <span data-minute-label>1:00</span>
        </button>
        <p class="minute-status" data-minute-status aria-live="polite"></p>
      </div>
    </section>`;
}

function formatDiaryDate(day) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(date);
}

function voiceDiaryMarkup() {
  const diary = loadVoiceDiary();
  if (!diary.length) return "";
  return `
    <details class="voice-diary">
      <summary><span>Il mio diario della voce</span><strong>${diary.length}</strong></summary>
      <p class="diary-intro">Niente voti e niente serie da mantenere. Solo tracce dei giorni in cui hai scelto di ascoltarti.</p>
      <ol>
        ${diary.slice(0, 7).map(entry => `
          <li>
            <time datetime="${escapeHTML(entry.date)}">${formatDiaryDate(entry.date)}</time>
            <span>${entry.words.length ? entry.words.map(escapeHTML).join(" · ") : escapeHTML(entry.note)}</span>
          </li>`).join("")}
      </ol>
    </details>`;
}

function voiceCheckInMarkup() {
  const today = loadVoiceDiary().find(entry => entry.date === localDayKey());
  const selected = new Set(today?.words || []);
  return `
    <section class="voice-check-section" id="voice-check" aria-labelledby="voice-check-title">
      <div class="check-intro">
        <p class="eyebrow">Un minuto di ascolto</p>
        <h2 id="voice-check-title">Dalle una parola.</h2>
        <p>Scegli fino a tre parole oppure scrivila come viene. Non c’è una risposta giusta.</p>
      </div>
      <form class="voice-check-card" id="voiceCheckIn" novalidate>
        <fieldset>
          <legend>Come la senti?</legend>
          <div class="voice-words">
            ${VOICE_WORDS.map(word => `
              <button class="voice-word" type="button" data-voice-word="${word}" aria-pressed="${selected.has(word)}">
                ${word}
              </button>`).join("")}
          </div>
        </fieldset>
        <label class="own-words-label" for="voiceOwnWords">Oppure usa parole tue</label>
        <textarea id="voiceOwnWords" name="voiceOwnWords" maxlength="140" rows="3" placeholder="Per esempio: impastata, lontana, pronta a uscire…">${escapeHTML(today?.note || "")}</textarea>
        <p class="selection-status" data-selection-status aria-live="polite">${selected.size ? `${selected.size} ${selected.size === 1 ? "parola scelta" : "parole scelte"}` : "Puoi scegliere fino a 3 parole."}</p>
        <button class="primary-button check-submit" type="submit">
          ${today ? "Aggiorna il mio ascolto" : "Restituiscimi uno specchio"} <span aria-hidden="true">→</span>
        </button>
        <p class="privacy-note"><span aria-hidden="true">○</span> Resta soltanto su questo dispositivo.</p>
      </form>
      <div id="voiceReflection" aria-live="polite">${today ? voiceReflectionMarkup(today) : ""}</div>
      <div id="voiceDiary">${voiceDiaryMarkup()}</div>
    </section>`;
}

const pages = {
  home: () => `
    <section class="page home-page" aria-labelledby="home-title">
      <section class="voice-hero">
        <img src="./riccardo-home.webp" alt="Riccardo Primitivo Fiorucci, vocal trainer di Opificio Vocale">
        <div class="voice-hero-shade" aria-hidden="true"></div>
        <div class="voice-hero-copy">
          <p class="eyebrow">Il check-in di oggi</p>
          <h1 id="home-title">Oggi la tua voce<br><em>come sta?</em></h1>
          <p>Non come dovrebbe stare.<br>Come sta davvero.</p>
          <button class="primary-button light" type="button" data-check-start>Ascoltiamola <span aria-hidden="true">↓</span></button>
        </div>
      </section>
      ${voiceCheckInMarkup()}
      <section class="home-sections" aria-labelledby="home-sections-title">
        <p class="eyebrow">Dentro Opificio</p>
        <h2 id="home-sections-title">Tutto, da qui.</h2>
        <div class="home-section-grid">
          <button class="home-section-card teal-card" type="button" data-route="manifesti">
            <span class="section-mark" aria-hidden="true">◎</span>
            <span><small>Podcast e testi</small><strong>Manifesti</strong></span>
            <span aria-hidden="true">→</span>
          </button>
          <button class="home-section-card terracotta-card" type="button" data-route="audioteca">
            <span class="section-mark" aria-hidden="true">◌</span>
            <span><small>Esperienze audio</small><strong>Audioteca</strong></span>
            <span aria-hidden="true">→</span>
          </button>
          <button class="home-section-card mustard-card" type="button" data-route="percorsi">
            <span class="section-mark" aria-hidden="true">✦</span>
            <span><small>Voce parlata e cantata</small><strong>Percorsi</strong></span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <div class="brand-strip">Voce cantata · Voce parlata · Identità · Espressione</div>
    </section>`,

  manifesti: () => `
    <section class="page" aria-labelledby="manifesti-title">
      <div class="panel teal">
        <p class="eyebrow">Pensieri per voci libere</p>
        <h1 id="manifesti-title">Manifesti<br>delle voci<br>libere.</h1>
        <p class="panel-copy">Ascolta il podcast e leggi l’ultimo Manifesto senza uscire dall’app.</p>
      </div>
      <section class="podcast-section" aria-labelledby="podcast-title">
        <p class="content-kicker"><span>Ascolta</span> · Podcast</p>
        <h2 id="podcast-title">La voce,<br>in forma sonora.</h2>
        <p>Gli episodi di Manifesti delle voci libere, direttamente qui.</p>
        <iframe
          class="spotify-player"
          title="Podcast Manifesti delle voci libere su Spotify"
          src="${LINKS.spotifyEmbed}"
          width="100%"
          height="326"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        ></iframe>
        <a class="text-link" href="${LINKS.spotify}" target="_blank" rel="noopener noreferrer">Apri su Spotify <span aria-hidden="true">↗</span></a>
      </section>
      <section class="latest-manifesto" aria-labelledby="latest-manifesto-title">
        <p class="content-kicker"><span>Leggi</span> · Ultimo Manifesto</p>
        <p class="manifesto-number">01</p>
        <h2 id="latest-manifesto-title">La voce che<br>hai imparato.</h2>
        <p class="manifesto-excerpt">La voce che usi più spesso non è necessariamente quella che ti appartiene di più. È quella che hai allenato di più.</p>
        <button class="primary-button" type="button" data-route="manifesto-1">Leggi nell’app <span aria-hidden="true">→</span></button>
      </section>
      <div class="newsletter-strip">
        <span>Ricevi i prossimi Manifesti</span>
        <a href="${LINKS.manifesti}" target="_blank" rel="noopener noreferrer">Iscriviti <span aria-hidden="true">↗</span></a>
      </div>
    </section>`,

  "manifesto-1": () => `
    <article class="page manifesto-article" aria-labelledby="manifesto-1-title">
      <header class="manifesto-header">
        <button class="back-button" type="button" data-route="manifesti"><span aria-hidden="true">←</span> Manifesti</button>
        <p class="content-kicker"><span>Manifesto 01</span> · Agosto 2026</p>
        <h1 id="manifesto-1-title">La voce che<br>hai imparato.</h1>
        <p class="manifesto-deck">Una riflessione sulle abitudini vocali, il corpo e la possibilità di scegliere.</p>
      </header>

      <div class="article-body">
        <p>Ci sono frasi che sembrano innocue.</p>
        <p><strong>“Questa è la mia voce.”</strong></p>
        <p>La diciamo come se stessimo indicando qualcosa di stabile, quasi definitivo.</p>
        <p>Eppure basta osservarsi per qualche giorno per accorgersi che non è proprio così.</p>
        <p><strong>La voce cambia.</strong></p>
        <p class="voice-list">Cambia quando parliamo con una persona che conosciamo da sempre.<br>
        Cambia quando rispondiamo a una telefonata di lavoro.<br>
        Cambia quando siamo stanchi.<br>
        Quando siamo arrabbiati.<br>
        Quando cerchiamo di essere accomodanti.<br>
        Quando vogliamo essere ascoltati.<br>
        Quando cantiamo.<br>
        Quando siamo soli.<br>
        Quando desideriamo qualcuno.<br>
        Quando abbiamo paura di occupare troppo spazio.</p>
        <p>E allora forse la domanda non è:</p>
        <p class="article-question">qual è la mia vera voce?</p>
        <p>Forse è:</p>
        <p class="article-question">quali voci ho imparato a usare meglio?</p>

        <hr>
        <h2>La voce non nasce ogni volta da zero</h2>
        <p>Ogni volta che parliamo o cantiamo, il corpo organizza una quantità enorme di cose.</p>
        <p class="voice-list">Respiro.<br>Pressione.<br>Movimento delle corde vocali.<br>Lingua.<br>Mandibola.<br>Labbra.<br>Risonanze.<br>Ritmo.<br>Altezza.<br>Volume.</p>
        <p>Non decidiamo consapevolmente ogni singolo dettaglio.</p>
        <p>Per fortuna.</p>
        <p class="voice-list">Il corpo impara.<br>Ripete.<br>Rende più economiche alcune coordinazioni.</p>
        <p>E dopo migliaia di ripetizioni, quelle coordinazioni cominciano a sembrarci naturali.</p>
        <p>Qui però succede qualcosa di interessante.</p>
        <p><strong>Ciò che è familiare può facilmente essere scambiato per ciò che è necessario.</strong></p>
        <p>Se parlo sempre molto velocemente, posso iniziare a pensare che quella sia semplicemente “la mia voce”.</p>
        <p>Se utilizzo quasi sempre una zona grave, posso credere che il resto non mi appartenga.</p>
        <p>Se tendo a parlare piano, posso pensare di non avere una voce forte.</p>
        <p>Se mi irrigidisco ogni volta che devo cantare davanti a qualcuno, posso iniziare a chiamare quel comportamento “il mio limite”.</p>
        <p><strong>Ma un’abitudine non è un confine.<br>È una strada percorsa molto spesso.</strong></p>

        <hr>
        <h2>Il corpo ricorda anche il contesto</h2>
        <p>La voce non si forma nel vuoto.</p>
        <p>Impariamo a usarla dentro relazioni, famiglie, scuole, gruppi, culture.</p>
        <p class="voice-list">Impariamo quando possiamo interrompere.<br>Quando dobbiamo aspettare.<br>Quanto forte possiamo parlare.<br>Quanto possiamo essere espressivi.<br>Quanto possiamo occupare spazio.</p>
        <p>Impariamo anche quale voce viene letta come autorevole, desiderabile, educata, aggressiva, femminile, maschile, professionale, infantile.</p>
        <p>E tutte queste informazioni, col tempo, smettono di essere soltanto idee.</p>
        <p class="voice-list">Entrano nel corpo.<br>Diventano postura.<br>Respirazione.<br>Ritmo.<br>Tensione.<br>Suono.</p>
        <p>È una delle cose che trovo più affascinanti della voce:</p>
        <p><strong>qualcosa che impariamo nella relazione con il mondo, a un certo punto, diventa materia sonora.</strong></p>

        <hr>
        <h2>Non c’è bisogno di trovare una “voce vera”</h2>
        <p>Quando iniziamo a osservare queste abitudini, è facile cadere in un’altra idea:</p>
        <p>che sotto tutto questo esista una voce autentica, pura, nascosta.</p>
        <p>Una specie di voce originaria da recuperare.</p>
        <p>Non sono sicuro che sia così.</p>
        <p class="voice-list">La voce che usiamo al telefono è nostra.<br>Quella che compare quando siamo nervosi è nostra.<br>Quella che utilizziamo cantando è nostra.<br>Quella che viene fuori quando smettiamo di controllarci è nostra.</p>
        <p>Sono tutte organizzazioni possibili dello stesso sistema.</p>
        <p>La questione non è decidere quale sia vera e quale falsa.</p>
        <p>La questione è:</p>
        <p class="article-question">quanto posso scegliere?</p>
        <p>Per me la libertà vocale comincia lì.</p>
        <p>Non nell’eliminare le abitudini.</p>
        <p>Ma nel non esserne completamente governati.</p>

        <blockquote>Una voce libera non è una voce senza abitudini. È una voce che può riconoscerle.</blockquote>

        <h2>Una cosa da osservare questa settimana</h2>
        <p>Non voglio lasciarti un esercizio da eseguire bene.</p>
        <p>Ti propongo invece un’osservazione.</p>
        <p>Per un giorno, prova ad accorgerti di <strong>quando la tua voce cambia</strong>.</p>
        <p class="voice-list">Non correggerla.<br>Non analizzarla troppo.<br>Nota soltanto.</p>
        <p class="voice-list">Come parli al mattino?<br>Come cambia quando rispondi a una chiamata?<br>Con chi la voce sale?<br>Con chi rallenta?<br>Quando diventa più piccola?<br>Quando occupa più spazio?<br>Quando compare più aria?<br>Quando il corpo si irrigidisce prima ancora che arrivi il suono?</p>
        <p>Potresti scoprire che in una sola giornata utilizzi molte più voci di quanto pensassi.</p>
        <p>E nessuna di loro deve essere eliminata.</p>
        <p><strong>Sono informazioni.<br>Sono tracce.<br>Sono possibilità.</strong></p>

        <hr>
        <p>Questo spazio nasce anche per questo.</p>
        <p><strong>Manifesti delle voci libere</strong> non cerca una voce perfetta.</p>
        <p>Non cerca nemmeno una voce definitiva.</p>
        <p>Mi interessa osservare tutto ciò che rende una voce più ampia, più consapevole, più disponibile.</p>
        <p class="voice-list">A volte attraverso la tecnica.<br>A volte attraverso il corpo.<br>A volte attraverso il linguaggio.<br>A volte semplicemente imparando ad ascoltare qualcosa che facciamo da anni senza più accorgercene.</p>
        <p>Perché forse una voce libera non è una voce senza abitudini.</p>
        <p>È una voce che può riconoscerle.</p>
        <p><strong>E, quando serve, scegliere anche altro.</strong></p>

        <aside class="manifesto-statement">
          <p class="content-kicker"><span>Il Manifesto</span></p>
          <p>La voce che usi più spesso non è necessariamente la voce che ti appartiene di più.</p>
          <p class="teal-text">È quella che hai allenato di più.</p>
          <p>E oltre ciò che hai allenato, <span class="teal-text">c’è ancora molto spazio.</span></p>
        </aside>

        <footer class="article-footer">
          <p>Riccardo Primitivo Fiorucci</p>
          <small>gender affirming vocal trainer · vocal coach · insegnante di canto</small>
          <a class="primary-button" href="${LINKS.manifesti}" target="_blank" rel="noopener noreferrer">Ricevi i prossimi Manifesti <span aria-hidden="true">↗</span></a>
        </footer>
      </div>
    </article>`,

  audioteca: () => `
    <section class="page" aria-labelledby="audioteca-title">
      <div class="panel terracotta">
        <p class="eyebrow">Esperienze audio</p>
        <h1 id="audioteca-title">La tua voce,<br>in ascolto.</h1>
        <p class="panel-copy">Pratiche guidate da attraversare con le cuffie, senza fretta e senza prestazione.</p>
      </div>
      <div class="audioteca-body">
        <p>Uno spazio da esplorare: ascolti e pratiche vocali per fare esperienza prima ancora di cercare una risposta.</p>
        <div class="button-row">
          <a class="primary-button" href="${LINKS.audioteca}" target="_blank" rel="noopener noreferrer">Entra nell’audioteca <span aria-hidden="true">↗</span></a>
          <a class="primary-button secondary" href="${LINKS.free}" target="_blank" rel="noopener noreferrer">Esperienze gratuite <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>`,

  percorsi: () => `
    <section class="page" aria-labelledby="percorsi-title">
      <div class="panel mustard">
        <p class="eyebrow">Percorsi e sessioni</p>
        <h1 id="percorsi-title">Più possibilità.<br>Più scelta.</h1>
        <p class="panel-copy">Lavoriamo sulla voce che parli, canti e scegli di portare nel mondo.</p>
      </div>
      <div class="routes">
        <a class="route-card" href="${LINKS.resetCheck}" target="_blank" rel="noopener noreferrer">
          <span class="route-number">01</span><span><small>Voce parlata · Sessione</small><h2>Check Vocale</h2><p>Osserva gli automatismi e sperimenta nuove possibilità.</p></span><span class="arrow" aria-hidden="true">↗</span>
        </a>
        <a class="route-card" href="${LINKS.resetCheck}" target="_blank" rel="noopener noreferrer">
          <span class="route-number">02</span><span><small>Voce parlata · Percorso guidato</small><h2>Reset Vocale</h2><p>Sette giorni di pratica e feedback personale.</p></span><span class="arrow" aria-hidden="true">↗</span>
        </a>
        <a class="route-card" href="${LINKS.vocalBoom}" target="_blank" rel="noopener noreferrer">
          <span class="route-number">03</span><span><small>Voce cantata · Percorso</small><h2>Vocal Boom</h2><p>Tecnica ed espressione senza inseguire un modello.</p></span><span class="arrow" aria-hidden="true">↗</span>
        </a>
        <a class="route-card" href="${LINKS.vocalHit}" target="_blank" rel="noopener noreferrer">
          <span class="route-number">04</span><span><small>Voce cantata · Sessione</small><h2>Vocal Hit</h2><p>Una domanda concreta, un primo passo sulla tua voce.</p></span><span class="arrow" aria-hidden="true">↗</span>
        </a>
      </div>
    </section>`
};

function currentRoute() {
  const route = location.hash.replace("#", "");
  return pages[route] ? route : "home";
}

let minuteInterval;

function render({ focus = false } = {}) {
  window.clearInterval(minuteInterval);
  const route = currentRoute();
  app.innerHTML = pages[route]();
  const titles = {
    home: "Opificio Vocale",
    manifesti: "Manifesti · Opificio Vocale",
    "manifesto-1": "La voce che hai imparato · Opificio Vocale",
    audioteca: "Audioteca · Opificio Vocale",
    percorsi: "Percorsi · Opificio Vocale"
  };
  document.title = titles[route];
  const activeRoute = route.startsWith("manifesto-") ? "manifesti" : route;
  navButtons.forEach(button => {
    const active = button.dataset.route === activeRoute;
    button.classList.toggle("active", active);
    if (button.closest(".bottom-nav")) button.setAttribute("aria-current", active ? "page" : "false");
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (focus) app.focus({ preventScroll: true });
}

document.addEventListener("click", event => {
  const checkStart = event.target.closest("[data-check-start]");
  if (checkStart) {
    document.querySelector("#voice-check")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const wordButton = event.target.closest("[data-voice-word]");
  if (wordButton) {
    const form = wordButton.closest("form");
    const buttons = [...form.querySelectorAll("[data-voice-word]")];
    const status = form.querySelector("[data-selection-status]");
    const isPressed = wordButton.getAttribute("aria-pressed") === "true";

    if (wordButton.dataset.voiceWord === "non lo so" && !isPressed) {
      buttons.forEach(button => button.setAttribute("aria-pressed", "false"));
      wordButton.setAttribute("aria-pressed", "true");
    } else {
      const unknownButton = buttons.find(button => button.dataset.voiceWord === "non lo so");
      if (!isPressed && buttons.filter(button => button.getAttribute("aria-pressed") === "true").length >= 3) {
        status.textContent = "Hai già scelto tre parole. Toccane una per cambiarla.";
        return;
      }
      if (wordButton.dataset.voiceWord !== "non lo so") unknownButton?.setAttribute("aria-pressed", "false");
      wordButton.setAttribute("aria-pressed", String(!isPressed));
    }

    const count = buttons.filter(button => button.getAttribute("aria-pressed") === "true").length;
    status.textContent = count
      ? `${count} ${count === 1 ? "parola scelta" : "parole scelte"}`
      : "Puoi scegliere fino a 3 parole.";
    return;
  }

  const practiceToggle = event.target.closest("[data-practice-toggle]");
  if (practiceToggle) {
    const practice = practiceToggle.nextElementSibling;
    const willOpen = practice.hidden;
    practice.hidden = !willOpen;
    practiceToggle.setAttribute("aria-expanded", String(willOpen));
    practiceToggle.querySelector("span").textContent = willOpen ? "−" : "＋";
    return;
  }

  const minuteButton = event.target.closest("[data-minute-start]");
  if (minuteButton) {
    window.clearInterval(minuteInterval);
    let seconds = 60;
    const label = minuteButton.querySelector("[data-minute-label]");
    const status = minuteButton.parentElement.querySelector("[data-minute-status]");
    minuteButton.disabled = true;
    status.textContent = "Non devi riuscire. Resta soltanto in ascolto.";
    label.textContent = "1:00";
    minuteInterval = window.setInterval(() => {
      seconds -= 1;
      label.textContent = `0:${String(seconds).padStart(2, "0")}`;
      if (seconds <= 0) {
        window.clearInterval(minuteInterval);
        minuteButton.disabled = false;
        label.textContent = "↻";
        status.textContent = "Il minuto è finito. Nota soltanto se qualcosa è cambiato.";
      }
    }, 1000);
    return;
  }

  const routeButton = event.target.closest("[data-route]");
  if (!routeButton) return;
  const route = routeButton.dataset.route;
  if (!pages[route]) return;
  event.preventDefault();
  if (currentRoute() === route) render({ focus: true });
  else location.hash = route;
});

document.addEventListener("submit", event => {
  if (event.target.id !== "voiceCheckIn") return;
  event.preventDefault();
  const form = event.target;
  const words = [...form.querySelectorAll("[data-voice-word][aria-pressed='true']")]
    .map(button => button.dataset.voiceWord);
  const note = form.elements.voiceOwnWords.value.trim();
  const status = form.querySelector("[data-selection-status]");

  if (!words.length && !note) {
    status.textContent = "Scegli almeno una parola oppure scrivi come la senti.";
    form.elements.voiceOwnWords.focus();
    return;
  }

  const entry = {
    date: localDayKey(),
    words,
    note,
    updatedAt: new Date().toISOString()
  };
  const saved = saveVoiceEntry(entry);
  document.querySelector("#voiceReflection").innerHTML = voiceReflectionMarkup(entry);
  document.querySelector("#voiceDiary").innerHTML = voiceDiaryMarkup();
  form.querySelector(".check-submit").innerHTML = "Aggiorna il mio ascolto <span aria-hidden=\"true\">→</span>";
  status.textContent = saved
    ? "Il tuo ascolto di oggi è nel diario."
    : "Lo specchio è pronto, ma il diario non può essere conservato in questo browser.";
  document.querySelector("#voiceReflection").scrollIntoView({ behavior: "smooth", block: "center" });
});

window.addEventListener("hashchange", () => render({ focus: true }));
render();

let installPrompt;
const installButton = document.querySelector("#installButton");

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => { installButton.hidden = true; });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
