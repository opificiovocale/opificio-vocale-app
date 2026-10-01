# Studio V1 · backend Supabase

Backend per l'area privata di Opificio Vocale.

## Stato attuale

- Progetto Supabase creato: **Studio Opificio Vocale**
- Regione: **eu-central-1**
- Piano: **Free**
- Schema applicato e verificato
- RLS attiva su tutte le tabelle esposte
- Security Advisor: nessun warning
- Login magic-link e collegamento dell'interfaccia implementati nel branch

## Attivazione nell'app

1. In **Authentication → URL Configuration** impostare il Site URL su `https://app.opificiovocale.it/` e aggiungere `https://app.opificiovocale.it/**` tra i redirect consentiti. Questo è l'unico passaggio di configurazione Auth che il connettore Supabase attuale non espone via API.
2. Usare **Project URL** e una **publishable key** nel client browser.
3. Non inserire mai nel repository chiavi `service_role` o secret keys.
4. Dopo il primo accesso dell'amministratore, impostare il suo profilo come `admin`.
5. Per ogni allievo, collegare l'account Auth al record corretto tramite `profiles.student_id`.

## Sicurezza

- Gli allievi possono leggere solo il proprio profilo, il proprio record `students`, i propri pacchetti e le lezioni esplicitamente marcate `visible_to_student = true`.
- Le scritture su allievi, pacchetti e lezioni sono riservate all'admin.
- Le note private **non sono nella stessa tabella dei dati condivisibili**:
  - `student_private_notes`
  - `lesson_private_notes`
  Queste tabelle sono leggibili e modificabili soltanto dall'admin.
- Le funzioni helper con privilegi elevati sono nello schema non esposto `private`, non in `public`.
- I file Drive devono avere permessi coerenti: il database protegge il record e il link, ma non può rendere privato un file Drive configurato come pubblico.

## Branch

La UI nel branch `feature/studio-v1-prototype` è ancora un prototipo con dati demo. Non va mergiata in produzione finché login, salvataggio e redirect Auth non sono stati collegati e testati.
