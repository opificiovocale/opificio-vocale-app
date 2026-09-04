# Opificio Vocale — app

Web app pubblica di Opificio Vocale.

## Contenuti

- Home con check-in quotidiano “Oggi la tua voce come sta?”, micro-pratica e diario privato esportabile o cancellabile
- Manifesti: player Spotify integrato, ultimo testo in evidenza e archivio completo leggibile nell’app
- Audioteca: accessi distinti all’area generale e alle esperienze gratuite
- Percorsi: Check Vocale, Reset Vocale, Vocal Boom e Vocal Hit

L’app è una PWA statica, mobile-first e installabile anche su iPhone. Non richiede login, database o costi di hosting. Il diario della voce usa esclusivamente lo spazio locale del dispositivo.

## Sincronizzazione automatica dei Manifesti

I contenuti sono indicizzati in `manifesti.json`. Dopo il collegamento a MailerLite, il workflow `Sincronizza Manifesti da MailerLite` controlla ogni ora le campagne inviate il cui nome o oggetto contiene “Manifesto”, importa le nuove uscite e richiede una nuova pubblicazione del sito. La cadenza di GitHub può subire ritardi.

Per attivarlo una sola volta:

1. creare un token API in MailerLite;
2. in GitHub aprire **Settings → Secrets and variables → Actions**;
3. creare il repository secret `MAILERLITE_API_TOKEN` con quel token;
4. aprire **Actions → Sincronizza Manifesti da MailerLite → Run workflow** per la prima sincronizzazione.

Il token resta nei GitHub Actions secrets e non viene mai inviato al browser o salvato nel repository pubblico. Il primo Manifesto mantiene la sua impaginazione editoriale dedicata; i successivi vengono convertiti dalla versione testuale della campagna MailerLite.

In assenza del token il workflow segnala un errore, anziché dare una falsa conferma di sincronizzazione. Verificare la prima importazione con una campagna già inviata; non considerare attivo il collegamento prima di questo controllo. Controllare anche che la versione testuale della campagna contenga il Manifesto completo.

## Verifica locale

Con Node 20 o successivo: `node --test tests/app.test.cjs`. I test controllano caricamenti ritardati, link diretti ai Manifesti, diario e timer anche dopo una pausa del browser.

## Pubblicazione con GitHub Pages

Il sito viene pubblicato dal branch `main`. In GitHub: **Settings → Pages → Deploy from a branch → main / root**.
