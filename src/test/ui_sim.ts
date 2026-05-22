/**
 * VibeRacing Engineer UI & Rhythm Matrix Simulation Test Suite
 * Validates dynamic sequence pacing, WASD + Arrow mapping, sync streak multipliers,
 * mis-shift penalties, sensor failure hazard stripes, and canvas rendering pipelines.
 */

import { RhythmMatrix } from "../engineer/RhythmMatrix.js";
import { TelemetryCanvas } from "../engineer/TelemetryCanvas.js";
import { createInitialGameState, SharedGameState } from "../shared/GameState.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log("🏎️  VIBERACING ENGINEER UI & RHYTHM MATRIX VALIDATION TEST 🏎️\n");

// 1. Mocking browser Canvas objects for Node testing environment
console.log("Step 1: Constructing mock browser DOM and Canvas context...");
class MockContext2D {
  public save() {}
  public restore() {}
  public translate() {}
  public scale() {}
  public rotate() {}
  public clearRect() {}
  public fillRect() {}
  public strokeRect() {}
  public fillText() {}
  public stroke() {}
  public fill() {}
  public beginPath() {}
  public closePath() {}
  public moveTo() {}
  public lineTo() {}
  public arc() {}
  public arcTo() {}
  public rect() {}
  public clip() {}
  public setLineDash() {}
  public measureText() { return { width: 40 }; }
  public createLinearGradient() { return { addColorStop() {} }; }
  public drawImage() {}
  public quadraticCurveTo() {}
  public bezierCurveTo() {}
  
  // Properties
  public fillStyle: string = "";
  public strokeStyle: string = "";
  public lineWidth: number = 1;
  public font: string = "";
  public textAlign: string = "";
  public textBaseline: string = "";
  public shadowColor: string = "";
  public shadowBlur: number = 0;
  public globalAlpha: number = 1.0;
}

class MockCanvas {
  public width: number = 800;
  public height: number = 600;
  public devicePixelRatio = 2;
  private ctx = new MockContext2D();

  public getContext(type: string) {
    if (type === "2d") return this.ctx;
    return null;
  }
  
  public getBoundingClientRect() {
    return { width: 800, height: 600 };
  }
}

const mockCanvas = new MockCanvas() as unknown as HTMLCanvasElement;
console.log("✅ Mock HTMLCanvasElement and CanvasRenderingContext2D generated successfully.");

// 2. Rhythm Matrix Queue Generation & Difficulty Settings
console.log("\nStep 2: Checking RhythmMatrix dynamic parameter scaling per TensionZone...");
const rhythm = new RhythmMatrix({
  baseReward: 100
});

// Rettilineo (Straight)
rhythm.setTensionZone("Rettilineo");
assert(rhythm.getActiveQueue().length === 4, "Rettilineo sequence length should be 4");
assert(rhythm.getMaxTime() === 8.0, "Rettilineo max typing window should be 8.0s");

// Staccata (Braking)
rhythm.setTensionZone("Staccata");
assert(rhythm.getActiveQueue().length === 8, "Staccata sequence length should be 8");
assert(rhythm.getMaxTime() === 4.0, "Staccata max typing window should be 4.0s");

// Percorrenza (Cornering)
rhythm.setTensionZone("Percorrenza");
assert(rhythm.getActiveQueue().length === 6, "Percorrenza sequence length should be 6");
assert(rhythm.getMaxTime() === 6.0, "Percorrenza max typing window should be 6.0s");
console.log("✅ Pacing parameters are correctly bound to track geometry.");

// 3. Keystroke Mapping and Correct Hits Progression
console.log("\nStep 3: Simulating a sequence of correct keyboard strokes...");
rhythm.setTensionZone("Rettilineo");
const initialQueue = [...rhythm.getActiveQueue()];
console.log(`- Active Queue: ${JSON.stringify(initialQueue)}`);

