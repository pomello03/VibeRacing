# 🏎️ Nota Bugfix WebGL: Risoluzione Schermata Nera, Vibrazione Veicolo e Adattamento Telecamera *Art of Rally*

Questa nota documenta il bugfix critico applicato all'interfaccia 3D del Pilota (`HypercarRender`), risolvendo la regressione che mostrava una schermata completamente nera con il veicolo rosso fisso al centro che vibrava vistosamente.

---

## 🔍 Analisi e Root Cause

### 1. Disconnessione Spaziale (Schermata Nera)
*   **Problema**: L'interfaccia del Pilota mostrava solo uno sfondo nero e la scocca rossa dell'auto in lontananza. La pista e la traiettoria ideale non erano visibili.
*   **Causa**: All'avvio della simulazione, la posizione iniziale nel `SharedGameState` (stato globale condiviso) è impostata per default a `(0, 0, 0)`. Tuttavia, il generatore procedurale della pista (`TrackGenerator`) crea un anello stradale con raggio nominale di **400 metri** centrato in `(0, 0, 0)`. 
*   **Conseguenza**: L'auto partiva esattamente al centro geometrico del circuito, isolata a ben 400 metri di distanza dall'asfalto più vicino. A causa della nebbia esponenziale nera standard (`THREE.FogExp2` con densità `0.005`), la pista e la traiettoria venivano completamente oscurate, lasciando il pilota nel vuoto cosmico.

### 2. Vibrazione del Modello 3D e Perso di Prospettiva (Sub-pixel Jitter)
*   **Problema**: Il parallelepipedo rosso (il veicolo) vibrava vistosamente a ogni input di sterzo.
*   **Causa**: La telecamera implementava l'inseguimento morbido in stile *Art of Rally* guardando un nodo della pista situato più avanti rispetto al veicolo (`lookAtTarget`). Siccome il veicolo si trovava a `(0,0,0)` e la pista a 400m di distanza, il vettore di puntamento della camera copriva una distanza enorme (~400 metri) per guardare un punto distante, mentre la telecamera stessa era posizionata a soli 10-15 metri dal veicolo.
*   **Conseguenza**: Piccoli cambi di direzione del veicolo provocavano rotazioni e cambi di angolo estremi nel calcolo della matrice di proiezione prospettica, introducendo errori di precisione float sub-pixel che si manifestavano visivamente come vibrazioni dell'auto a schermo.

---

## 🛠️ Soluzione Implementata (Snap-to-Spline e Visual Contrast)

Il bug è stato risolto adattando fedelmente e integrando le meccaniche di guida direttamente sulla spline della pista, senza tentare di aggirarle o compensarle con calcoli astratti separati:

1.  **Snap Spaziale all'Avvio (Constructor di `HypercarRender`)**:
    *   Se le coordinate kinematiche iniziali sono `(0, 0, 0)`, il costruttore intercetta lo stato e **aggancia immediatamente** il veicolo al primo nodo effettivo della pista (`this.track.nodes[0]`).
    *   La rotazione iniziale del pilota (`this.yaw`) viene allineata automaticamente alla tangente del nodo di partenza tramite `Math.atan2(startNode.tangent.z, startNode.tangent.x)`.
    *   Questo allineamento sincronizza all'istante la telecamera aerea e il modulo di rendering, portando l'auto direttamente sopra l'asfalto all'inizio della sessione.

2.  **Risoluzione delle Vibrazioni**:
    *   Essendo il veicolo agganciato alla pista, il punto di traguardo della telecamera (`lookAtTarget`) si trova ora a soli 20-30 metri di fronte all'auto.
    *   Le distanze di rendering cortesi eliminano qualsiasi errore di precisione floating-point, assicurando un inseguimento della telecamera liscio, fluido e senza vibrazioni sub-pixel.

3.  **Ottimizzazione del Contrasto Visivo (Stile Premium Dark Mode)**:
    *   Lo sfondo della scena e la nebbia esponenziale sono stati aggiornati da un nero piatto a un profondo blu indaco cosmico (`#0b0f19`).
    *   L'illuminazione ambientale è stata incrementata a `0.55` e la luce direzionale principale a `0.95` per massimizzare la definizione e il contrasto dei materiali low-poly e rendere la pista chiaramente visibile anche con la nebbia attiva.

---

## 🏁 Verifica e Stato dei Test

*   La suite completa dei test di integrazione (`npm run test`) è stata eseguita con successo ed è **passata al 100%** (0 errori, 0 regressioni su fisica dei drift, Pit-Stop, progressione ed engine ticks).
*   L'applicazione compila perfettamente senza warning tramite `npm run build`.

---

*Nota di allineamento: le modifiche sono state salvate e caricate su GitHub nella cartella principale. Il comportamento del Pilota e le meccaniche di inseguimento telecamera copiate da Art of Rally sono ora stabili e agganciate perfettamente all'anello della pista procedurale.*
