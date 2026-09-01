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

const pages = {
  home: () => `
    <section class="page" aria-labelledby="home-title">
      <div class="hero">
        <p class="eyebrow">Uno spazio per voci libere</p>
        <h1 id="home-title">La tecnica<br>al servizio<br><em>dell’espressione.</em></h1>
        <p class="lead">Ascolta, sperimenta, cambia.<br>La tua voce non deve diventare giusta: deve poter scegliere.</p>
        <button class="primary-button" type="button" data-route="audioteca">Entra nell’audioteca <span aria-hidden="true">↘</span></button>
      </div>
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
          height="352"
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

function render({ focus = false } = {}) {
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
  const routeButton = event.target.closest("[data-route]");
  if (!routeButton) return;
  const route = routeButton.dataset.route;
  if (!pages[route]) return;
  event.preventDefault();
  if (currentRoute() === route) render({ focus: true });
  else location.hash = route;
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
