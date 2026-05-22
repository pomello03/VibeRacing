import { Engine } from './core/Engine.js';
import { P2PNetwork } from './core/P2PNetwork.js';
import { StintManager } from './core/StintManager.js';
import { TrackGenerator } from './shared/TrackGenerator.js';
import {
  createInitialGameState,
  serializeSharedGameState,
  deserializeSharedGameState,
  ALL_BLOCKS,
  BLOCK_KINEMATICS,
  BLOCK_TELEMETRY,
  BLOCK_METRICS,
  BLOCK_WEAR,
  BLOCK_ENVIRONMENT,
  SharedGameState
} from './shared/GameState.js';
import { HypercarRender } from './driver/HypercarRender.js';
import { InputHandler } from './driver/InputHandler.js';
import { TelemetryCanvas } from './engineer/TelemetryCanvas.js';
import { RhythmMatrix } from './engineer/RhythmMatrix.js';

// DOM Elements
const screenRole = document.getElementById('screen-role')!;
const screenLobby = document.getElementById('screen-lobby')!;
const screenSim = document.getElementById('screen-sim')!;

const btnSelectDriver = document.getElementById('btn-select-driver')!;
const btnSelectEngineer = document.getElementById('btn-select-engineer')!;
const btnQuickLoopback = document.getElementById('btn-quick-loopback')!;

const roleIndicator = document.getElementById('role-indicator')!;
const connectionDot = document.getElementById('connection-dot')!;
const connectionText = document.getElementById('connection-text')!;

const lobbyRoleBadge = document.getElementById('lobby-role-badge')!;
const lobbyHostView = document.getElementById('lobby-host-view')!;
const lobbyClientView = document.getElementById('lobby-client-view')!;
const roomIdBadge = document.getElementById('room-id-badge')!;
const inviteLinkInput = document.getElementById('invite-link-input') as HTMLInputElement;
const btnCopyLink = document.getElementById('btn-copy-link')!;
const joinCodeInput = document.getElementById('join-code-input') as HTMLInputElement;
const btnJoinRoom = document.getElementById('btn-join-room')!;
const btnCancelLobby = document.getElementById('btn-cancel-lobby')!;
const lobbyLogs = document.getElementById('lobby-logs')!;

const simLayout = document.getElementById('sim-layout')!;
const panelDriver = document.getElementById('panel-driver')!;
const panelEngineer = document.getElementById('panel-engineer')!;

const driverCanvas = document.getElementById('driver-canvas') as HTMLCanvasElement;
const engineerCanvas = document.getElementById('engineer-canvas') as HTMLCanvasElement;

const statSpeed = document.getElementById('stat-speed')!;
const statGear = document.getElementById('stat-gear')!;
const statRpm = document.getElementById('stat-rpm')!;

const statStreak = document.getElementById('stat-streak')!;
const statCredits = document.getElementById('stat-credits')!;
const statTemp = document.getElementById('stat-temp')!;

const driverPitOverlay = document.getElementById('pitstop-driver-overlay')!;
const driverPitStage = document.getElementById('driver-pit-stage')!;
const driverPitInstr = document.getElementById('driver-pit-instr')!;
const driverPitTarget = document.getElementById('driver-pit-target')!;
const driverPitProgress = document.getElementById('driver-pit-progress')!;

const engineerPitOverlay = document.getElementById('pitstop-engineer-overlay')!;
const engineerPitStage = document.getElementById('engineer-pit-stage')!;
const engineerPitInstr = document.getElementById('engineer-pit-instr')!;
const engineerPitTarget = document.getElementById('engineer-pit-target')!;
const engineerPitProgress = document.getElementById('engineer-pit-progress')!;

const btnQuitSim = document.getElementById('btn-quit-sim')!;

// App State
let selectedRole: 'driver' | 'engineer' | 'loopback' | null = null;
let p2pHost: P2PNetwork | null = null;
let p2pClient: P2PNetwork | null = null;
let activeP2P: P2PNetwork | null = null;

