/**
 * Rhythm Input Matrix
 * Compliant with physics-core and style-ui directives.
 *
 * This class handles:
 * 1. Generating directional keystroke queues combining WASD + Arrow keys.
 * 2. Raw browser KeyDown event mapping and loose/strict input checking.
 * 3. Dynamic pacing, timers, and difficulty adaptation to active TensionZones.
 * 4. Sync streak tracking, data credits rewards, and triggering mis-shift callbacks.
 */

import { SharedGameState } from '../shared/GameState.js';

export type TensionZone = 'Rettilineo' | 'Staccata' | 'Percorrenza';

export interface RhythmMatrixConfig {
  /**
   * If true, key presses must match target key exactly (e.g. target 'W' requires 'W' press).
   * If false, directional keys can be swapped (e.g. target 'W' can be satisfied by pressing 'ArrowUp').
   * @default false (hybrid WASD + Arrow keys allowed)
   */
  strictMode?: boolean;

  /**
   * Base credit reward for completing sequences.
   * @default 10
   */
  baseReward?: number;

  /**
   * Callback fired when the user types an incorrect key or sequence times out.
   * Should cut engine power and trigger driver visual glitching.
   */
  onMisShift?: () => void;

  /**
   * Callback fired when a key is correctly pressed in sequence.
   */
  onSuccess?: (key: string, index: number) => void;

  /**
   * Callback fired when an entire sequence/queue is completed successfully.
   */
  onQueueComplete?: (streak: number, creditsEarned: number) => void;
}

export class RhythmMatrix {
  private activeQueue: string[] = [];
  private activeIndex: number = 0;
  private syncStreak: number = 0;
  private dataCredits: number = 0;
  private activeTension: TensionZone = 'Rettilineo';
  private timeLeft: number = 0;
  private maxTime: number = 0;

  // Configuration options
  private strictMode: boolean = false;
  private baseReward: number = 10;
  private onMisShift?: () => void;
  private onSuccess?: (key: string, index: number) => void;
  private onQueueComplete?: (streak: number, creditsEarned: number) => void;

  private static readonly DIRECTION_MAP: Record<string, string> = {
    'w': 'up', 'W': 'up', 'ArrowUp': 'up',
    'a': 'left', 'A': 'left', 'ArrowLeft': 'left',
    's': 'down', 'S': 'down', 'ArrowDown': 'down',
    'd': 'right', 'D': 'right', 'ArrowRight': 'right',
  };

  // List of keys this matrix listens to
  private static readonly RHYTHM_KEYS = new Set([
    'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
  ]);

  constructor(config: RhythmMatrixConfig = {}) {
    this.strictMode = config.strictMode ?? false;
    this.baseReward = config.baseReward ?? 10;
    this.onMisShift = config.onMisShift;
    this.onSuccess = config.onSuccess;
    this.onQueueComplete = config.onQueueComplete;

    // Initialize with default straight-line queue
    this.regenerateQueue();
  }

