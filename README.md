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

L’area allievo mostra esclusivamente i dati associati al proprio account e le lezioni marcate come visibili. Le note private docente non sono esposte.

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
