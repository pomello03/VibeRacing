/**
 * @file P2PNetwork.ts
 * @description High-performance Peer-to-Peer Data Connection Manager using PeerJS.
 * Optimised for 60Hz real-time binary telemetry, incorporating clock sync, jitter evaluation,
 * stint "Data Credit" scoring, and deterministic track extrusion.
 * 
 * Complies with the VibeRacing P2P Micro-Directives.
 */

declare global {
  interface Window {
    Peer: any;
  }
}

/**
 * 3D Track Point generated deterministically from a shared seed.
 */
export interface TrackPoint {
  index: number;
  x: number;
  y: number;
  z: number;
  width: number;
  curvature: number;
  elevation: number;
}

/**
 * Telemetry State Packet for ultra-low latency exchange at 60Hz.
 * Size: 44 bytes in raw binary layout.
 */
export interface TelemetryData {
  sequenceNumber: number; // 2 bytes (Uint16)
  timestamp: number;      // 8 bytes (Float64)
  positionX: number;      // 4 bytes (Float32)
  positionY: number;      // 4 bytes (Float32)
  positionZ: number;      // 4 bytes (Float32)
  yaw: number;            // 4 bytes (Float32)
  speed: number;          // 4 bytes (Float32)
  steeringInput: number;  // 4 bytes (Float32)
  throttleInput: number;  // 4 bytes (Float32)
  brakeInput: number;     // 4 bytes (Float32)
}

/**
 * P2P Network Configuration Options.
 */
export interface P2PNetworkConfig {
  iceServers?: RTCIceServer[];
  debug?: boolean;
}

/**
 * Stint Performance and Quality scoring metrics.
 */
export interface StintSummary {
  durationSeconds: number;
  totalPacketsReceived: number;
  averageScore: number;
  dataCredits: number;
}

export class P2PNetwork {
  private peer: any = null;
  private conn: any = null;
  private config: P2PNetworkConfig;
  private debug: boolean;
  public isHost: boolean = false;

  // Packet Ordering
  private sequenceOut: number = 0;
  private sequenceIn: number = -1;

  // Time Sync / NTP
  private clockOffset: number = 0; // T_receiver = T_sender + clockOffset
  private smoothedRtt: number = 0;
  private hasSyncedClock: boolean = false;
  private pingIntervalId: any = null;
  private burstTimerId: any = null;
  private pingCounter: number = 0;
  private pingHistory: Map<number, number> = new Map(); // pingId -> localSendTimestamp

  // Stint Telemetry Scoring
  private stintStartTime: number | null = null;
  private stintPacketsCount: number = 0;
  private stintScoreSum: number = 0;
  private currentSyncScore: number = 100;

  // Event Callbacks
  public onConnectionStateChange?: (state: 'connected' | 'failed' | 'closed') => void;
  public onChannelStateChange?: (state: 'open' | 'closed') => void;
  public onDataReceived?: (data: ArrayBuffer) => void;
  public onTelemetryReceived?: (telemetry: TelemetryData, syncScore: number) => void;
  public onError?: (error: Error) => void;
  public onRoomIdGenerated?: (roomId: string) => void;

  constructor(config: P2PNetworkConfig = {}) {
    this.config = config;
    this.debug = config.debug ?? false;
  }

  /**
   * Initialises the peer connection with the designated role.
   * 
   * @param role Either 'host' (creates offer & creates data channel) or 'client' (receives offer)
   */
  public initialize(role: 'host' | 'client'): void {
    this.close(); // Clean up existing sessions if any
    
    this.isHost = role === 'host';
    this.debugLog(`Initializing PeerJS node as: ${role.toUpperCase()}`);

    const PeerClass = window.Peer || (window as any).Peer;
    if (!PeerClass) {
      const error = new Error("PeerJS library is not loaded on the window object.");
      this.emitError(error);
      return;
    }

    if (this.isHost) {
      // Host generates a random operational room ID
      const cleanId = 'VIBE-' + Math.floor(10000 + Math.random() * 90000);
      this.debugLog(`Requesting Host Peer ID: ${cleanId}`);
      
      this.peer = new PeerClass(cleanId, { debug: this.debug ? 1 : 0 });

      this.peer.on('open', (id: string) => {
        this.debugLog(`Host Peer opened successfully with ID: ${id}`);
        if (this.onRoomIdGenerated) {
          this.onRoomIdGenerated(id);
        }
      });

      this.peer.on('connection', (conn: any) => {
        this.debugLog(`Incoming client connection detected from peer: ${conn.peer}`);
        this.conn = conn;
        this.setupConnectionListeners();
      });
    } else {
      // Client generates a standard random PeerJS ID in the cloud
      this.peer = new PeerClass({ debug: this.debug ? 1 : 0 });

      this.peer.on('open', (id: string) => {
        this.debugLog(`Client Peer opened successfully with temporary ID: ${id}`);
      });
    }

    this.peer.on('error', (err: any) => {
      this.debugLog(`PeerJS top-level error: ${err.type || err.message}`, err);
      const error = new Error(`Peer execution error: ${err.message || err.type || err}`);
      this.emitError(error);
    });
  }