let track: TrackGenerator | null = null;
let gameState: SharedGameState | null = null;
let stintManager: StintManager | null = null;

let driverRender: HypercarRender | null = null;
let driverInput: InputHandler | null = null;

let engineerTelemetry: TelemetryCanvas | null = null;
let engineerRhythm: RhythmMatrix | null = null;

let gameEngine: Engine | null = null;

// Helpers
function addLog(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  lobbyLogs.appendChild(entry);
  lobbyLogs.scrollTop = lobbyLogs.scrollHeight;
}

function clearLogs() {
  lobbyLogs.innerHTML = '';
}

function switchScreen(toScreen: HTMLElement) {
  [screenRole, screenLobby, screenSim].forEach(s => s.classList.remove('active'));
  toScreen.classList.add('active');
}

// 1. Role Selection Events
btnSelectDriver.addEventListener('click', () => {
  selectedRole = 'driver';
  roleIndicator.textContent = 'HYPERCAR_DRIVER';
  switchScreen(screenLobby);
  setupLobby('host');
});

btnSelectEngineer.addEventListener('click', () => {
  selectedRole = 'engineer';
  roleIndicator.textContent = 'TELEMETRY_ENGINEER';
  switchScreen(screenLobby);
  setupLobby('client');
});

btnQuickLoopback.addEventListener('click', () => {
  selectedRole = 'loopback';
  roleIndicator.textContent = 'COOP_LOOPBACK_SIM';
  switchScreen(screenSim);
  startLoopbackSimulation();
});

btnCancelLobby.addEventListener('click', () => {
  selectedRole = null;
  roleIndicator.textContent = 'BOOT_SYSTEM';
  if (p2pHost) p2pHost.close();
  if (p2pClient) p2pClient.close();
  switchScreen(screenRole);
});

// 2. PeerJS Lobby Connection Setup
function setupLobby(p2pRole: 'host' | 'client') {
  clearLogs();
  lobbyRoleBadge.textContent = p2pRole === 'host' ? '[HOST / DRIVER]' : '[CLIENT / ENGINEER]';
  
  // Show the appropriate panel view
  if (p2pRole === 'host') {
    lobbyHostView.style.display = 'flex';
    lobbyClientView.style.display = 'none';
    roomIdBadge.textContent = 'GENERAZIONE...';
    roomIdBadge.className = 'room-badge generating';
    inviteLinkInput.value = 'Attendere il codice...';
  } else {
    lobbyHostView.style.display = 'none';
    lobbyClientView.style.display = 'flex';
    joinCodeInput.value = '';
  }

  activeP2P = new P2PNetwork({ debug: true });
  
  addLog(`Inizializzazione nodo PeerJS come ${p2pRole.toUpperCase()}...`, 'info');

  activeP2P.onRoomIdGenerated = (roomId) => {
    roomIdBadge.textContent = roomId;
    roomIdBadge.className = 'room-badge';
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    inviteLinkInput.value = link;
    addLog(`Stanza creata! Codice stanza: ${roomId}`, 'success');
  };

  activeP2P.onConnectionStateChange = (state) => {
    addLog(`Stato Connessione: ${state.toUpperCase()}`, state === 'connected' ? 'success' : 'info');
    if (state === 'connected') {
      connectionDot.classList.add('active');
      connectionText.textContent = 'CONNECTED';
      connectionText.className = 'stat-val emerald';
      
      // Auto switch to Sim after connection
      setTimeout(() => {
        switchScreen(screenSim);
        startSinglePlayerSimulation(p2pRole);
      }, 1000);
    } else if (state === 'failed' || state === 'closed') {
      connectionDot.classList.remove('active');
      connectionText.textContent = 'OFFLINE';
      connectionText.className = 'stat-val crimson';
    }
  };

  activeP2P.onChannelStateChange = (state) => {
    addLog(`Stato Canale Telemetria: ${state.toUpperCase()}`, state === 'open' ? 'success' : 'info');
  };

  activeP2P.onError = (err) => {
    addLog(`ERRORE DI RETE: ${err.message}`, 'error');
  };

  activeP2P.initialize(p2pRole);
}