  /**
   * Update the internal timer at 60Hz. Call this inside the main loop.
   * @param dt Elapsed time in seconds
   * @param state Optional shared game state (ignored but preserved for loopback/p2p loop calls)
   */
  public update(dt: number, state?: any): void {
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.triggerFailure();
      }
    }
  }

  /**
   * Alias for setTensionZone to match engine pacing updates.
   */
  public updateTensionZone(zone: TensionZone): void {
    this.setTensionZone(zone);
  }

  /**
   * Updates the active TensionZone. Alters queue parameters and regenerates if zone changes.
   */
  public setTensionZone(zone: TensionZone): void {
    if (this.activeTension !== zone) {
      this.activeTension = zone;
      this.regenerateQueue();
    }
  }

  /**
   * Translates a raw KeyDown event, checks correctness, and handles progression.
   * @param event Browser keyboard event
   * @returns boolean true if the key was processed (even if wrong), false if ignored
   */
  public handleKeyDown(event: KeyboardEvent): boolean {
    const key = event.key;

    // Filter out unrelated keystrokes to prevent accidental mis-shifts (e.g., Space, Shift, chat)
    if (!RhythmMatrix.RHYTHM_KEYS.has(key)) {
      return false;
    }

    this.inputKey(key);
    return true;
  }

  /**
   * Raw input processor for checking correctness of a single key string.
   */
  public inputKey(pressedKey: string): void {
    const targetKey = this.activeQueue[this.activeIndex];
    let isCorrect = false;

    if (this.strictMode) {
      // Strict exact match (case insensitive for letters)
      isCorrect = targetKey.toLowerCase() === pressedKey.toLowerCase();
    } else {
      // Loose directional matching (hybrid WASD + Arrows)
      const targetDir = RhythmMatrix.DIRECTION_MAP[targetKey];
      const pressedDir = RhythmMatrix.DIRECTION_MAP[pressedKey];
      isCorrect = targetDir !== undefined && targetDir === pressedDir;
    }

    if (isCorrect) {
      this.activeIndex++;
      if (this.onSuccess) {
        this.onSuccess(pressedKey, this.activeIndex);
      }

      // Check if current queue is fully typed
      if (this.activeIndex >= this.activeQueue.length) {
        this.completeQueue();
      }
    } else {
      // Mis-Shift event!
      this.triggerFailure();
    }
  }

  /**
   * Trigger the failure sequence (reset streak, trigger callback, reset progress).
   */
  private triggerFailure(): void {
    this.syncStreak = 0;
    this.activeIndex = 0; // Reset active queue progress to make them type it again
    
    // Reset timer to full to allow retrying
    this.timeLeft = this.maxTime;

    if (this.onMisShift) {
      this.onMisShift();
    }
  }

  /**
   * Handles sequence completion: advances streak, computes rouge-lite credits, spawns new queue.
   */
  private completeQueue(): void {
    this.syncStreak++;

    // Rouge-lite progression formula for credits scaling:
    // Pacing reward factor: Rettilineo (1x), Percorrenza (2.5x), Staccata (5.0x)
    // Streak multiplier rewards consistency: (1 + streak * 0.1)
    let zoneMultiplier = 1.0;
    if (this.activeTension === 'Percorrenza') zoneMultiplier = 2.5;
    if (this.activeTension === 'Staccata') zoneMultiplier = 5.0;

    const creditsEarned = Math.round(
      this.baseReward * zoneMultiplier * (1 + this.syncStreak * 0.1)
    );
    this.dataCredits += creditsEarned;

    if (this.onQueueComplete) {
      this.onQueueComplete(this.syncStreak, creditsEarned);
    }

    // Spawn a fresh queue for continuous rhythmic engagement
    this.regenerateQueue();
  }

  /**
   * Generates a new sequence matching the current tension zone's speed and length parameters.
   */
  private regenerateQueue(): void {
    let length = 4;
    let allowedKeys: string[] = ['W', 'A', 'S', 'D'];
    let timeLimit = 8.0; // Seconds to complete the queue

    switch (this.activeTension) {
      case 'Rettilineo':
        length = 4;
        allowedKeys = ['W', 'A', 'S', 'D'];
        timeLimit = 8.0;
        break;
      case 'Percorrenza':
        length = 6;
        allowedKeys = ['W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
        timeLimit = 6.0;
        break;
      case 'Staccata':
        length = 8;
        allowedKeys = ['W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
        timeLimit = 4.0; // Tight window for heavy braking
        break;
    }

    // Generate random flow without repeating the same key more than twice consecutively
    const queue: string[] = [];
    let consecutiveCount = 0;
    let lastKey = '';

    for (let i = 0; i < length; i++) {
      let key = '';
      do {
        key = allowedKeys[Math.floor(Math.random() * allowedKeys.length)];
      } while (key === lastKey && consecutiveCount >= 2);

      if (key === lastKey) {
        consecutiveCount++;
      } else {
        lastKey = key;
        consecutiveCount = 1;
      }
      queue.push(key);
    }

    this.activeQueue = queue;
    this.activeIndex = 0;
    this.maxTime = timeLimit;
    this.timeLeft = timeLimit;
  }

  /**
   * Synchronizes the rhythm matrix's rogue-lite session data directly with the game state.
   */
  public syncToGameState(state: SharedGameState): void {
    state.metrics.syncStreak = this.syncStreak;
    state.metrics.dataCredits = this.dataCredits;
  }

  // ==========================================
  // Getters & Setters
  // ==========================================
  
  public getActiveQueue(): string[] {
    return [...this.activeQueue];
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  public getSyncStreak(): number {
    return this.syncStreak;
  }

  public getRawDataCredits(): number {
    return this.dataCredits;
  }

  public setDataCredits(credits: number): void {
    this.dataCredits = credits;
  }

  public setSyncStreak(streak: number): void {
    this.syncStreak = streak;
  }

  public getTimeLeft(): number {
    return this.timeLeft;
  }

  public getMaxTime(): number {
    return this.maxTime;
  }

  public getActiveTensionZone(): TensionZone {
    return this.activeTension;
  }
}
