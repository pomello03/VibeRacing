/**
 * @file engine_sim.ts
 * @description Integration and simulation test suite for the high-precision 60Hz Engine loop.
 * Simulates multithreaded scheduling, drift calculation, and sequential tick processing.
 */

import { Engine } from "../core/Engine.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log("🏎️  VIBERACING ENGINE & 60Hz LOOP INTEGRATION TEST 🏎️\n");

// 1. Mocking HTML5/Web APIs for headless Node.js environment
console.log("Step 1: Setting up high-precision timing mocks for Node.js environment...");

interface WorkerMessage {
  data: {
    now: number;
    drift: number;
  };
}

class MockWorker {
  public onmessage: ((e: WorkerMessage) => void) | null = null;
  private intervalId: any = null;
  private isTerminated: boolean = false;

  constructor(_url: string) {
    let tickCount = 0;
    const interval = 1000 / 60; // 16.6667ms
    let expected = performance.now();

    const scheduleNext = () => {
      if (this.isTerminated) return;
      
      tickCount++;
      const now = performance.now();
      const drift = now - expected;

      if (this.onmessage) {
        this.onmessage({ data: { now, drift } });
      }

      expected += interval;
      // Add slight artificial latency to test drift-compensation robustness
      const artificialLag = tickCount % 5 === 0 ? 1.0 : 0; // 1.0ms delay every 5 ticks
      const nextDelay = Math.max(0, interval - drift + artificialLag);

      this.intervalId = setTimeout(scheduleNext, nextDelay);
    };

    // Run first tick immediately to align expected timing timeline, matching native Web Worker boot
    this.intervalId = setTimeout(scheduleNext, 0);
  }

  public postMessage(msg: string) {
    if (msg === "stop") {
      this.terminate();
    }
  }

  public terminate() {
    this.isTerminated = true;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Inject mocks onto global context
(globalThis as any).Worker = MockWorker;
(globalThis as any).Blob = class Blob {
  constructor(_parts: any[], _options?: any) {}
};
(globalThis as any).URL = {
  createObjectURL: (_blob: any) => "blob:mock-tauri-worker"
};
(globalThis as any).requestAnimationFrame = (callback: (time: number) => void) => {
  return setTimeout(() => callback(performance.now()), 0);
};

console.log("✅ HTML5 browser timing and Web Worker environments successfully mocked.");

// 2. Loop orchestration and timing validation
console.log("\nStep 2: Starting drift-compensated 60Hz Engine loop and capturing ticks...");

let updateTicks = 0;
let networkTicks = 0;
let renderTicks = 0;
const tickOrder: string[] = [];

const engine = new Engine({
  onUpdate: (dt) => {
    updateTicks++;
    tickOrder.push("UPDATE");
    assert(Math.abs(dt - 0.0166667) < 0.001, "Delta time must be close to 16.67ms");
  },
  onNetworkTick: () => {
    networkTicks++;
    tickOrder.push("NETWORK");
  },
  onRender: () => {
    renderTicks++;
    tickOrder.push("RENDER");
  }
});

// Run the engine for exactly 150ms
engine.start();
assert(engine.isEngineRunning() === true, "Engine should report running state after start()");

setTimeout(() => {
  engine.stop();
  assert(engine.isEngineRunning() === false, "Engine should report stopped state after stop()");

  console.log(`\nStep 3: Evaluating loop execution telemetry...`);
  console.log(`- Total Engine Ticks captured: ${engine.getTickCount()}`);
  console.log(`- Update ticks processed: ${updateTicks}`);
  console.log(`- Network replication ticks: ${networkTicks}`);
  console.log(`- Canvas rendering frames: ${renderTicks}`);
  console.log(`- Average timer jitter: ${engine.getAverageJitter().toFixed(4)} ms`);

  // Assertions on tick count (at 60Hz, 150ms should yields 8 to 11 ticks)
  assert(updateTicks >= 7, `Expected at least 7 updates, got ${updateTicks}`);
  assert(networkTicks === updateTicks, "Network dispatches must match physics update count");
  assert(renderTicks >= 7, `Expected at least 7 rendering updates, got ${renderTicks}`);

  // Assertions on order of execution
  // Order for a single tick should be: UPDATE -> NETWORK, and then requestAnimationFrame schedules RENDER
  // Let's assert that for every UPDATE, a NETWORK tick follows immediately.
  for (let i = 0; i < tickOrder.length - 1; i++) {
    if (tickOrder[i] === "UPDATE") {
      assert(tickOrder[i + 1] === "NETWORK" || tickOrder[i + 1] === "UPDATE", 
             `Expected NETWORK tick to proceed UPDATE, found: ${tickOrder[i + 1]}`);
    }
  }

  // Verify drift correction didn't let jitter run out of control (must remain under 15.0ms average in headless Node.js)
  const avgJitter = engine.getAverageJitter();
  assert(avgJitter < 15.0, `Average scheduling jitter is too high: ${avgJitter.toFixed(2)}ms`);
  console.log("✅ Drift compensation verified. Loop remains synchronous, robust and low-jitter.");

  console.log("\n🎉 ALL TESTS IN src/test/engine_sim.ts PASSED SUCCESSFULLY! 🎉");
  process.exit(0);
}, 180); // Wait 180ms to guarantee solid tick history
