const LINKS = {
  spotify: "https://open.spotify.com/show/5kI3dR9XNwBgsNVXvQc2Y7?si=bda30684cad04eef",
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
        <p class="panel-copy">Un podcast e una newsletter per guardare alla voce oltre il parametro giusto.</p>
      </div>
      <div class="editorial-actions">
        ${external(LINKS.spotify, "Ascolta il podcast", "Su Spotify")}
        ${external(LINKS.manifesti, "Leggi i Manifesti", "Newsletter")}
      </div>
    </section>`,

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
  document.title = `${route === "home" ? "Opificio Vocale" : `${route[0].toUpperCase()}${route.slice(1)} · Opificio Vocale`}`;
  navButtons.forEach(button => {
    const active = button.dataset.route === route;
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
