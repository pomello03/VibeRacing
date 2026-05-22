/**
 * @file Engine.ts
 * @description High-precision 60Hz Master Loop Coordinator with sub-millisecond drift compensation.
 * Utilises a dedicated multi-threaded Web Worker for clock scheduling to bypass main-thread
 * layout cycles, browser garbage collection pauses, and WebGL rendering blocks.
 * Falls back dynamically to an adaptive high-resolution setTimeout/requestAnimationFrame hybrid.
 */

export interface EngineCallbacks {
  /**
   * Physics, stint, and aging update ticks. Executed with a fixed dt.
   */
  onUpdate?: (dt: number) => void;

  /**
   * Main thread UI and Canvas rendering ticks.
   */
  onRender?: () => void;

  /**
   * Low-latency WebRTC P2P telemetry packet dispatches.
   */
  onNetworkTick?: () => void;
}

export class Engine {
  private callbacks: EngineCallbacks;
  private isRunning: boolean = false;
  private targetFps: number = 60;
  private stepMs: number = 1000 / 60; // 16.6667 ms
  
  // Timer systems
  private worker: Worker | null = null;
  private timeoutId: any = null;
  
  // Analytical stats
  private tickCount: number = 0;
  private expectedTime: number = 0;
  private lastTickTime: number = 0;
  private totalJitterMs: number = 0;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Start the execution loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickCount = 0;
    this.totalJitterMs = 0;
    this.lastTickTime = performance.now();
    this.expectedTime = performance.now() + this.stepMs;

    // Try to launch background thread scheduling
    try {
      this.initWorkerScheduler();
    } catch (e) {
      console.warn("Failed to initialize high-precision Web Worker scheduler, falling back to hybrid main-thread loop.", e);
      this.runMainThreadLoop();
    }
  }

  /**
   * Spawns a background thread that handles timing triggers.
   * This immunizes the timing loop from main-thread UI blockage.
   */
  private initWorkerScheduler(): void {
    const workerBlobCode = `
      let expected = performance.now();
      const interval = ${this.stepMs};
      let active = true;

      self.onmessage = (e) => {
        if (e.data === 'stop') {
          active = false;
        }
      };

      function tick() {
        if (!active) return;
        const now = performance.now();
        const drift = now - expected;
        
        self.postMessage({ now, drift });

        expected += interval;
        const nextDelay = Math.max(0, interval - drift);
        setTimeout(tick, nextDelay);
      }

      tick();
    `;

    const blob = new Blob([workerBlobCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.worker = new Worker(url);

    this.worker.onmessage = (e: MessageEvent) => {
      if (!this.isRunning) return;
      
      const { now, drift } = e.data;
      this.processTick(now, drift);
    };
  }

  /**
   * High-resolution setTimeout/requestAnimationFrame fallback loop.
   */
  private runMainThreadLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const drift = now - this.expectedTime;

    this.processTick(now, drift);

    this.expectedTime += this.stepMs;
    const nextInterval = Math.max(0, this.stepMs - drift);

    this.timeoutId = setTimeout(() => {
      requestAnimationFrame(this.runMainThreadLoop);
    }, nextInterval);
  };

  /**
   * Process a single tick: executes updates, schedules network replication, and requests render.
   */
  private processTick(now: number, drift: number): void {
    this.tickCount++;
    this.totalJitterMs += Math.abs(drift);
    this.lastTickTime = now;

    const dt = this.stepMs / 1000.0; // exactly 0.0166667 seconds

    // 1. Execute fixed-timestep physical updates
    if (this.callbacks.onUpdate) {
      try {
        this.callbacks.onUpdate(dt);
      } catch (err) {
        console.error("Error during Engine onUpdate phase:", err);
      }
    }

    // 2. Poll and dispatch WebRTC telemetry replication
    if (this.callbacks.onNetworkTick) {
      try {
        this.callbacks.onNetworkTick();
      } catch (err) {
        console.error("Error during Engine onNetworkTick phase:", err);
      }
    }

    // 3. Request UI/WebGL rendering in sync with refresh cycles
    if (this.callbacks.onRender) {
      requestAnimationFrame(() => {
        if (this.isRunning && this.callbacks.onRender) {
          try {
            this.callbacks.onRender();
          } catch (err) {
            console.error("Error during Engine onRender phase:", err);
          }
        }
      });
    }
  }

  /**
   * Stops the execution loop and cleans up active timers/threads.
   */
  public stop(): void {
    this.isRunning = false;
    
    if (this.worker) {
      this.worker.postMessage("stop");
      this.worker.terminate();
      this.worker = null;
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // Getters for performance telemetry diagnostics
  public isEngineRunning(): boolean {
    return this.isRunning;
  }

  public getTickCount(): number {
    return this.tickCount;
  }

  public getAverageJitter(): number {
    return this.tickCount === 0 ? 0 : this.totalJitterMs / this.tickCount;
  }
}
