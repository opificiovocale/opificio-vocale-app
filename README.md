# Opificio Vocale — app

Web app pubblica di Opificio Vocale, disponibile su **app.opificiovocale.it**.

## Cosa contiene

- **Home** con check-in quotidiano “Oggi la tua voce come sta?”, diario locale e accessi rapidi alle sezioni.
- **Manifesti delle voci libere** con podcast, testi e archivio.
- **Audioteca** con esperienze audio e risorse gratuite.
- **Percorsi** con accesso ai servizi di voce parlata e cantata.
- **Studio**, area riservata per gestione didattica e percorso dell’allievo.

## Studio

Studio usa **Supabase** per autenticazione passwordless via codice email e database PostgreSQL con Row Level Security.

L’area docente permette di:
- creare e modificare schede allievo;
- gestire percorsi e numero di incontri;
- registrare, modificare ed eliminare lezioni;
- conservare note private separate dai contenuti visibili all’allievo;
- collegare registrazioni, trascrizioni e materiali su Google Drive;
- vedere l’anteprima dell’area allievo.
- caricare e sostituire gli MP3 dei sette giorni in **Studio → Audio Reset**, condivisi tra gli iscritti a Reset Vocale.

Gli audio Reset sono conservati nel bucket privato `reset-vocale`. La vista allievo e le policy del database sbloccano un giorno alla volta dalla `data_inizio` del percorso, usando il calendario di Roma. Se la data è assente, vale il giorno di creazione. Un percorso sospeso non dà accesso; i giorni già disponibili restano riascoltabili. L’anteprima **Test Reset** usa gli stessi file.

Per un nuovo progetto Supabase, applicare `supabase/reset-audio.sql` dopo `supabase/schema.sql`.

L’area allievo mostra esclusivamente i dati associati al proprio account e le lezioni marcate come visibili. Le note private docente non sono esposte.

### Registro Diapason

In **Studio → Allievi → scheda allievo → Dati allievo**, selezionare
**Diapason · Canto** e salvare il giorno della settimana e l’ora. È possibile
scegliere Diapason anche creando un allievo o da **Aggiungi percorso**:
non richiede un numero di incontri. L’orario è settimanale, senza una data.

Gli allievi Diapason vedono il percorso, l’orario e gli incontri condivisi
apribili con presenza/assenza e un unico testo per note, suggerimenti e link.
Pacchetti e pagamenti non compaiono in questa modalità. Le nuove lezioni
Diapason non consumano incontri dei pacchetti privati. I dati precedenti
restano conservati; eventuali note pubbliche e link già separati sono riuniti
nel campo unico quando si modifica un incontro.

I campi `tipo_studio`, `giorno_lezione` (1=lunedì, 7=domenica) e `ora_lezione`
appartengono a `students` e mantengono le policy esistenti: scrittura docente,
lettura dell’allievo solo sulla propria scheda. Lo schema include questi campi.

## PWA

L’app è una PWA mobile-first installabile su iPhone, iPad e dispositivi compatibili. Le risorse principali vengono memorizzate per migliorare l’uso offline. Manifesti e Comunicazioni vengono aggiornati dalla rete quando disponibile.

Il diario della voce della Home resta esclusivamente nello spazio locale del dispositivo.

## Manifesti e Comunicazioni

I Manifesti sono indicizzati in `manifesti.json`. Il workflow **Sincronizza Manifesti da MailerLite** può importare automaticamente nuove campagne pubblicate.

La zona Comunicazioni legge `comunicazioni.json` e supporta intervalli temporali, priorità e CTA interne o esterne.

## Sicurezza

Le chiavi presenti nel frontend sono esclusivamente chiavi pubblicabili lato browser. Le operazioni Studio sono protette da autenticazione, Row Level Security e funzioni database dedicate per mantenere coerenti lezioni e conteggi dei percorsi.

Non inserire mai nel repository chiavi `service_role`, password SMTP o altri segreti.

## Pubblicazione

Il sito è pubblicato con GitHub Pages dal branch `main` e usa il dominio personalizzato **app.opificiovocale.it**.

## Verifica locale

Con Node 20 o successivo e Python 3:

`node --test tests/*.test.*`

Prima di una pubblicazione importante è inoltre consigliato verificare login Studio, creazione/modifica/cancellazione lezione, Vista allievo, installazione PWA e layout iPhone/iPad.
