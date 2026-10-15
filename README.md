# Gestionale trasferimenti e resi premi

Applicazione web in italiano per registrare i **trasferimenti di premi tra punti vendita (PDV)** e i **resi**, consultare lo storico, calcolare statistiche e esportare tutto in **CSV per Excel**.

Funziona **dal browser, senza installare nulla sul PC** (pensata anche per PC aziendali bloccati). I dati sono salvati in un **Foglio Google** che fa da database.

---

## Indice

1. [Cosa fa](#1-cosa-fa)
2. [Come è fatto: codice, applicazione e database](#2-come-è-fatto-codice-applicazione-e-database)
3. [Installazione (una sola volta)](#3-installazione-una-sola-volta)
4. [Uso quotidiano su Windows](#4-uso-quotidiano-su-windows)
5. [Importare punti vendita e cataloghi](#5-importare-punti-vendita-e-cataloghi)
   * [Ricerca premi e listino Excel](#ricerca-premi-e-listino-excel)
6. [Esportare i CSV](#6-esportare-i-csv)
7. [Backup e ripristino](#7-backup-e-ripristino)
8. [Aggiornare il programma senza perdere i dati](#8-aggiornare-il-programma-senza-perdere-i-dati)
9. [Uso da più PC e da più persone](#9-uso-da-più-pc-e-da-più-persone)
10. [Sicurezza e dati personali](#10-sicurezza-e-dati-personali)
11. [Struttura dei dati](#11-struttura-dei-dati)
12. [Come si calcolano le statistiche](#12-come-si-calcolano-le-statistiche)
13. [Fase 2: invio e-mail ai PDV (predisposto, non attivo)](#13-fase-2-invio-e-mail-ai-pdv-predisposto-non-attivo)
14. [Sviluppo e test](#14-sviluppo-e-test)
15. [Struttura dei file](#15-struttura-dei-file)
16. [Limiti noti e funzioni non incluse](#16-limiti-noti-e-funzioni-non-incluse)

---

## 1. Cosa fa

| Sezione | Funzioni |
|---|---|
| **Dashboard** | Trasferimenti, resi e assegnazioni del periodo (numero e quantità), premi più movimentati, PDV con più trasferimenti, attività recenti; filtri per periodo e stagione |
| **Ricerca premi** | Cerca un premio per nome (anche parziale, con piccoli errori di battitura) o per codice (anche parziale, con o senza zero iniziale, anche EAN). Ogni premio mostra tutte le sue versioni: **senza contributo** (punteggio pieno) e **con contributo** (punti ridotti + euro); se si cerca un codice, la versione corrispondente è evidenziata. Pulsante per copiare il codice. Il listino si aggiorna caricando il file Excel dei premi (anteprima delle differenze, conferma, storico e annullamento) |
| **Nuovo trasferimento** | Data precompilata, catalogo a un clic, ricerca immediata di PDV e premi per codice o nome, quantità, riferimento, causale, note. `Ctrl+Invio` salva; dopo il salvataggio restano catalogo, data, PDV, riferimento e causale e il cursore torna sul premio. Blocca origine = destinazione e avvisa dei possibili doppioni |
| **Nuovo reso** | Reso indipendente oppure collegato a un trasferimento (premio e PDV compilati in automatico). Il reso **non modifica** il trasferimento |
| **Nuova assegnazione** | Premi che partono dal **Magazzino via Svezia 04** verso un punto vendita: PDV che riceve, **numero di prenotazione** (facoltativo), premio, quantità, causale, riferimento e note. Avvisa se la stessa prenotazione è già stata registrata; dopo il salvataggio il cursore torna sul numero di prenotazione |
| **Storico operazioni** | Trasferimenti, resi e assegnazioni in un'unica tabella (ricerca anche per numero di prenotazione); ricerca libera, filtri combinabili (date, tipo, stato, catalogo, PDV di origine/destinazione/coinvolto, premio, causale), ordinamento per data, paginazione, dettaglio con cronologia delle modifiche, modifica, annullamento e ripristino, esportazione dei risultati filtrati |
| **Punti vendita** | Archivio con codice univoco, nome, indirizzo, città, due e-mail (con controllo del formato), note, attivo/non attivo; importazione ed esportazione CSV |
| **Cataloghi premi** | Cataloghi 2025/2026 e 2026/2027 separati (vuoti all'inizio), aggiunta di nuove stagioni; premi con codice, descrizione, categoria, note, stato; importazione/esportazione CSV per catalogo |
| **Statistiche** | Generali, per PDV e per premio con filtri per periodo, catalogo, premio, PDV e tipo di movimento; andamento mensile, confronto tra stagioni, causali, classifiche; esportazione CSV dei dati aggregati |
| **Prenotazioni Jasper** | Si carica l'export "Prenotazioni premi" di Jasper (CSV o .xlsx, tutti gli stati): classifiche di premi e negozi (pezzi o contributo), andamento mensile per stato, tabella mese × negozio/premio, prenotazioni aperte da troppo tempo, tempi di chiusura, donazioni a parte, tessere con più prenotazioni, controllo automatico con la riga "Totali" del report, confronto con l'export precedente. **Il file viene letto solo nel browser**: nel Foglio finisce solo un riepilogo (totali per premio e negozio, mai tessere o codici prenotazione) |
| **Esportazioni e backup** | Tutti i CSV, copia di sicurezza su Google Drive, backup completo scaricabile (.json) e ripristino |
| **Impostazioni** | Collegamento al database, nome operatore, separatore CSV, gestione delle causali |

Scorciatoie: `Alt+1` … `Alt+9` (le prime nove voci del menu) e `Alt+0` (Impostazioni) per passare da una sezione all'altra; nelle caselle di ricerca `↑`/`↓` per scorrere, `Invio` o `Tab` per scegliere, `Esc` per chiudere.

---

## 2. Come è fatto: codice, applicazione e database

Sono **tre cose diverse**, ed è importante distinguerle:

```
 ┌─────────────────────────┐        ┌──────────────────────────────┐        ┌────────────────────────┐
 │  APPLICAZIONE (pagina)  │  HTTPS │  BACKEND (Google Apps Script)│        │  DATABASE              │
 │  GitHub Pages           │ ─────► │  web app "…/exec"            │ ─────► │  Foglio Google         │
 │  cartella docs/         │ ◄───── │  file apps-script/Code.gs    │ ◄───── │  (un foglio per tabella)│
 └─────────────────────────┘  JSON  └──────────────────────────────┘        └────────────────────────┘
        nel browser                    gira sui server Google                   nel tuo Google Drive
```

* **Repository GitHub** = il *codice sorgente*. Non contiene dati, password o token. Pubblicarlo non rende accessibili i dati.
* **Applicazione in esecuzione** = la pagina pubblicata con **GitHub Pages** (cartella `docs/`, già compilata). Si apre con un link nel browser.
* **Database** = un **Foglio Google** sul tuo Google Drive, letto e scritto solo dallo script Apps Script, che accetta richieste solo con il **token API** corretto.

Perché questa scelta (e non un server Node con SQLite):

* sul PC di lavoro non serve installare nulla: basta un browser;
* i dati sono **persistenti** e non dipendono dal browser (chiudere la finestra o cambiare PC non perde nulla); il `localStorage` del browser contiene **solo** le impostazioni di collegamento, mai i dati;
* lo stesso database è già **condiviso** tra più PC e più persone (vedi §9);
* il Foglio Google conserva la **cronologia delle versioni**, e il gestionale aggiunge backup su Drive e backup scaricabili.

Ogni scrittura avviene sotto **blocco esclusivo** (LockService), con controlli lato server su quantità, riferimenti a premi/PDV inesistenti, duplicati e modifiche concorrenti: è l'equivalente delle transazioni di un database tradizionale.

---

## 3. Installazione (una sola volta)

Tempo: circa 15 minuti. Serve un account Google e un account GitHub.

### A. Crea il database e il backend (Google)

1. Vai su [sheets.google.com](https://sheets.google.com) e crea un **foglio vuoto**. Dagli un nome, ad esempio `Gestionale premi`.
2. Nel foglio: **Estensioni › Apps Script**.
3. Cancella il contenuto di `Codice.gs` e incolla **tutto** il contenuto del file [`apps-script/Code.gs`](apps-script/Code.gs). Salva (icona del dischetto).
4. (Consigliato) In **Impostazioni progetto** (ingranaggio) imposta il fuso orario *Europe/Rome*.
5. In alto scegli la funzione **`setup`** e premi **Esegui**. Google chiede l'autorizzazione: *Esamina autorizzazioni › scegli il tuo account › Avanzate › Vai a … (non sicuro) › Consenti*.
   È normale: lo script è tuo e chiede accesso al foglio e a Drive (per i backup).
   Il setup crea le tabelle, i cataloghi 2025/2026 e 2026/2027 (vuoti), le causali iniziali e il **token API**. Eseguirlo di nuovo non duplica nulla.
6. **Distribuisci › Nuova distribuzione** › tipo **App web**:
   * *Esegui come*: **Me**
   * *Chi ha accesso*: **Chiunque**
   * premi **Distribuisci** e copia l'**URL dell'app web** (termina con `/exec`).
7. Torna al foglio e ricaricalo: compare il menu **Gestionale premi › Mostra token API**. Copia il token.

> «Chiunque» significa che l'indirizzo è raggiungibile da Internet, **ma ogni richiesta senza il token viene rifiutata**. Tieni riservati indirizzo e token.

### B. Pubblica l'applicazione (GitHub)

Senza installare nulla, dal sito di GitHub:

1. Su [github.com](https://github.com) › **New repository** › nome `gestionale-premi` › **Public** › *Create repository*.
   (GitHub Pages gratuito funziona con repository pubblici. Il codice non contiene dati né segreti. Con un piano GitHub a pagamento si può usare un repository privato.)
2. Nella pagina del repository: **Add file › Upload files** e trascina **il contenuto** della cartella del progetto (le cartelle `apps-script`, `docs`, `emulatore`, `modelli-csv`, `src`, `test` e i file `README.md`, `package.json`, `build.mjs`, `tsconfig.json`, `.gitignore`). **Non** caricare `node_modules`.
3. *Commit changes*.
4. **Settings › Pages** › *Source*: **Deploy from a branch** › *Branch*: `main` e cartella **`/docs`** › *Save*.
5. Dopo 1–2 minuti l'app è online a un indirizzo come `https://TUO-UTENTE.github.io/gestionale-premi/`.

In alternativa, con Git installato (su un PC personale):

```bat
cd percorso\gestionale-premi
git init
git add .
git commit -m "Prima versione del gestionale premi"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/gestionale-premi.git
git push -u origin main
```

### C. Collega l'app al database

1. Apri l'indirizzo GitHub Pages nel browser (Edge o Chrome).
2. Incolla l'**URL della web app** e il **token API**, scrivi il tuo nome (operatore) e premi **Verifica e salva**.
3. Va fatto una volta per ogni PC/browser. Le impostazioni restano nel browser; i dati restano nel Foglio Google.

> Se il PC di lavoro apre GitHub ma la verifica non riesce con «Impossibile contattare il server», probabilmente la rete aziendale blocca `script.google.com`: in quel caso va chiesto all'IT di consentirlo.

---

## 4. Uso quotidiano su Windows

**Non c'è nessun comando da eseguire e nessun programma da avviare**: si apre il link GitHub Pages nel browser (conviene aggiungerlo ai Preferiti o fissarlo sulla barra delle applicazioni).

* *Inizializzazione del database*: è la funzione `setup` del §3.A (una sola volta).
* Il pulsante **Aggiorna** in basso a sinistra rilegge i dati; quando si torna sulla finestra dopo almeno un minuto i dati vengono riletti in automatico.

I comandi `npm` del §14 servono **solo** a chi modifica il codice.

---

## 5. Importare punti vendita e cataloghi

I cataloghi e l'archivio PDV partono **vuoti**: nessun premio o codice è inventato.

1. Prepara un file CSV (da Excel: *File › Salva con nome › CSV (delimitato dal separatore di elenco)*; va bene anche *CSV UTF-8*). La prima riga deve contenere le intestazioni. Nella cartella [`modelli-csv/`](modelli-csv/) ci sono due modelli con una riga di esempio fittizia da sostituire.
2. **Punti vendita › Importa CSV** oppure **Cataloghi premi ›** scegli la stagione **› Importa CSV in 2025/2026** (o 2026/2027).
3. Il programma riconosce separatore (`;` o `,`) e codifica, propone l'**associazione delle colonne** (modificabile), mostra un'**anteprima** e un **riepilogo**: nuovi, già presenti, righe con errori (campi obbligatori mancanti, e-mail non valide, valori ripetuti nel file), con il numero di riga.
4. Per i record già presenti scegli se **lasciarli invariati** (predefinito) o **aggiornarli**: nulla viene sovrascritto senza conferma. In aggiornamento cambiano solo le colonne associate.
5. **Conferma importazione**: alla fine compare il resoconto.

Campi riconosciuti

| Punti vendita | Premi |
|---|---|
| **Codice PDV\***, **Nome\***, Indirizzo, Città, E-mail, E-mail secondaria, Note, Attivo (SI/NO) | Codice premio, **Descrizione\***, Categoria, Note, Attivo (SI/NO) |

Regole: il codice PDV è univoco; il codice premio è univoco **all'interno del catalogo** (lo stesso codice può esistere in stagioni diverse); un premio senza codice è identificato dalla descrizione. I premi vengono sempre importati nel catalogo scelto, così le stagioni non si mescolano.

---

### Ricerca premi e listino Excel

La **Ricerca premi** usa un archivio separato dai cataloghi: il *listino*, letto dal file Excel dei premi del concorso. Ogni premio raggruppa le sue versioni: la versione a punteggio pieno e quella con punti ridotti + contributo (nel file sono righe diverse, quella con contributo ha di solito «C/A» nel nome e il codice della versione piena nella colonna *COD. PRECONFEZ.*). I codici restano testo (gli zeri iniziali non si perdono), punti e contributo sono numeri e non vengono mai sommati tra versioni.

**Caricare o aggiornare il listino (anche durante l'anno)**

1. Apri **Ricerca premi › Aggiorna listino** e trascina il file `.xlsx` (va bene il file del concorso con un foglio per stagione, oppure il file riorganizzato con il foglio «Varianti»). Il file viene letto sul PC: nulla viene inviato finché non confermi.
2. Controlla i **fogli trovati**: per ogni foglio si vedono la stagione (ricavata dal nome del foglio, es. «2027-2026» → 2026/2027; si può correggere) e le colonne riconosciute. Togli la spunta ai fogli che non vuoi importare.
3. Leggi l'**anteprima**: premi nuovi, aggiornati (con punti e contributo prima → dopo), invariati, da verificare, codici già associati a un altro premio, codici in archivio che mancano dal file.
4. Premi **Conferma importazione**. Al termine compare il resoconto (aggiunti, aggiornati, invariati, da verificare).

Regole dell'aggiornamento:

* è **incrementale**: aggiunge i nuovi e aggiorna i cambiati; i premi che mancano dal file **restano** in archivio. Solo se metti la spunta «Disattiva i codici non presenti nel file» vengono disattivati (non cancellati). Lasciala vuota quando il file contiene solo una parte dei premi (es. un'integrazione di metà anno);
* si confrontano solo le stagioni presenti nel file: caricare la 2026/2027 non tocca le altre;
* reimportare lo stesso file non crea doppioni (risulta tutto «invariato»);
* prima di ogni importazione viene salvata una **copia del listino**; nello **Storico aggiornamenti del listino** il pulsante **Annulla** riporta il listino com'era prima di quell'operazione (si conservano le ultime 10 copie; anche l'annullamento si può annullare);
* i premi con abbinamenti dubbi (codice ripetuto, EAN che non corrisponde al codice, versione con contributo senza versione piena) vengono importati con il segnale **Da verificare**, visibile nella ricerca con il motivo.

Per un nuovo premio aggiunto a metà anno basta aggiungere le sue righe al file Excel della stagione (stesse colonne) e ricaricarlo: risulteranno nuovi solo quei premi.

## 6. Esportare i CSV

* **Esportazioni e backup**: trasferimenti, resi, storico completo, punti vendita, catalogo premi (uno o tutti), statistiche per PDV e per premio; con filtri per periodo e catalogo e la scelta di includere le operazioni annullate.
* **Storico › Esporta risultati**: esattamente le righe filtrate sullo schermo.
* **Statistiche**: ogni tabella ha il suo pulsante CSV con i **dati aggregati** secondo i filtri scelti.

Formato: UTF-8 con BOM (Excel mostra correttamente gli accenti), separatore `;` con virgola decimale (Excel italiano) oppure `,` (da **Impostazioni**), intestazioni in italiano, date `gg/mm/aaaa`, quantità numeriche, testi con separatori/virgolette/a capo gestiti correttamente, nome file con tipo e data (es. `trasferimenti_2026-10-12_1830.csv`). I testi che Excel interpreterebbe come formule (che iniziano con `=`, `+`, `@`, `-`) vengono preceduti da un apostrofo.

---

## 7. Backup e ripristino

Il backup comprende **tutte** le tabelle: cataloghi, premi, PDV, causali, trasferimenti, resi, registro delle modifiche, contatori e tabelle e-mail.

| Modo | Come |
|---|---|
| **Copia su Google Drive** | *Esportazioni e backup › Crea copia ora* (oppure dal foglio: menu *Gestionale premi › Crea copia di sicurezza ora*). La copia finisce nella cartella `Backup Gestionale Premi` |
| **Backup automatico notturno** | Nell'editor Apps Script esegui una volta `installaBackupGiornaliero` |
| **Backup scaricabile (.json)** | *Esportazioni e backup › Scarica backup .json*: conservalo sul PC o in una cartella di rete |
| **Cronologia versioni** | Nel Foglio Google: *File › Cronologia delle versioni* |

**Ripristino da un file .json**: *Esportazioni e backup › Ripristina › Scegli file di backup…*, controlla il riepilogo e digita `RIPRISTINA`. Prima di sovrascrivere, il programma crea automaticamente una copia di sicurezza dello stato attuale su Drive.

**Ripristino da una copia su Drive**: apri la copia, *Estensioni › Apps Script*, esegui `setup` (genera un nuovo token se serve) e distribuisci una nuova app web; poi aggiorna indirizzo e token nelle Impostazioni dell'app. In alternativa usa la cronologia delle versioni del foglio originale.

> Le copie su Drive contengono i dati reali: **non** caricarle su GitHub.

---

## 8. Aggiornare il programma senza perdere i dati

I dati sono nel Foglio Google, separati dal codice: aggiornare il programma non li tocca.

* **Interfaccia** (cartella `docs/`): carica su GitHub la nuova cartella `docs/` (sostituendo quella vecchia). GitHub Pages si aggiorna da solo in 1–2 minuti; se il browser mostra ancora la versione vecchia premi `Ctrl+F5`.
* **Backend** (`apps-script/Code.gs`): prima fai un backup (§7), poi incolla il nuovo codice nell'editor Apps Script, salva, esegui `setup` (aggiunge eventuali nuove colonne senza toccare i dati) e poi **Distribuisci › Gestisci distribuzioni › ✏️ Modifica › Versione: Nuova versione › Distribuisci**. Così l'indirizzo `/exec` resta lo stesso e non serve riconfigurare i PC.

---

### Aggiornamento con la ricerca premi (ottobre 2026)

1. Fai un backup (§7).
2. In Apps Script sostituisci tutto il contenuto di `Code.gs` con il nuovo [`apps-script/Code.gs`](apps-script/Code.gs) e salva.
3. **Distribuisci › Gestisci distribuzioni › ✏️ Modifica › Versione: Nuova versione › Distribuisci.**
4. Apri **Ricerca premi › Aggiorna listino** e carica il file Excel dei premi.

I fogli `ListinoGruppi`, `ListinoVarianti`, `Importazioni` e `ListinoBackup` si creano da soli: non serve eseguire `setup` e `Index.html` non cambia. Finché lo script non è aggiornato, la pagina Ricerca premi mostra un avviso e il resto funziona come prima. I backup `.json` fatti prima di questo aggiornamento restano validi: ripristinandoli il listino attuale non viene toccato.

### Aggiornamento con le assegnazioni (ottobre 2026)

1. Fai un backup (§7).
2. Apri il Foglio Google › **Estensioni › Apps Script**, sostituisci tutto il contenuto di `Code.gs` con il nuovo [`apps-script/Code.gs`](apps-script/Code.gs) e salva.
3. **Distribuisci › Gestisci distribuzioni › ✏️ Modifica › Versione: Nuova versione › Distribuisci.**

Il foglio `Assegnazioni` e le causali «Prenotazione cliente» e «Altra causale» vengono creati da soli alla prima apertura dell'app: non serve eseguire `setup`. Il file `Index.html` della versione integrata non cambia. Finché lo script non è aggiornato l'app funziona come prima e la pagina «Nuova assegnazione» mostra un avviso.

---

## 9. Uso da più PC e da più persone

* Tutti i PC che usano lo stesso indirizzo e token lavorano sullo **stesso database**.
* Ogni operazione registra **chi** l'ha creata e modificata (nome operatore delle Impostazioni) e quando.
* Le scritture sono in coda una alla volta (blocco esclusivo); se due persone modificano la **stessa** operazione, la seconda riceve l'avviso «modificato da un'altra persona, ricarica» invece di sovrascrivere.
* Non ci sono account personali con password: chi ha indirizzo e token può operare. Per revocare l'accesso a tutti: esegui `rigeneraToken` nell'editor Apps Script e distribuisci il nuovo token solo a chi serve.
* Apps Script ha delle quote di utilizzo (pagina «Quote per i servizi Google» nella documentazione di Google) e ogni salvataggio richiede in genere uno o due secondi: per un piccolo team sono ampiamente sufficienti.

---

## 10. Sicurezza e dati personali

* Nel repository **non** ci sono dati reali, indirizzi e-mail dei PDV, token o password. I modelli CSV contengono solo righe **fittizie** marcate come tali.
* Il token API è generato dallo script e salvato nelle *Proprietà dello script*, non nel codice. Nel browser è conservato solo nelle impostazioni locali (localStorage) di chi ha configurato quel PC.
* L'indirizzo GitHub Pages è pubblico ma mostra solo l'interfaccia vuota: senza indirizzo della web app e token non si vede alcun dato.
* I dati (inclusi indirizzi e-mail dei negozi) risiedono sul Google Drive dell'account che ha creato il foglio. Valuta con l'azienda se usare un account Google aziendale (Google Workspace) invece di quello personale.
* Le operazioni non vengono mai eliminate fisicamente: si annullano (con motivo) e si possono ripristinare. PDV e premi si disattivano invece di eliminarli, così lo storico resta leggibile.

---

## 11. Struttura dei dati

Ogni tabella è un foglio con la prima riga di intestazione. Tutte le celle sono in formato testo (niente conversioni automatiche di date o zeri iniziali dei codici). Identificativi progressivi stabili: `TR-000001` (trasferimenti), `RS-000001` (resi), `AS-000001` (assegnazioni), `PV-…` (PDV), `PR-…` (premi), `CT-01` (cataloghi), `CA-…` (causali).

| Foglio | Contenuto |
|---|---|
| `Cataloghi` | id, codice stagione (es. 2025/2026), nome, date di inizio/fine facoltative, attivo, ordine |
| `Premi` | id, catalogo, codice, descrizione, categoria, note, attivo |
| `PDV` | id, codice univoco, nome, indirizzo, città, e-mail, e-mail secondaria, note, attivo |
| `Causali` | id, tipo (trasferimento/reso/assegnazione), descrizione, attivo, ordine |
| `Trasferimenti` | id, data, catalogo, premio (+ codice e descrizione storici), PDV origine e destinazione (+ codici e nomi storici), quantità, causale, riferimento, note, stato, creato il/da, modificato il/da, annullato il, motivo annullamento |
| `Resi` | come sopra con il PDV che rende e l'eventuale trasferimento collegato |
| `Assegnazioni` | come i resi, con il PDV che riceve dal Magazzino via Svezia 04 e il numero di prenotazione. Il foglio viene creato da solo alla prima richiesta dopo l'aggiornamento dello script |
| `ListinoGruppi` | premi del listino: id (`GP-…`), chiave stabile (stagione + codice principale), stagione, nome, verifica (ok / da verificare) con note, attivo, importazione che l'ha creato o modificato |
| `ListinoVarianti` | versioni dei premi: id (`VA-…`), premio, stagione, codice, EAN, codice preconfezionato originale, descrizione originale, modalità (`pieno` / `contributo`), punti, contributo in euro, foglio e riga di origine, attivo |
| `Importazioni` | storico degli aggiornamenti del listino (`IM-…`): data, operatore, tipo (importazione / ripristino), file, stagioni, conteggi |
| `ListinoBackup` | copie del listino prima di ogni importazione (testo JSON in parti), per l'annullamento |
| `Registro` | ogni creazione, modifica (valori prima → dopo), annullamento, ripristino, importazione e ripristino backup, con data e operatore |
| `ModelliEmail`, `InviiEmail` | vuote, per la fase 2 (§13) |
| `Meta` | versione dello schema e contatori degli identificativi |

Le operazioni conservano codice e nome di premio e PDV **al momento della registrazione**: se in seguito un premio o un negozio cambia nome, lo storico resta leggibile com'era.

Ogni stagione futura si aggiunge da **Cataloghi premi › Nuovo catalogo** (es. 2027/2028), senza modificare il codice.

---

## 12. Come si calcolano le statistiche

* Si usano **solo le operazioni valide**: le annullate sono escluse da totali, classifiche e grafici (restano visibili nello storico).
* Nei totali generali **ogni trasferimento è contato una volta**. «In uscita» e «in entrata» sono sempre mostrati separati per ciascun PDV; la colonna «Movimentata» (uscita + entrata dello stesso PDV) serve solo a ordinare i negozi e la sua somma non è il totale trasferito.
* I **resi** sono una tipologia distinta: non riducono i trasferimenti né la loro quantità.
* Le **assegnazioni dal magazzino** non entrano nelle statistiche tra PDV (che restano uguali a prima): hanno i loro totali in Dashboard e Storico e il loro file CSV in Esportazioni.
* **Rapporto resi/trasferiti** = quantità resa ÷ quantità trasferita, nello stesso periodo e con gli stessi filtri. È un indicatore, non un dato certo: un reso può riguardare premi arrivati senza un trasferimento registrato o trasferiti in un periodo diverso. Se non c'è nulla di trasferito appare «n.d.»; valori oltre il 100% sono segnalati con ⚠.
* Il **confronto tra cataloghi** di un premio usa lo stesso codice premio nelle diverse stagioni (o la stessa descrizione se il premio non ha codice).
* Non vengono calcolate giacenze di magazzino: è un gestionale dei movimenti.

---

## 13. Fase 2: invio e-mail ai PDV (predisposto, non attivo)

In questa versione **non viene inviata né simulata alcuna e-mail**. La struttura è pronta:

* ogni PDV ha e-mail principale e secondaria con formato verificato (l'elenco PDV segnala quelli attivi senza e-mail);
* le tabelle `ModelliEmail` (nome, oggetto, corpo) e `InviiEmail` (data, PDV, destinatario, oggetto, modello, **chiave univoca**, esito, errore) sono già create dal setup.

Come andrà realizzata: l'invio avverrà **dallo script Apps Script** con `MailApp`/`GmailApp`, cioè dall'account Google che possiede il foglio. **Non servono credenziali SMTP** e nulla di segreto finisce nel browser o su GitHub. La chiave univoca (es. PDV + modello + data) registrata in `InviiEmail` prima dell'invio impedirà invii doppi accidentali; l'esito di ogni invio sarà registrato. Le quote di Google limitano il numero di destinatari giornalieri (circa 100 con un account gratuito, di più con Google Workspace): andranno verificate prima di attivare la funzione.

---

## 14. Sviluppo e test

Servono [Node.js](https://nodejs.org) 22.18 o successivo (solo per modificare il codice, non per usare il programma).

```bat
npm install
npm run emulatore        :: backend simulato su http://localhost:8787 (il token viene stampato a video)
npm run dev              :: interfaccia su http://localhost:5173 con ricompilazione automatica
npm run typecheck        :: controllo dei tipi TypeScript
npm test                 :: test automatici del backend, delle statistiche/CSV e del listino premi
npm run build            :: compila l'interfaccia nella cartella docs/ (da caricare su GitHub)
```

L'**emulatore** (`emulatore/`) esegue il vero `apps-script/Code.gs` dentro Node con un Foglio Google simulato salvato in `emulatore/dati/` (cartella esclusa da Git). Serve per sviluppare e testare senza toccare il database reale; per collegare l'interfaccia all'emulatore usa `http://localhost:8787/` e il token stampato.

Tecnologie: React 19 + TypeScript, Tailwind CSS 4, esbuild (compilazione), Google Apps Script (backend), Fogli Google (database). Per tenere le dipendenze al minimo, i tipi di React usati dal progetto sono dichiarati in `src/types/react-shim.d.ts` invece di installare `@types/react`.

### Verifiche eseguite su questa versione

Test del listino premi (`test/listino.test.ts`, con il file di prova `test/fixtures/premi-prova.xlsx` a dati di esempio): lettura dell'Excel e codici come testo, caso DECESPUGLIATORE ELETTRICO (0406454 · 9.900 punti; 0406455 · 5.200 punti + 49,00 €), varianti senza «C/A», nomi con «C/» che non sono varianti, codice ripetuto risolto con l'EAN, versione orfana, ricerca per nome, parti di nome, codici completi e parziali con evidenziazione, refusi, confronto con l'archivio, rilettura del file riorganizzato; nel backend: importazione, reimportazione senza doppioni, aggiornamento di punti e contributo, premi assenti conservati o disattivati solo su richiesta, ripristino, persistenza dopo il riavvio, dati non validi, database esistente senza tabelle del listino, backup. Con `PREMI_XLSX=percorso\Premi.xlsx npm test` si verifica anche il file reale.

Test automatici (`npm test`): 16 test sul backend reale nell'emulatore (sicurezza del token, setup, PDV, premi per catalogo, trasferimenti e validazioni, testi che sembrano formule, resi indipendenti e collegati, modifica con controllo dei conflitti e nomi storici, annullamento/ripristino, PDV disattivati, importazioni con duplicati ed errori, nuovo catalogo e causale, persistenza dopo il riavvio, backup e ripristino) e 11 test sulle statistiche e sui CSV.

Test nel browser (Chromium, con l'emulatore): configurazione, creazione PDV, importazione PDV da CSV Excel con duplicati ed errori, premi nei due cataloghi, importazione premi, trasferimenti in serie da tastiera con validazioni e avviso doppioni, separazione dei cataloghi, reso indipendente e collegato, filtri e ordinamento dello storico, modifica con cronologia, statistiche per PDV e per premio, verifica delle righe di tutti i CSV esportati, annullamento con aggiornamento delle statistiche, persistenza dopo il riavvio, backup e ripristino, causali.

**Non verificato in questo ambiente**: l'esecuzione sui server Google reali (Apps Script, Drive, trigger notturno). Il codice usa solo servizi standard di Apps Script, ma il primo collaudo va fatto con il setup del §3: crea un PDV e un premio di prova, registra un trasferimento, controlla che compaia nel foglio `Trasferimenti`, poi annullalo.

---

## 15. Struttura dei file

```
gestionale-premi/
├─ apps-script/
│  ├─ Code.gs              backend: API, validazioni, blocchi, registro, backup/ripristino, setup
│  └─ appsscript.json      manifest (fuso orario, impostazioni web app)
├─ docs/                   applicazione compilata, pubblicata da GitHub Pages
├─ src/                    codice sorgente dell'interfaccia (React + TypeScript)
│  ├─ main.tsx             menu, navigazione, avvio
│  ├─ pages/               Dashboard, RicercaPremi, NuovaOperazione, Storico, PuntiVendita, Cataloghi,
│  │                       Statistiche, Esportazioni, Impostazioni, Benvenuto
│  ├─ components/          modulo operazioni, ricerca con tastiera, importazione CSV, grafici, finestre
│  ├─ lib/                 statistiche, CSV, esportazioni, API, formati, tipi,
│  │                       xlsx.ts (lettore Excel senza librerie), listino.ts (raggruppamento e ricerca premi)
│  ├─ state/               dati condivisi, avvisi e conferme, annullamento/ripristino
│  └─ styles.css, index.html
├─ emulatore/              backend simulato per sviluppo e test (non serve in produzione)
├─ test/                   test automatici
├─ modelli-csv/            modelli CSV con righe fittizie
├─ build.mjs               script di compilazione
├─ package.json, tsconfig.json, .gitignore
└─ README.md
```

Non è necessario un file `.env`: il programma non contiene segreti; indirizzo e token si inseriscono nelle Impostazioni dell'app.

---

## 16. Limiti noti e funzioni non incluse

* **Invio e-mail**: solo predisposto (§13).
* **Autenticazione per utente**: c'è un token unico condiviso; il nome operatore è dichiarato da chi usa il PC, non verificato.
* **Eliminazione definitiva** di operazioni, PDV o premi: non prevista dall'interfaccia (si annulla o si disattiva). Se proprio necessaria, si fa a mano nel Foglio Google dopo un backup.
* **E-mail principale del PDV**: è verificata nel formato ma non obbligatoria, per poter importare elenchi incompleti; i PDV attivi senza e-mail sono segnalati.
* **Uso offline**: serve la connessione a Internet (i dati sono su Google).
* **Giacenze di magazzino**: non calcolate, per scelta (gestionale dei movimenti).
* **Data del movimento e stagione**: il programma non impedisce di registrare un trasferimento con una data fuori dal periodo della stagione; il catalogo va scelto esplicitamente ed è sempre visibile nel modulo.
* **Volumi**: pensato per qualche decina di migliaia di operazioni. L'app carica tutti i dati all'apertura; con volumi molto più grandi conviene passare a un database centralizzato (la struttura delle tabelle è già quella relazionale da riportare, ad esempio, in PostgreSQL).

---

## Account Google aziendale (accesso solo dal dominio)

Se il Foglio è su un account Google **aziendale** e nella distribuzione non compare l'accesso **"Chiunque"** (solo "Chiunque in *dominio*"), la pagina su GitHub Pages non riesce a collegarsi ("Impossibile contattare il server"). In questo caso si usa la **versione integrata**, servita direttamente da Apps Script:

1. In Apps Script sostituisci `Code.gs` con l'ultima versione di `apps-script/Code.gs`.
2. **＋ › HTML**, chiama il file `Index` e incolla il contenuto di `apps-script/Index.html` (è una pagina piccola: il programma vero viene caricato da GitHub Pages, quindi GitHub Pages deve restare attivo e gli aggiornamenti arrivano da soli). Salva.
3. **Distribuisci › Gestisci distribuzioni › ✏️**: *Esegui come* **Me**, *Chi ha accesso* **Chiunque in *dominio***, *Versione* **Nuova versione** › Distribuisci.
4. Apri l'indirizzo `/exec`: si apre direttamente il gestionale, senza token né impostazioni di collegamento.

`apps-script/Index.html` si rigenera con `npm run build && npm run build:gas`.


---

## Aggiornamento ottobre 2026: Prenotazioni Jasper, promemoria e repository privato

### Prenotazioni Jasper
Nuova voce di menu. Ogni caricamento salva nel foglio **RiepiloghiJasper** (creato da solo) i totali dell'export, usati per il confronto con quello successivo. Le righe dell'export, con i numeri di tessera, non lasciano mai il PC.

### Promemoria ogni due settimane
Dal menu **Gestionale premi** del Foglio: *Attiva promemoria export Jasper*. Arriva una mail all'account proprietario dello script **un martedì sì e uno no alle 18:15**, con il link diretto alla sezione (`…/exec?sezione=jasper`). Giorno e ora si cambiano in `Code.gs` (`PROMEMORIA_GIORNO`, `PROMEMORIA_ORA`, `PROMEMORIA_MINUTI`). *Invia ora un promemoria di prova* serve per controllare che arrivi.

### Repository GitHub privato
La versione integrata può leggere il programma direttamente dal repository, anche privato, senza GitHub Pages:
1. Su GitHub: **Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token**. Repository access: *Only select repositories* › questo repository. Permissions › Repository › **Contents: Read-only**. Copia il token.
2. Nel Foglio: menu **Gestionale premi › Collega GitHub (repository privato)…** e incolla il token. Viene verificato subito.
3. Apri il gestionale e controlla che funzioni. Solo a quel punto rendi privato il repository (**Settings › General › Danger Zone › Change visibility**).

Il server Google legge `docs/app.js` e `docs/app.css` dall'ultima versione di `main` e li tiene in memoria per qualche ora: dopo un aggiornamento, *Aggiorna il programma ora* lo fa usare subito. Senza token, tutto funziona come prima (caricamento da GitHub Pages).