// Copy link to clipboard
btnCopyLink.addEventListener('click', () => {
  inviteLinkInput.select();
  inviteLinkInput.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(inviteLinkInput.value)
    .then(() => {
      addLog("Link di invito copiato negli appunti!", "success");
      const prevText = btnCopyLink.textContent;
      btnCopyLink.textContent = "COPIATO!";
      setTimeout(() => { btnCopyLink.textContent = prevText; }, 1500);
    })
    .catch(() => {
      addLog("Impossibile copiare automaticamente. Seleziona il testo manualmente.", "error");
    });
});

// Join Room handler for client
btnJoinRoom.addEventListener('click', () => {
  if (!activeP2P) return;
  const code = joinCodeInput.value.trim();
  if (!code) {
    addLog("Errore: Inserisci un codice stanza valido.", "error");
    return;
  }
  addLog(`Tentativo di connessione alla stanza: ${code}...`, "info");
  activeP2P.connect(code);
});


// 3. SIMULATION LAUNCHERS
function startSinglePlayerSimulation(role: 'host' | 'client') {
  simLayout.className = 'sim-layout'; // Fullscreen single panel
  
  track = new TrackGenerator(1337);
  gameState = createInitialGameState();
  stintManager = new StintManager(role === 'host' ? 'driver' : 'engineer');

  if (role === 'host') {
    // DRIVER SCREEN ONLY
    panelDriver.style.display = 'flex';
    panelEngineer.style.display = 'none';

    driverInput = new InputHandler();
    driverRender = new HypercarRender(driverCanvas, track, gameState, driverInput);

    window.addEventListener('resize', handleDriverResize);
    handleDriverResize();

    // Outgoing P2P Telemetry sending
    let seq = 0;
    gameEngine = new Engine({
      onUpdate: (dt) => {
        driverRender?.update(dt);
        stintManager?.update(gameState!, track!);
        updatePitStopUI('driver');
      },
      onNetworkTick: () => {
        if (activeP2P && gameState) {
          const buffer = serializeSharedGameState(gameState, ALL_BLOCKS);
          activeP2P.sendRawData(buffer);
        }
      },
      onRender: () => {
        driverRender?.render();
        updateDriverStats();
      }
    });

    activeP2P!.onDataReceived = (buf) => {
      // Receive inbound progression metrics from Engineer
      const remoteState = deserializeSharedGameState(buf, gameState!);
      gameState!.metrics = remoteState.metrics;
      gameState!.environment = remoteState.environment;
      gameState!.pitStop = remoteState.pitStop;
    };
  } else {
    // ENGINEER SCREEN ONLY
    panelDriver.style.display = 'none';
    panelEngineer.style.display = 'flex';

    engineerTelemetry = new TelemetryCanvas(engineerCanvas);
    engineerRhythm = new RhythmMatrix({
      strictMode: false,
      onMisShift: () => {
        engineerTelemetry?.triggerGlitch();
        if (gameState) gameState.environment.sensorFailures.misShift = true;
      },
      onQueueComplete: (streak, credits) => {
        if (gameState) {
          gameState.metrics.syncStreak = streak;
          gameState.metrics.dataCredits += credits;
          gameState.environment.sensorFailures.misShift = false;
        }
      }
    });

    // Handle Keyboard input for Rhythm matrix and Pitstop
    window.addEventListener('keydown', handleEngineerKeyboard);
    window.addEventListener('resize', handleEngineerResize);
    handleEngineerResize();

    gameEngine = new Engine({
      onUpdate: (dt) => {
        engineerTelemetry?.update(dt);
        if (gameState) {
          // Process ticking metrics inside rhythm matrix
          const closestNode = track!.findClosestNode(gameState.kinematics.position.x, gameState.kinematics.position.z);
          engineerRhythm?.updateTensionZone(closestNode.tensionZone);
          engineerRhythm?.update(dt, gameState);
        }
        updatePitStopUI('engineer');
      },
      onNetworkTick: () => {
        if (activeP2P && gameState) {
          // Send metrics back to Driver
          const buffer = serializeSharedGameState(gameState, BLOCK_METRICS | BLOCK_ENVIRONMENT | (gameState.pitStop?.active ? ALL_BLOCKS : 0));
          activeP2P.sendRawData(buffer);
        }
      },
      onRender: () => {
        if (gameState && engineerRhythm) {
          engineerTelemetry?.render(gameState, engineerRhythm);
        }
        updateEngineerStats();
      }
    });

    activeP2P!.onDataReceived = (buf) => {
      // Receive full kinematic updates from Driver
      deserializeSharedGameState(buf, gameState!);
    };
  }

  gameEngine.start();
}

