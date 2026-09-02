# Opificio Vocale — app

Web app pubblica di Opificio Vocale.

## Contenuti

- Home con check-in quotidiano “Oggi la tua voce come sta?”, micro-pratica e diario privato esportabile o cancellabile
- Manifesti: player Spotify integrato, ultimo testo in evidenza e archivio completo leggibile nell’app
- Audioteca: accessi distinti all’area generale e alle esperienze gratuite
- Percorsi: Check Vocale, Reset Vocale, Vocal Boom e Vocal Hit

L’app è una PWA statica, mobile-first e installabile anche su iPhone. Non richiede login, database o costi di hosting. Il diario della voce usa esclusivamente lo spazio locale del dispositivo.

## Sincronizzazione automatica dei Manifesti

I contenuti sono indicizzati in `manifesti.json`. Il workflow `Sincronizza Manifesti da MailerLite` controlla ogni ora le campagne inviate il cui nome o oggetto contiene “Manifesto”, importa le nuove uscite e aggiorna automaticamente l’archivio.

Per attivarlo una sola volta:

1. creare un token API in MailerLite;
2. in GitHub aprire **Settings → Secrets and variables → Actions**;
3. creare il repository secret `MAILERLITE_API_TOKEN` con quel token;
4. aprire **Actions → Sincronizza Manifesti da MailerLite → Run workflow** per la prima sincronizzazione.

Il token resta nei GitHub Actions secrets e non viene mai inviato al browser o salvato nel repository pubblico. Il primo Manifesto mantiene la sua impaginazione editoriale dedicata; i successivi vengono convertiti dalla versione testuale della campagna MailerLite.

## Pubblicazione con GitHub Pages

Il sito viene pubblicato dal branch `main`. In GitHub: **Settings → Pages → Deploy from a branch → main / root**.
