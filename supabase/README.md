# Studio V1 · backend Supabase

Questa cartella contiene lo schema iniziale per l'area privata di Opificio Vocale.

## Cosa serve per attivarlo

1. Creare un progetto Supabase.
2. Aprire **SQL Editor** e applicare `schema.sql`.
3. In **Authentication → URL Configuration** aggiungere l'URL pubblico dell'app tra i redirect consentiti.
4. Recuperare:
   - Project URL
   - public `anon` key
5. Copiare `studio-config.example.js` in `studio-config.js` e compilare i due valori pubblici.
6. Impostare il profilo di Riccardo come `admin` nella tabella `profiles` dopo il primo accesso.
7. Collegare ogni account allievo al record corretto valorizzando `profiles.student_id`.

## Sicurezza

- Non inserire mai nel repository la `service_role` key.
- Le policy RLS dello schema permettono agli allievi di leggere soltanto il proprio percorso e soltanto le lezioni con `visible_to_student = true`.
- Le scritture su allievi, pacchetti e lezioni sono riservate al ruolo `admin`.
- Le note private restano nello stesso record della lezione, ma non sono accessibili agli allievi perché la lettura è governata dalle policy e l'interfaccia allievo deve selezionare solo i campi condivisibili.
- I file Drive devono avere permessi coerenti: il database protegge il record, non può rendere privato un file Drive configurato come pubblico.

## Stato del branch

L'interfaccia presente nel branch è ancora un prototipo con dati demo. Lo schema prepara il backend, ma nessuna credenziale reale è inclusa.