function startLoopbackSimulation() {
  // Show side-by-side split screen
  simLayout.className = 'sim-layout split-mode';
  panelDriver.style.display = 'flex';
  panelEngineer.style.display = 'flex';

  track = new TrackGenerator(1337);
  gameState = createInitialGameState();
  stintManager = new StintManager('driver');

  driverInput = new InputHandler();
  driverRender = new HypercarRender(driverCanvas, track, gameState, driverInput);

  engineerTelemetry = new TelemetryCanvas(engineerCanvas);
  engineerRhythm = new RhythmMatrix({
    strictMode: false,
    onMisShift: () => {
      engineerTelemetry?.triggerGlitch();
      if (gameState) gameState.environment.sensorFailures.misShift = true;
    },
    onQueueComplete: (streak, credits) => {
      if (gameState) {
        gameState.metrics.syncStreak = streak;
        gameState.metrics.dataCredits += credits;
        gameState.environment.sensorFailures.misShift = false;
      }
    }
  });

  // Event handlers
  window.addEventListener('resize', handleSplitResize);
  window.addEventListener('keydown', handleEngineerKeyboard);
  handleSplitResize();

  // Create two P2PNetwork blocks
  p2pHost = new P2PNetwork({ debug: true });
  p2pClient = new P2PNetwork({ debug: true });

  p2pHost.isHost = true;
  p2pClient.isHost = false;

  // Direct memory-based P2P data transfer for 100% offline reliability
  p2pHost.sendRawData = (buf) => {
    if (p2pClient && p2pClient.onDataReceived) {
      const buffer = buf instanceof Uint8Array ? (buf.buffer as ArrayBuffer) : buf;
      p2pClient.onDataReceived(buffer);
    }
    return true;
  };

  p2pClient.sendRawData = (buf) => {
    if (p2pHost && p2pHost.onDataReceived) {
      const buffer = buf instanceof Uint8Array ? (buf.buffer as ArrayBuffer) : buf;
      p2pHost.onDataReceived(buffer);
    }
    return true;
  };

  p2pHost.onDataReceived = (buf) => {
    deserializeSharedGameState(buf, gameState!);
  };

  p2pClient.onDataReceived = (buf) => {
    const remote = deserializeSharedGameState(buf, gameState!);
    gameState!.metrics = remote.metrics;
    gameState!.environment = remote.environment;
    gameState!.pitStop = remote.pitStop;
  };

  // Simulate P2P connection instantly
  setTimeout(() => {
    connectionDot.classList.add('active');
    connectionText.textContent = 'LOCAL_LOOPBACK';
    connectionText.className = 'stat-val emerald';
    if (p2pHost!.onConnectionStateChange) p2pHost!.onConnectionStateChange('connected');
    if (p2pClient!.onConnectionStateChange) p2pClient!.onConnectionStateChange('connected');
  }, 100);

  // 60Hz Engine loop driving both systems simultaneously
  gameEngine = new Engine({
    onUpdate: (dt) => {
      driverRender?.update(dt);
      engineerTelemetry?.update(dt);
      stintManager?.update(gameState!, track!);
      
      const closestNode = track!.findClosestNode(gameState!.kinematics.position.x, gameState!.kinematics.position.z);
      engineerRhythm?.updateTensionZone(closestNode.tensionZone);
      engineerRhythm?.update(dt, gameState!);

      updatePitStopUI('loopback');
    },
    onNetworkTick: () => {
      // Loopback transfers packets via local RTCPeerConnections
      if (p2pHost && p2pClient && gameState) {
        const hostBuf = serializeSharedGameState(gameState, ALL_BLOCKS);
        p2pHost.sendRawData(hostBuf);

        const clientBuf = serializeSharedGameState(gameState, BLOCK_METRICS | BLOCK_ENVIRONMENT | (gameState.pitStop?.active ? ALL_BLOCKS : 0));
        p2pClient.sendRawData(clientBuf);
      }
    },
    onRender: () => {
      driverRender?.render();
      if (gameState && engineerRhythm) {
        engineerTelemetry?.render(gameState, engineerRhythm);
      }
      updateDriverStats();
      updateEngineerStats();
    }
  });

  gameEngine.start();
}