// Simulating pressing correct keys one by one
for (let i = 0; i < initialQueue.length; i++) {
  const keyToPress = initialQueue[i];
  const handled = rhythm.handleKeyDown({ key: keyToPress } as KeyboardEvent);
  assert(handled === true, `Key '${keyToPress}' should be handled`);
}

// Completed queue should reward credits and increment streak
assert(rhythm.getSyncStreak() === 1, "Completed sequence should increment syncStreak to 1");
assert(rhythm.getRawDataCredits() > 0, "Completed sequence should reward non-zero Data Credits");
assert(rhythm.getActiveIndex() === 0, "Completed sequence should reset active cursor to index 0");
console.log(`✅ Sequence completed. Streak: ${rhythm.getSyncStreak()}, Credits: ${rhythm.getRawDataCredits().toFixed(1)}`);

// 4. Keyboard Mis-Shift & Penalty resets
console.log("\nStep 4: Simulating a keystroke Mis-Shift and timing penalties...");
let misShiftFired: any = false;
const rhythmWithPenalty = new RhythmMatrix({
  onMisShift: () => {
    misShiftFired = true;
  }
});

// Set sequence
rhythmWithPenalty.setTensionZone("Rettilineo");
// Complete first key to establish non-zero index
const targetDir = rhythmWithPenalty.getActiveQueue()[0];
const keyToPress = targetDir;
rhythmWithPenalty.handleKeyDown({ key: keyToPress } as KeyboardEvent);
assert(rhythmWithPenalty.getActiveIndex() === 1, "Rhythm active index should advance to 1");

// Now input an incorrect key to trigger Mis-Shift
const nextTarget = rhythmWithPenalty.getActiveQueue()[1];
const wrongKey = nextTarget.toLowerCase() === "w" ? "S" : "W";
const handledWrong = rhythmWithPenalty.handleKeyDown({ key: wrongKey } as KeyboardEvent);
assert(handledWrong === true, "Incorrect vocabulary key should be handled");
assert(rhythmWithPenalty.getActiveIndex() === 0, "Mis-shift should reset active index back to 0");
assert(rhythmWithPenalty.getSyncStreak() === 0, "Mis-shift should reset syncStreak to 0");
assert(misShiftFired === true, "Mis-shift callback (onMisShift) was not invoked");
console.log("✅ Key down Mis-Shift penalty successfully reset inputs.");

// Timeouts
console.log("\nStep 5: Simulating a queue timeout penalty...");
let timeoutFired: any = false;
const rhythmWithTimeout = new RhythmMatrix({
  onMisShift: () => {
    timeoutFired = true;
  }
});
rhythmWithTimeout.setTensionZone("Rettilineo");
// Update elapsed delta larger than maxTime (8.0s)
rhythmWithTimeout.update(8.5);
assert(timeoutFired === true, "Timeout penalty should trigger mis-shift callback");
assert(rhythmWithTimeout.getActiveIndex() === 0, "Timeout should reset active index");
console.log("✅ Sequence timer depletion successfully triggered penalty.");

// 5. Canvas Drawing pipeline validation
console.log("\nStep 6: Executing complete Canvas 2D telemetry rendering ticks...");
const canvas = new TelemetryCanvas(mockCanvas);
const state = createInitialGameState();

// Initial draw
canvas.update(0.016); // 16ms frame delta
canvas.render(state, rhythm);

// Trigger a mis-shift glitch frame and draw again
console.log("- Triggering mock CRT and Screen Shaking glitch filters...");
canvas.triggerGlitch();
canvas.update(0.016);
canvas.render(state, rhythm);

// Trigger a sensor failure and draw
console.log("- Injecting sensor wear failure hazard stripes...");
state.environment.sensorFailures.tires = true;
state.wear.tires.frontLeft = 0.85; // Heavy shattered shape
canvas.update(0.016);
canvas.render(state, rhythm);

console.log("✅ Canvas rendering loop executed with 0 exceptions.");

console.log("\n🚀 All VibeRacing UI & Rhythm Matrix validations completed with 100% success!");
process.exit(0);