  /**
   * Client initiates a P2P connection to the host using their room ID.
   */
  public connect(roomId: string): void {
    if (!this.peer) {
      throw new Error("PeerJS node is not initialized. Call initialize('client') first.");
    }
    
    const cleanRoomId = roomId.trim().toUpperCase();
    this.debugLog(`Initiating connection to host room: ${cleanRoomId}`);

    // Connect with reliable: false for low latency UDP-like real-time data flow
    this.conn = this.peer.connect(cleanRoomId, { reliable: false });
    this.setupConnectionListeners();
  }

  /**
   * Stubs to support backward-compatibility with manual WebRTC split-screen loopback code.
   */
  public async createOffer(): Promise<any> {
    return { type: 'offer', sdp: 'loopback' };
  }
  public async handleOffer(offer: any): Promise<any> {
    return { type: 'answer', sdp: 'loopback' };
  }
  public async handleAnswer(answer: any): Promise<void> {}
  public async addIceCandidate(candidate: any): Promise<void> {}
  public getLocalDescription(): null {
    return null;
  }

  /**
   * Configures low-level binary data channel event listeners.
   */
  private setupConnectionListeners(): void {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.debugLog(`P2P connection channel established with peer: ${this.conn.peer}`);
      this.startClockSyncHeartbeat();
      
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('connected');
      }
      if (this.onChannelStateChange) {
        this.onChannelStateChange('open');
      }
    });

    this.conn.on('close', () => {
      this.debugLog("P2P connection channel closed.");
      this.stopClockSyncHeartbeat();
      
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('closed');
      }
      if (this.onChannelStateChange) {
        this.onChannelStateChange('closed');
      }
    });

    this.conn.on('error', (err: any) => {
      this.debugLog(`Connection data-channel error: ${err.message || err}`);
      this.emitError(new Error(`Connection error: ${err.message || err}`));
    });

    this.conn.on('data', async (data: any) => {
      let buffer: ArrayBuffer;
      if (data instanceof Blob) {
        buffer = await data.arrayBuffer();
      } else if (data instanceof ArrayBuffer) {
        buffer = data;
      } else if (data && data.buffer instanceof ArrayBuffer) {
        buffer = data.buffer;
      } else if (data instanceof Uint8Array) {
        buffer = data.buffer as ArrayBuffer;
      } else {
        this.debugLog("Received non-binary data envelope. Discarding.", data);
        return;
      }
      this.handleIncomingMessage(buffer);
    });
  }

  /**
   * Alias for sendRaw to match client telemetry calls.
   */
  public sendRawData(data: ArrayBuffer | Uint8Array): boolean {
    return this.sendRaw(data);
  }

  /**
   * Sends raw binary packets across the data channel.
   * 
   * @param data ArrayBuffer or Uint8Array representing payload
   * @returns true if data was buffered successfully, false otherwise
   */
  public sendRaw(data: ArrayBuffer | Uint8Array): boolean {
    if (!this.conn || !this.conn.open) {
      this.debugLog("Attempted to send raw binary data, but Connection is closed.");
      return false;
    }

    try {
      this.conn.send(data);
      return true;
    } catch (err) {
      const error = new Error(`Failed to transmit raw packet: ${(err as Error).message}`);
      this.emitError(error);
      return false;
    }
  }

  /**
   * High-Frequency (60Hz) Telemetry transmission.
   * Prepares and serialises high-performance telemetry data structure.
   */
  public sendTelemetry(telemetry: Omit<TelemetryData, 'sequenceNumber' | 'timestamp'>): boolean {
    if (!this.conn || !this.conn.open) {
      return false;
    }
    
    // Check underlying WebRTC DataChannel buffer to avoid congestion
    const dataChannel = this.conn.dataChannel;
    if (dataChannel && dataChannel.bufferedAmount > 4096) {
      this.debugLog(`DataChannel buffer congested (${dataChannel.bufferedAmount} bytes). Dropping telemetry frame.`);
      return false;
    }

    this.sequenceOut = (this.sequenceOut + 1) & 0xFFFF; // Circular 16-bit sequence number

    const packet: TelemetryData = {
      ...telemetry,
      sequenceNumber: this.sequenceOut,
      timestamp: Date.now()
    };

    const buffer = P2PNetwork.serializeTelemetry(packet);
    return this.sendRaw(buffer);
  }

  /**
   * Process all incoming data channel message packets.
   */
  private handleIncomingMessage(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 1) return;

    const view = new DataView(buffer);
    const packetType = view.getUint8(0);

    switch (packetType) {
      case 0x01: // Telemetry Data Packet
        try {
          const telemetry = P2PNetwork.deserializeTelemetry(buffer);
          this.processTelemetryPacket(telemetry);
        } catch (err) {
          this.emitError(new Error(`Telemetry deserialization failed: ${(err as Error).message}`));
        }
        break;

      case 0x02: // Clock Sync Ping
        const t2 = Date.now();
        const pingId = view.getUint8(1);
        const t1 = view.getFloat64(2);
        const t3 = Date.now(); // Pong departure time
        
        const pong = this.createPongPacket(pingId, t1, t2, t3);
        this.sendRaw(pong);
        break;

      case 0x03: // Clock Sync Pong
        const t4 = Date.now();
        const rxPingId = view.getUint8(1);
        const txT1 = view.getFloat64(2);
        const rxT2 = view.getFloat64(10);
        const txT3 = view.getFloat64(18);

        const localSendTime = this.pingHistory.get(rxPingId);
        if (localSendTime !== undefined && localSendTime === txT1) {
          this.pingHistory.delete(rxPingId);
          
          // NTP Time calculations
          const rtt = (t4 - txT1) - (txT3 - rxT2);
          if (rtt >= 0 && rtt <= 1000) {
            const offset = ((rxT2 - txT1) + (txT3 - t4)) / 2;
            this.applyClockSync(offset, rtt);
          }
        }
        break;

      default:
        // Pass custom packet buffers onto parent application
        if (this.onDataReceived) {
          this.onDataReceived(buffer);
        }
        break;
    }
  }

  /**
   * Evaluates packet delay, drops late UDP frames, and scores jitter/sync accuracy.
   */
  private processTelemetryPacket(telemetry: TelemetryData): void {
    const tArrival = Date.now();
    const tSender = telemetry.timestamp;

    // 1. Circular packet sequence verification to handle UDP-like unordered out-of-order frames
    const diff = (telemetry.sequenceNumber - this.sequenceIn) & 0xFFFF;
    if (this.sequenceIn !== -1 && !(diff > 0 && diff < 32768)) {
      // Packet is stale/older than what we've already processed. Drop it to prevent temporal jumpback.
      this.debugLog(`Stale packet dropped. Last Seq=${this.sequenceIn}, Packet Seq=${telemetry.sequenceNumber}`);
      return;
    }
    this.sequenceIn = telemetry.sequenceNumber;

    // 2. Telemetry latency estimation (using our NTP synchronized clock offset)
    const estimatedOneWayLatency = tArrival - (tSender + this.clockOffset);

    // 3. Telemetry jitter estimation compared to symmetrical one-way propagation delay
    const targetLatency = this.smoothedRtt / 2;
    const syncJitter = Math.abs(estimatedOneWayLatency - targetLatency);

    // 4. Calculate Sync Accuracy Score for this frame (100% ideal, drops as jitter increases)
    // A sync error of 0ms gives 100%. An error of 25ms or higher gives 0%.
    const packetScore = Math.max(0, 100 - syncJitter * 4);

    // Exponential smoothing of the active scoring percentage
    this.currentSyncScore = (this.currentSyncScore * 0.95) + (packetScore * 0.05);

    // 5. Stint telemetry synchronization record
    if (this.stintStartTime !== null) {
      this.stintPacketsCount++;
      this.stintScoreSum += packetScore;
    }

    // Callback event triggers
    if (this.onTelemetryReceived) {
      this.onTelemetryReceived(telemetry, this.currentSyncScore);
    }
    if (this.onDataReceived) {
      this.onDataReceived(P2PNetwork.serializeTelemetry(telemetry));
    }
  }

  /**
   * Initializes burst NTP sync on connection open, transitioning into standard heartbeats.
   */
  private startClockSyncHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.burstTimerId) {
      clearInterval(this.burstTimerId);
      this.burstTimerId = null;
    }

    let initialBurstCount = 0;

    // Rapid burst (5 pings at 100ms spacing) to settle time offset instantly
    this.burstTimerId = setInterval(() => {
      if (!this.conn || !this.conn.open) {
        clearInterval(this.burstTimerId);
        this.burstTimerId = null;
        return;
      }
      this.transmitPing();
      initialBurstCount++;
      if (initialBurstCount >= 5) {
        clearInterval(this.burstTimerId);
        this.burstTimerId = null;

        // Transition into standard 2-second heartbeat maintenance loop
        this.pingIntervalId = setInterval(() => {
          if (this.conn && this.conn.open) {
            this.transmitPing();
          }
        }, 2000);
      }
    }, 100);
  }

  private stopClockSyncHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.burstTimerId) {
      clearInterval(this.burstTimerId);
      this.burstTimerId = null;
    }
  }

  private transmitPing(): void {
    if (!this.conn || !this.conn.open) return;

    this.pingCounter = (this.pingCounter + 1) % 256;
    const t1 = Date.now();
    this.pingHistory.set(this.pingCounter, t1);

    const pingPacket = this.createPingPacket(this.pingCounter, t1);
    this.sendRaw(pingPacket);
  }

  private applyClockSync(offset: number, rtt: number): void {
    if (!this.hasSyncedClock) {
      // Direct assignment for fast calibration
      this.clockOffset = offset;
      this.smoothedRtt = rtt;
      this.hasSyncedClock = true;
    } else {
      // Exponential filtering of NTP metrics to filter network delay spikes/variance
      this.smoothedRtt = (this.smoothedRtt * 0.85) + (rtt * 0.15);
      this.clockOffset = (this.clockOffset * 0.85) + (offset * 0.15);
    }

    this.debugLog(`NTP Synced. RTT=${this.smoothedRtt.toFixed(1)}ms, Offset=${this.clockOffset.toFixed(1)}ms`);
  }

  // --- Stint Tracking ---

  public startStint(): void {
    this.stintStartTime = Date.now();
    this.stintPacketsCount = 0;
    this.stintScoreSum = 0;
    this.debugLog("Telemetry synchronization stint started.");
  }

  public endStint(): StintSummary {
    if (this.stintStartTime === null) {
      return { durationSeconds: 0, totalPacketsReceived: 0, averageScore: 100, dataCredits: 0 };
    }

    const durationSeconds = (Date.now() - this.stintStartTime) / 1000;
    this.stintStartTime = null;

    const totalPacketsReceived = this.stintPacketsCount;
    const averageScore = totalPacketsReceived > 0
      ? this.stintScoreSum / totalPacketsReceived
      : 100;

    // Calculate Data Credits: Quality ratio * duration seconds
    const dataCredits = durationSeconds * (averageScore / 100);

    const summary: StintSummary = {
      durationSeconds: parseFloat(durationSeconds.toFixed(2)),
      totalPacketsReceived,
      averageScore: parseFloat(averageScore.toFixed(2)),
      dataCredits: parseFloat(dataCredits.toFixed(3))
    };

    this.debugLog(`Stint Completed. Duration=${summary.durationSeconds}s, SyncScore=${summary.averageScore}%, DataCredits=${summary.dataCredits}`);
    return summary;
  }

  // --- Track Extrusion ---

  /**
   * Deterministically extrudes a 3D spline track using a shared random seed.
   * Both host and client calculate the identical track nodes with mathematical parity.
   */
  public static generateTrackFromSeed(seed: number, numSegments: number = 100): TrackPoint[] {
    // Deterministic Mulberry32 algorithm
    let s = seed;
    const rng = () => {
      let t = s += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const track: TrackPoint[] = [];
    let x = 0, y = 0, z = 0;
    let yaw = 0, pitch = 0;

    for (let i = 0; i < numSegments; i++) {
      const length = 20 + rng() * 30;              // 20 to 50 meter step length
      const dYaw = (rng() - 0.5) * 0.7;           // Curved deflection
      const dPitch = (rng() - 0.5) * 0.08;        // Elevation shift

      yaw += dYaw;
      pitch += dPitch;

      // Limit pitch depth for track drivability
      pitch = Math.max(-0.2, Math.min(0.2, pitch));

      const dx = length * Math.cos(pitch) * Math.sin(yaw);
      const dy = length * Math.sin(pitch);
      const dz = length * Math.cos(pitch) * Math.cos(yaw);

      x += dx;
      y += dy;
      z += dz;

      const width = 9 + rng() * 6;                // Fluctuate track width deterministically
      const elevation = y;

      track.push({
        index: i,
        x: parseFloat(x.toFixed(3)),
        y: parseFloat(y.toFixed(3)),
        z: parseFloat(z.toFixed(3)),
        width: parseFloat(width.toFixed(3)),
        curvature: parseFloat(dYaw.toFixed(4)),
        elevation: parseFloat(elevation.toFixed(3))
      });
    }

    return track;
  }

  // --- Packet Handlers ---

  public static serializeTelemetry(data: TelemetryData): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    view.setUint8(0, 0x01); // 0x01 = Telemetry Packet ID
    view.setUint8(1, 0x00);
    view.setUint16(2, data.sequenceNumber);
    view.setFloat64(4, data.timestamp);
    view.setFloat32(12, data.positionX);
    view.setFloat32(16, data.positionY);
    view.setFloat32(20, data.positionZ);
    view.setFloat32(24, data.yaw);
    view.setFloat32(28, data.speed);
    view.setFloat32(32, data.steeringInput);
    view.setFloat32(36, data.throttleInput);
    view.setFloat32(40, data.brakeInput);

    return buffer;
  }

  public static deserializeTelemetry(buffer: ArrayBuffer): TelemetryData {
    const view = new DataView(buffer);
    const type = view.getUint8(0);
    if (type !== 0x01) {
      throw new Error(`Incorrect packet layout logic: expected 0x01, got ${type}`);
    }

    return {
      sequenceNumber: view.getUint16(2),
      timestamp: view.getFloat64(4),
      positionX: view.getFloat32(12),
      positionY: view.getFloat32(16),
      positionZ: view.getFloat32(20),
      yaw: view.getFloat32(24),
      speed: view.getFloat32(28),
      steeringInput: view.getFloat32(32),
      throttleInput: view.getFloat32(36),
      brakeInput: view.getFloat32(40)
    };
  }

  private createPingPacket(pingId: number, t1: number): ArrayBuffer {
    const buffer = new ArrayBuffer(10);
    const view = new DataView(buffer);
    view.setUint8(0, 0x02); // 0x02 = Ping ID
    view.setUint8(1, pingId);
    view.setFloat64(2, t1);
    return buffer;
  }

  private createPongPacket(pingId: number, t1: number, t2: number, t3: number): ArrayBuffer {
    const buffer = new ArrayBuffer(26);
    const view = new DataView(buffer);
    view.setUint8(0, 0x03); // 0x03 = Pong ID
    view.setUint8(1, pingId);
    view.setFloat64(2, t1);
    view.setFloat64(10, t2);
    view.setFloat64(18, t3);
    return buffer;
  }

  // --- Diagnostics ---

  public getSyncStats(): { offset: number; rtt: number; currentSyncScore: number } {
    return {
      offset: parseFloat(this.clockOffset.toFixed(2)),
      rtt: parseFloat(this.smoothedRtt.toFixed(2)),
      currentSyncScore: parseFloat(this.currentSyncScore.toFixed(2))
    };
  }

  private debugLog(msg: string, ...optionalParams: any[]): void {
    if (this.debug) {
      console.log(`[P2PNetwork][${new Date().toISOString()}] ${msg}`, ...optionalParams);
    }
  }

  private emitError(err: Error): void {
    if (this.onError) {
      this.onError(err);
    }
  }

  /**
   * Resets active configurations, closing active DataConnections and PeerJS node.
   */
  public close(): void {
    this.debugLog("Terminating P2PNetwork Session");
    this.stopClockSyncHeartbeat();

    if (this.conn) {
      try {
        this.conn.close();
      } catch (e) {}
      this.conn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }

    this.hasSyncedClock = false;
    this.pingHistory.clear();
    this.stintStartTime = null;
    this.sequenceIn = -1;
    this.sequenceOut = 0;
  }
}