// 4. RESIZE & INPUT EVENT HANDLERS
function handleDriverResize() {
  if (driverCanvas && driverRender) {
    const rect = driverCanvas.parentElement!.getBoundingClientRect();
    driverRender.camera.aspect = rect.width / rect.height;
    driverRender.camera.updateProjectionMatrix();
    driverRender.renderer?.setSize(rect.width, rect.height);
  }
}

function handleEngineerResize() {
  if (engineerCanvas && engineerTelemetry) {
    engineerTelemetry.resize();
  }
}

function handleSplitResize() {
  handleDriverResize();
  handleEngineerResize();
}

function handleEngineerKeyboard(e: KeyboardEvent) {
  if (!gameState) return;

  // If pitstop minigame is active, route keypresses directly to stintManager
  if (gameState.pitStop && gameState.pitStop.active) {
    const time = performance.now();
    
    if (selectedRole === 'loopback') {
      // In loopback mode, we route the keyboard keys adaptively:
      // WASD are Driver keys, UI/Rhythm arrows/space/etc can satisfy both roles
      // To keep loopback fully playable single-handed:
      // - If the target key belongs to the current step's role, route it as such
      const step = gameState.pitStop.tireStep;
      const expectedRole = (step === 0 || step === 2) ? 'driver' : 'engineer';
      
      if (gameState.pitStop.stage === 'TIRES') {
        stintManager?.handleKeyPress(gameState, expectedRole, e.key, time);
      } else if (gameState.pitStop.stage === 'REFUEL') {
        // Space taps both roles together!
        if (e.key === ' ') {
          stintManager?.handleKeyPress(gameState, 'driver', ' ', time);
          stintManager?.handleKeyPress(gameState, 'engineer', ' ', time);
        }
      }
    } else {
      // Single player mode routing
      const currentRole = selectedRole === 'driver' ? 'driver' : 'engineer';
      stintManager?.handleKeyPress(gameState, currentRole, e.key, time);
    }
    return;
  }

  // Otherwise, route keypress to RhythmMatrix if engineer is active
  if (selectedRole === 'engineer' || selectedRole === 'loopback') {
    engineerRhythm?.handleKeyDown(e);
  }
}

// 5. STATS AND UI UPDATER ROUTINES
function updateDriverStats() {
  if (!gameState) return;
  const vel = gameState.kinematics.velocity;
  const speedKmh = Math.round(Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6);
  statSpeed.textContent = `${speedKmh} km/h`;
  
  const gears = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'];
  const gearIdx = gameState.telemetry.currentGear + 1; // -1 to 8 -> 0 to 9
  statGear.textContent = gears[gearIdx] || 'N';
  
  statRpm.textContent = `${Math.round(gameState.telemetry.rpm)} RPM`;
}

function updateEngineerStats() {
  if (!gameState) return;
  statStreak.textContent = `${gameState.metrics.syncStreak}`;
  statCredits.textContent = `${Math.round(gameState.metrics.dataCredits)}`;
  statTemp.textContent = `${gameState.wear.engine.temperature.toFixed(1)} °C`;
}

