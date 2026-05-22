/**
 * VibeRacing Input Handler
 * Handles Gamepad API polling with deadzones, and keyboard fallbacks with interpolation.
 */

export class InputHandler {
  // Public normalized control values
  public steering: number = 0.0; // -1.0 to 1.0
  public throttle: number = 0.0; // 0.0 to 1.0
  public brake: number = 0.0;    // 0.0 to 1.0
  public isLocked: boolean = false;

  // Keyboard state tracking
  private activeKeys: Set<string> = new Set<string>();
  private keyboardSteering: number = 0.0;
  private keyboardThrottle: number = 0.0;
  private keyboardBrake: number = 0.0;

  // Smoothing rates (units per second)
  private readonly steerRate: number = 6.0;
  private readonly pedalRate: number = 8.0;

  // Store bound event listeners for cleanup
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;

  // Gamepad Decoupling & GC spike caching
  private gamepadIntervalId: any = null;
  private cachedGpSteering: number = 0.0;
  private cachedGpThrottle: number = 0.0;
  private cachedGpBrake: number = 0.0;
  private cachedGpActive: boolean = false;

  constructor() {
    // Bind handlers to retain lexical 'this'
    this.onKeyDown = (e: KeyboardEvent) => {
      this.activeKeys.add(e.key);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.activeKeys.delete(e.key);
    };

    // Attach keyboard event listeners if in a browser context
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);

      // Decouple Gamepad polling to setInterval at 60Hz (~16ms)
      this.gamepadIntervalId = setInterval(() => {
        this.pollGamepad();
      }, 16);
    }
  }

  /**
   * Private Gamepad polling routine run on a decoupled async loop.
   * Extracts values into pre-allocated fields to prevent GC allocations.
   */
  private pollGamepad(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return;
    }

    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[0];

    if (!gamepad) {
      this.cachedGpActive = false;
      return;
    }

    let active = false;
    let steering = 0.0;
    let throttle = 0.0;
    let brake = 0.0;

    // Steering: axis 0 with 0.05 deadzone
    const rawSteer = gamepad.axes[0] || 0.0;
    if (Math.abs(rawSteer) >= 0.05) {
      steering = (rawSteer - Math.sign(rawSteer) * 0.05) / (1.0 - 0.05);
      active = true;
    }

    // Throttle: right trigger (button 7 or axis 5)
    let rawThrottle = 0.0;
    if (gamepad.buttons && gamepad.buttons[7]) {
      rawThrottle = gamepad.buttons[7].value;
    } else if (gamepad.axes[5] !== undefined) {
      rawThrottle = (gamepad.axes[5] + 1.0) / 2.0;
    }
    if (rawThrottle > 0.01) {
      throttle = Math.min(1.0, Math.max(0.0, rawThrottle));
      active = true;
    }

    // Brake: left trigger (button 6 or axis 4)
    let rawBrake = 0.0;
    if (gamepad.buttons && gamepad.buttons[6]) {
      rawBrake = gamepad.buttons[6].value;
    } else if (gamepad.axes[4] !== undefined) {
      rawBrake = (gamepad.axes[4] + 1.0) / 2.0;
    }
    if (rawBrake > 0.01) {
      brake = Math.min(1.0, Math.max(0.0, rawBrake));
      active = true;
    }

    this.cachedGpSteering = steering;
    this.cachedGpThrottle = throttle;
    this.cachedGpBrake = brake;
    this.cachedGpActive = active;
  }

  /**
   * Cleans up keyboard event listeners to prevent resource leaks.
   */
  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
    }
    if (this.gamepadIntervalId) {
      clearInterval(this.gamepadIntervalId);
      this.gamepadIntervalId = null;
    }
    this.activeKeys.clear();
  }

  /**
   * Polls the Gamepad API and updates smoothed keyboard inputs.
   * Calculates the final input values for steering, throttle, and brake.
   * @param dt Delta time in seconds since the last update (default: 0.016 for 60Hz)
   */
  public update(dt: number = 0.016): void {
    if (this.isLocked) {
      this.steering = 0.0;
      this.throttle = 0.0;
      this.brake = 1.0;
      return;
    }

    // 1. Process Keyboard Targets
    let targetSteer = 0.0;

    if (this.activeKeys.has('a') || this.activeKeys.has('A') || this.activeKeys.has('ArrowLeft')) {
      targetSteer -= 1.0;
    }
    if (this.activeKeys.has('d') || this.activeKeys.has('D') || this.activeKeys.has('ArrowRight')) {
      targetSteer += 1.0;
    }

    let targetThrottle = 0.0;
    if (this.activeKeys.has('w') || this.activeKeys.has('W') || this.activeKeys.has('ArrowUp')) {
      targetThrottle = 1.0;
    }

    let targetBrake = 0.0;
    if (this.activeKeys.has('s') || this.activeKeys.has('S') || this.activeKeys.has('ArrowDown')) {
      targetBrake = 1.0;
    }

    // 2. Smooth/Average Keyboard Inputs
    // Linear interpolation towards the target key presses
    if (this.keyboardSteering < targetSteer) {
      this.keyboardSteering = Math.min(targetSteer, this.keyboardSteering + this.steerRate * dt);
    } else if (this.keyboardSteering > targetSteer) {
      this.keyboardSteering = Math.max(targetSteer, this.keyboardSteering - this.steerRate * dt);
    }

    if (this.keyboardThrottle < targetThrottle) {
      this.keyboardThrottle = Math.min(targetThrottle, this.keyboardThrottle + this.pedalRate * dt);
    } else if (this.keyboardThrottle > targetThrottle) {
      this.keyboardThrottle = Math.max(targetThrottle, this.keyboardThrottle - this.pedalRate * dt);
    }

    if (this.keyboardBrake < targetBrake) {
      this.keyboardBrake = Math.min(targetBrake, this.keyboardBrake + this.pedalRate * dt);
    } else if (this.keyboardBrake > targetBrake) {
      this.keyboardBrake = Math.max(targetBrake, this.keyboardBrake - this.pedalRate * dt);
    }

    // 3. Read cached Gamepad values from the decoupled loop
    const gpSteering = this.cachedGpSteering;
    const gpThrottle = this.cachedGpThrottle;
    const gpBrake = this.cachedGpBrake;
    const gpActive = this.cachedGpActive;

    // 4. Input Arbitration
    // If a gamepad input is actively sending signals, prioritize Gamepad.
    // If no gamepad signals are active, fall back to the smoothed keyboard signals.
    if (gpActive) {
      this.steering = gpSteering;
      this.throttle = gpThrottle;
      this.brake = gpBrake;
    } else {
      this.steering = this.keyboardSteering;
      this.throttle = this.keyboardThrottle;
      this.brake = this.keyboardBrake;
    }

    // Strict clamping to guard bounds
    this.steering = Math.min(1.0, Math.max(-1.0, this.steering));
    this.throttle = Math.min(1.0, Math.max(0.0, this.throttle));
    this.brake = Math.min(1.0, Math.max(0.0, this.brake));
  }
}
