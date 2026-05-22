# 🏎️ VibeRacing - Manuale Operativo Completo (Guida Completa)

**VibeRacing** è un simulatore automobilistico cooperativo e asimmetrico in tempo reale a 60Hz. Due giocatori collaborano interpretando due ruoli distinti: **Il Pilota** (visuale 3D low-poly WebGL) e **L'Ingegnere di Pista** (console 2D VectorHeart ad alto contrasto con telemetria in tempo reale). La comunicazione dello stato vettura avviene tramite un protocollo peer-to-peer binario WebRTC a bassissima latenza.

Questo manuale documenta l'intero ecosistema di VibeRacing, guidandoti dall'installazione dei prerequisiti fino alle strategie avanzate di guida e telemetria.

---

## 🗺️ Indice delle Sezioni
1. [Requisiti di Sistema](#1-requisiti-di-sistema)
2. [Installazione e Setup](#2-installazione-e-setup)
3. [Guida all'Avvio](#3-guida-allavvio)
4. [Controlli di Gioco (Pilota & Ingegnere)](#4-controlli-di-gioco-pilota--ingegnere)
5. [Logiche di Gioco e Meccaniche Avanzate](#5-logiche-di-gioco-e-meccaniche-avanzate)
6. [Tips & Tricks (Strategie Professionali)](#6-tips--tricks-strategie-professionali)
7. [Validazione delle Logiche (Test Suite)](#7-validazione-delle-logiche-test-suite)

---

## 1. Requisiti di Sistema

### Sviluppo e Compilazione
*   **Runtime principale**: Node.js v18.0 o superiore (consigliato v20+ LTS).
*   **Gestore dei Pacchetti**: `npm` v9.0 o superiore.
*   **Compilatore Nativo (Tauri Desktop)**:
    *   **Windows**: Visual Studio Build Tools C++ (con MSVC e SDK Windows 10/11) + Rust/Cargo v1.75 o superiore.
    *   **Linux**: `build-essential`, `webkit2gtk-4.1`, `libssl-dev`, `curl`, `wget`.
    *   **macOS**: Xcode Command Line Tools.

### Hardware Requisiti (Client)
*   **GPU**: Supporto completo a WebGL 2.0 (Three.js).
*   **Input**: Tastiera standard + Gamepad compatibile con XInput (consigliato per la precisione del Pilota).
*   **Connessione**: WebRTC diretta. Se dietro NAT restrittivo, sono configurati server ICE/STUN standard.

---

## 2. Installazione e Setup

Esegui i seguenti comandi per configurare l'ambiente locale.

### Step 1: Installazione delle Dipendenze Node.js
Dalla directory principale del progetto, scarica e installa i pacchetti richiesti per il compilatore TypeScript, il bundler Vite e le librerie grafiche Three.js:
```powershell
npm install
```

### Step 2: Installazione dell'Infrastruttura Tauri (Opzionale per App Desktop)
Assicurati che Rust sia installato digitando `rustc --version`. Installa poi la CLI globale di Tauri se desideri gestire i build nativi esternamente:
```powershell
npm install -g @tauri-apps/cli
```

---

## 3. Guida all'Avvio

Il progetto supporta diverse modalità di esecuzione.

### Modalità Web (Sviluppo Locale)
Per avviare il server di sviluppo locale con Hot-Module Replacement (HMR) su Vite:
```powershell
npm run dev
```
Il terminale indicherà un indirizzo locale (es. `http://localhost:5173`). Aprendo due schede, puoi simulare localmente la connessione tra Host (Pilota) e Client (Ingegnere).

### Modalità Desktop Nativa (Tauri 2.0)
Per compilare e avviare il simulatore come applicazione desktop nativa ancorata a 60Hz:
```powershell
npm run tauri dev
```
Tauri aprirà una finestra desktop nativa, disabilitando il throttling dei timer di sfondo per eliminare i lag di sincronizzazione tipici delle schede dei browser commerciali.

### Compilazione di Produzione
Per compilare i file statici pronti per il deployment:
```powershell
npm run build
```
Per generare l'eseguibile desktop finale per la propria piattaforma:
```powershell
npm run tauri build
```
L'eseguibile compilato verrà salvato all'interno della cartella `src-tauri/target/release/bundle/`.

---

## 4. Controlli di Gioco (Pilota & Ingegnere)

### 🏎️ Il Pilota (Driver)
La visuale del pilota è interamente in grafica 3D WebGL. L'obiettivo è mantenere l'auto sulla traiettoria pulita evitando usure anomale e assecondando le indicazioni dell'ingegnere.

*   **Controlli Tastiera**:
    *   `W` o `Freccia Su`: Acceleratore (analogico simulato con rampa lineare).
    *   `S` o `Freccia Giù`: Freno (ripartizione dipendente dal bilanciamento impostato).
    *   `A` o `Freccia Sinistra`: Sterzo a sinistra.
    *   `D` o `Freccia Destra`: Sterzo a destra.
*   **Controlli Gamepad (Consigliato, a GC Zero-Allocations)**:
    *   `Levetta Sinistra (Asse 0)`: Sterzo analogico ultra-preciso (deadzone integrata a 0.05).
    *   `Grilletto Destro (RT / Asse 5)`: Acceleratore analogico lineare.
    *   `Grilletto Sinistro (LT / Asse 2)`: Freno analogico lineare.

---

### 🛠️ L'Ingegnere di Pista (Engineer)
L'ingegnere vede una dashboard 2D ardesia in stile retro-cyber con griglie VectorHeart ed elementi neon crimson inclinati a -12°. Deve analizzare i grafici e digitare sequenze per sbloccare potenza per la vettura.

*   **Matrice dei Ritmi (Input Sequenze)**:
    *   La console genera sequenze di lettere e frecce direzionali (es. `[W, S, A, D, FrecciaSu]`).
    *   Digita i caratteri a schermo con tempismo corretto. Ogni errore azzera la *Sync Streak*, bloccando la vettura in un transitorio di **"Mis-Shift" per 400ms** con annesso glitch CRT analogico sulla console.
*   **Gestione ERS (Energy Recovery System)**:
    *   `Tasti 1, 2, 3`: Cambia la mappatura dell'energia (Eco, Balanced, Qualy) per variare la spinta torsionale del motore a scapito della carica batteria.
*   **Ripartizione di Frenata**:
    *   `Tasti Q / E`: Sposta la percentuale di frenata sull'asse anteriore o posteriore per gestire l'usura e prevenire i bloccaggi durante le staccate.

---

### 🏁 Il Pit-Stop Cooperativo
Quando il pilota raggiunge la piazzola box (fine stint al nodo 980), le auto e i controlli primari si bloccano. Si attivano i minigiochi box obbligatori:

1.  **Cambio Gomme (Tires Stage)**:
    *   L'ingegnere visualizza combinazioni di tasti casuali gomma per gomma. Deve digitarle senza commettere errori per completare la sostituzione del set.
2.  **Rifornimento Carburante (Refuel Stage)**:
    *   Entrambi i giocatori devono premere simultaneamente il tasto `Spazio` (Spacebar).
    *   La tolleranza temporale è di soli **300 millisecondi**. Una pressione asincrona interrompe il flusso del carburante e penalizza lo stint.
3.  **Inversione dei Ruoli (Stint Swap)**:
    *   Completato il pit-stop, i flussi video e i controlli si invertono. L'host diventa ingegnere e il client diventa pilota, con deallocazione automatica delle risorse grafiche 3D per prevenire memory leak.

---

## 5. Logiche di Gioco e Meccaniche Avanzate

### 1. Drift Compensation (Loop a 60Hz)
Il simulatore calcola a ogni ciclo la differenza temporale tra l'orologio interno e l'orologio teorico dei 60 frame per secondo:
$$\Delta t_{\text{next}} = \max\left(0, 16.67 - (t_{\text{now}} - t_{\text{expected}})\right)$$
I timer sono delegati a un Web Worker indipendente per evitare che le code del browser ritardino gli aggiornamenti della fisica.

### 2. Trasferimento di Carico e Trail Braking
Quando si frena intensamente, il carico verticale della vettura si sposta sull'assale anteriore.
*   Il gioco calcola questa variazione dinamica: una frenata potente incrementa la capacità di grip delle ruote anteriori fino al **25%** (`calculateTrailBrakingLoadTransfer`).
*   **Trail Braking**: Rilasciando gradualmente il freno mentre inserisci l'auto in curva, aumenti l'angolo di imbardata laterale mantenendo un avantreno solido.

### 3. Accumulo Trucioli (Marbles)
Se l'auto esce dalla traiettoria ideale (distanza laterale dalla spline centrale $> 30\%$), inizia ad accumulare sporco sulle gomme.
*   L'accumulo incrementa l'usura asimmetrica dello pneumatico fino a **8 volte** la velocità base.
*   Rientrando in traiettoria, i trucioli si staccano gradualmente in circa 10-15 secondi, restituendo l'aderenza standard del battistrada.

### 4. Avarie dei Sensori (Telemetry Glitches)
Se i componenti della vettura si usurano oltre determinate soglie, i relativi sensori inviano telemetria frammentata:
*   Usura FL $> 65\%$: I grafici delle gomme iniziano a mostrare linee interrotte.
*   Freni $> 75\%$: I dati di pressione del pedale sulla console ingegnere si scollano e oscillano.
*   Gomma FL $> 81\%$: Il sensore RPM si rompe, impedendo di leggere i giri motore.

---

## 6. Tips & Tricks (Strategie Professionali)

### 💡 Per l'Ingegnere di Pista
*   **Ottimizza le Sequenze in Rettilineo**: Nelle zone catalogate come `Rettilineo` dal generatore tracciato, la frequenza di comparsa delle sequenze ritmiche rallenta. Usa questo intervallo per impostare la mappatura ERS su **Qualy** e spingere l'auto a velocità massima.
*   **Conserva l'Energia nelle Curve**: In fase di `Percorrenza` (curva), sposta la mappa su **Eco**. Il pilota guadagnerà meno trazione, ma ricaricherà rapidamente la batteria grazie alla rigenerazione cinetica di frenata.
*   **Gestisci la Traiettoria Visiva**: Se il pilota segnala una perdita di aderenza sull'asse posteriore, sposta la ripartizione di frenata all'indietro per allineare l'usura degli pneumatici ed evitare sovrasterzi improvvisi.

### 🏎️ Per il Pilota
*   **Pacing del Gas post Mis-Shift**: Se l'ingegnere commette un errore nella digitazione, l'auto entra in "Mis-Shift" per 400ms, spegnendo la trazione del motore. Non tenere premuto l'acceleratore al 100% durante il glitch: rilascialo e parzializzalo non appena l'ingegnere recupera la sequenza per evitare di far pattinare le ruote posteriori.
*   **Usa il Trail Braking in Ingresso Curva**: Non rilasciare bruscamente il freno prima di svoltare. Rilascialo lentamente mentre ruoti il volante. Questo mantiene il muso schiacciato a terra, garantendo un inserimento preciso e una traiettoria millimetrica.
*   **Evita i Marbles per la Consistenza a Lungo Termine**: Anche se tagliare una curva può sembrare vantaggioso, l'usura moltiplicata a 8x distruggerà le gomme Fl/FR prima del pit-stop, limitando drasticamente la velocità massima di grip per il resto dello stint.

---

## 7. Validazione delle Logiche (Test Suite)

Il simulatore incorpora una suite di validazione automatica che assicura che tutte le logiche matematiche siano allineate alla sesta cifra decimale e non contengano perdite di risorse o di memoria.

Per eseguire l'intera suite di test e verificare il corretto comportamento delle logiche P2P e fisiche:
```powershell
npm test
```
La suite verificherà:
1.  **Rhythm Matrix Validation**: Calcolo del punteggio, penalità e sequenze WASD.
2.  **Driver & Physics Integration**: Formule di grip, drift, usura gomme e trasmissione WebGL.
3.  **Progression & Vehicle Aging**: Assegnamento dei crediti e degrado dei sensori di telemetria.
4.  **Stint Transitions & Pit Stop**: Sincronizzazione al millisecondo del rifornimento e cambio ruote.
5.  **Engine 60Hz Drift Loop**: Precisione della cadenza dei fotogrammi e assenza di jitter.