function updatePitStopUI(viewMode: 'driver' | 'engineer' | 'loopback') {
  if (!gameState || !gameState.pitStop) return;

  const pit = gameState.pitStop;
  if (!pit.active) {
    driverPitOverlay.classList.remove('active');
    engineerPitOverlay.classList.remove('active');
    return;
  }

  // 1. Configure display texts based on stage
  let stageText = '';
  let instrText = '';
  let targetText = pit.targetKey || '';
  let progressPct = 0;

  if (pit.stage === 'TIRES') {
    stageText = `STAGE 1: SOSTITUZIONE PNEUMATICI [STEP ${pit.tireStep + 1}/4]`;
    progressPct = (pit.tireStep / 4) * 100;
    
    const stepRoles = ['PILOTA [Tasti A/D]', 'INGEGNERE [Tasti I/O]', 'PILOTA [Tasti A/D]', 'INGEGNERE [Tasti I/O]'];
    instrText = `Attesa input di: ${stepRoles[pit.tireStep] || ''}`;
  } else if (pit.stage === 'REFUEL') {
    stageText = `STAGE 2: RIFORNIMENTO SIMULTANEO`;
    progressPct = (pit.fuelSyncTaps / 5) * 100;
    instrText = "Premere contemporaneamente SPAZIO (Driver ed Engineer entro 300ms)!";
    targetText = "SPAZIO";
  }

  // 2. Draw overlay to respective active screens
  if (viewMode === 'driver' || viewMode === 'loopback') {
    driverPitOverlay.classList.add('active');
    driverPitStage.textContent = stageText;
    driverPitInstr.textContent = instrText;
    driverPitTarget.textContent = targetText;
    driverPitProgress.style.width = `${progressPct}%`;
  }
  if (viewMode === 'engineer' || viewMode === 'loopback') {
    engineerPitOverlay.classList.add('active');
    engineerPitStage.textContent = stageText;
    engineerPitInstr.textContent = instrText;
    engineerPitTarget.textContent = targetText;
    engineerPitProgress.style.width = `${progressPct}%`;
  }
}

// 6. TEARDOWN
btnQuitSim.addEventListener('click', () => {
  if (confirm("Vuoi terminare la simulazione operativa?")) {
    if (gameEngine) {
      gameEngine.stop();
      gameEngine = null;
    }
    
    // Dispose WebGL renderer and textures cleanly
    if (driverRender) {
      driverRender.dispose();
      driverRender = null;
    }

    if (p2pHost) { p2pHost.close(); p2pHost = null; }
    if (p2pClient) { p2pClient.close(); p2pClient = null; }
    if (activeP2P) { activeP2P.close(); activeP2P = null; }

    window.removeEventListener('resize', handleDriverResize);
    window.removeEventListener('resize', handleEngineerResize);
    window.removeEventListener('resize', handleSplitResize);
    window.removeEventListener('keydown', handleEngineerKeyboard);

    connectionDot.classList.remove('active');
    connectionText.textContent = 'OFFLINE';
    connectionText.className = 'stat-val crimson';

    selectedRole = null;
    roleIndicator.textContent = 'BOOT_SYSTEM';
    switchScreen(screenRole);
  }
});

// 7. INITIAL DYNAMIC URL JOIN CHECK
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  if (roomCode) {
    // Wait slightly to make sure DOM is loaded and styling applies
    setTimeout(() => {
      selectedRole = 'engineer';
      roleIndicator.textContent = 'TELEMETRY_ENGINEER';
      switchScreen(screenLobby);
      setupLobby('client');
      
      const joinInput = document.getElementById('join-code-input') as HTMLInputElement;
      if (joinInput) {
        joinInput.value = roomCode;
        const btnJoin = document.getElementById('btn-join-room');
        if (btnJoin) {
          btnJoin.click();
        }
      }
    }, 200);
  }
});
