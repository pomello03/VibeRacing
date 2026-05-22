/**
 * Telemetry Canvas Rendering Engine
 * Compliant with physics-core and style-ui directives.
 *
 * Direct Canvas 2D telemetry dashboard utilizing:
 * - Ketchapp Style: Solid charcoal panels, rounded borders, clear state bars, color wear thresholds.
 * - VectorHeart Style: Asymmetrical diagonal cuts, blocky Y2K typography, deep black/blue tones, racing red details.
 * - Interactive dynamics: Full camera shake, scanlines, digital glitch overlay, and sensor failure blocks.
 */

import { SharedGameState } from '../shared/GameState.js';
import { RhythmMatrix, TensionZone } from './RhythmMatrix.js';

export class TelemetryCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private glitchTimeRemaining: number = 0;
  private totalGlitchDuration: number = 0.4; // Seconds
  private flashTimer: number = 0;

  // Logical coordinate system to allow responsive scaling
  private static readonly LOGICAL_WIDTH = 800;
  private static readonly LOGICAL_HEIGHT = 600;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  /**
   * Resizes the canvas buffer relative to its bounds, handling high-DPI scaling (retina).
   */
  public resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    if (this.canvas.style) {
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  }

  /**
   * Triggers the visual glitch sequence (shakes camera, overlays scanlines and diagonal slashes).
   */
  public triggerGlitch(): void {
    this.glitchTimeRemaining = this.totalGlitchDuration;
  }

  /**
   * Updates visual transition state values (flashing timers, glitch decay).
   * @param dt Elapsed time in seconds
   */
  public update(dt: number): void {
    if (this.glitchTimeRemaining > 0) {
      this.glitchTimeRemaining -= dt;
    }
    this.flashTimer += dt;
  }

  /**
   * Renders the telemetry board to the canvas context.
   * @param state Synchronized SharedGameState block
   * @param rhythm RhythmMatrix instance tracking typing progression
   */
  public render(state: SharedGameState, rhythm: RhythmMatrix): void {
    if (!state || !rhythm) return;

    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width || 800;
    const cssHeight = rect.height || 600;
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

    const ctx = this.ctx;

    // 1. Clear Screen using Physical Pixels
    ctx.save();
    ctx.fillStyle = '#030712'; // Deepest midnight gray background
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. High-DPI Scaling & Responsive Logical Viewport mapping
    ctx.scale(dpr, dpr);
    const scaleX = cssWidth / TelemetryCanvas.LOGICAL_WIDTH;
    const scaleY = cssHeight / TelemetryCanvas.LOGICAL_HEIGHT;
    ctx.scale(scaleX, scaleY);

    // Render VectorHeart high-contrast asymmetric grid lines on background
    this.drawVectorHeartGrid();

    // 3. Shake effect on Mis-Shift
    if (this.glitchTimeRemaining > 0) {
      const shakeMagnitude = 8 * (this.glitchTimeRemaining / this.totalGlitchDuration);
      const shakeX = (Math.random() - 0.5) * shakeMagnitude;
      const shakeY = (Math.random() - 0.5) * shakeMagnitude;
      ctx.translate(shakeX, shakeY);
    }

    // 4. Render Layout Blocks
    this.renderHeader(state, rhythm);
    if (state.pitStop && state.pitStop.active) {
      this.renderPitStopOverlay(state);
    } else {
      this.renderPowertrain(state);
      this.renderChassisWear(state);
      this.renderERSAndAux(state);
      this.renderRhythmStrip(rhythm);
    }

    // 5. Render Glitch Overlay over the screen
    if (this.glitchTimeRemaining > 0) {
      this.renderGlitchOverlay();
    }

    ctx.restore();
  }

  // ==========================================
  // Layout Panel Rendering Methods
  // ==========================================

  /**
   * Renders the header panel (VectorHeart Y2K styled angled bar).
   */
  private renderHeader(state: SharedGameState, rhythm: RhythmMatrix): void {
    const ctx = this.ctx;
    const x = 15;
    const y = 15;
    const w = 770;
    const h = 50;

    // Asymmetric panel cut top-left/bottom-right
    this.drawAsymmetricPanel(ctx, x, y, w, h, 12, '#0A0F1D', '#FF003C', 2);

    // Optical white text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 16px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('VIBE RACING // TELEMETRY CORRELATOR LINK', x + 20, y + h / 2);

    // Sync metrics on the right side
    const streak = rhythm.getSyncStreak();
    const credits = rhythm.getRawDataCredits();

    ctx.textAlign = 'right';
    ctx.font = '900 15px "Courier New", Courier, monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('SYNC: ', x + w - 240, y + h / 2);

    // Racing red streak badge
    ctx.fillStyle = streak > 0 ? '#00FF66' : '#FF003C';
    ctx.fillText(`x${streak.toString().padStart(2, '0')}`, x + w - 195, y + h / 2);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('   CREDITS: ', x + w - 120, y + h / 2);
    ctx.fillStyle = '#FF003C'; // Racing red details
    ctx.fillText(`${credits.toFixed(0)} CR`, x + w - 20, y + h / 2);
  }

  /**
   * Renders the Powertrain block containing Speed, Gear, RPM, Throttle/Brake gauges (Ketchapp style).
   */
  private renderPowertrain(state: SharedGameState): void {
    const ctx = this.ctx;
    const x = 15;
    const y = 80;
    const w = 375;
    const h = 225;

    // Flat charcoal block with thick rounded borders (Ketchapp style)
    ctx.fillStyle = '#1F2937';
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 3;
    this.drawRoundRect(ctx, x, y, w, h, 8, true, true);

    const f = state.environment.sensorFailures;

    // 1. SPEED DISPLAY (Impact style massive numbers)
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VEHICLE VELOCITY', x + 20, y + 25);

    if (f.velocity) {
      this.drawSensorFailureBlock(ctx, x + 20, y + 35, 180, 50, 'SPD SENSOR ERR');
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 38px "Impact", "Arial Black", sans-serif';
      const speedKmh = Math.round(this.vectorLength(state.kinematics.velocity) * 3.6);
      ctx.fillText(`${speedKmh} KM/H`, x + 20, y + 70);
    }

    // 2. GEAR DISPLAY (Huge blocky numbers)
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GEAR', x + 295, y + 25);

    const gx = x + 255;
    const gy = y + 35;
    const gw = 80;
    const gh = 80;

    if (f.currentGear) {
      this.drawSensorFailureBlock(ctx, gx, gy, gw, gh, 'ERR');
    } else {
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = '#FF003C';
      ctx.lineWidth = 2;
      this.drawRoundRect(ctx, gx, gy, gw, gh, 6, true, true);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 48px "Impact", sans-serif';
      ctx.textBaseline = 'middle';
      const gear = state.telemetry.currentGear;
      let gearStr = gear.toString();
      if (gear === 0) gearStr = 'N';
      if (gear === -1) gearStr = 'R';
      ctx.fillText(gearStr, gx + gw / 2, gy + gh / 2);
      ctx.textBaseline = 'alphabetic'; // reset
    }

    // 3. RPM BAR METER (Flat Ketchapp segments)
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENGINE REV RPM', x + 20, y + 105);

    const rx = x + 20;
    const ry = y + 115;
    const rw = 335;
    const rh = 20;

    if (f.rpm) {
      this.drawSensorFailureBlock(ctx, rx, ry, rw, rh, 'RPM MULTIPLEX FAIL');
    } else {
      // RPM background
      ctx.fillStyle = '#111827';
      ctx.fillRect(rx, ry, rw, rh);

      const maxRpm = 15000;
      const redlineRpm = 12000;
      const currentRpm = state.telemetry.rpm;
      const segments = 15;
      const segmentWidth = (rw - (segments - 1) * 2) / segments;

      const litSegments = Math.min(segments, Math.floor((currentRpm / maxRpm) * segments));

      for (let s = 0; s < segments; s++) {
        const segX = rx + s * (segmentWidth + 2);
        const isLit = s < litSegments;

        if (isLit) {
          const rpmValue = (s / segments) * maxRpm;
          if (rpmValue >= redlineRpm) {
            ctx.fillStyle = '#FF003C'; // Over rev / Redline
          } else if (rpmValue >= redlineRpm * 0.8) {
            ctx.fillStyle = '#F59E0B'; // Shift warning yellow
          } else {
            ctx.fillStyle = '#00FF66'; // Green bands
          }
        } else {
          ctx.fillStyle = '#374151'; // Unlit segment
        }
        ctx.fillRect(segX, ry, segmentWidth, rh);
      }
    }

    // 4. THROTTLE & BRAKE INPUT GAUGE BARS (Flat blocks)
    // Throttle label
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.fillText('THROTTLE', x + 20, y + 155);

    const tx = x + 20;
    const ty = y + 165;
    const tw = 335;
    const th = 12;

    if (f.throttle) {
      this.drawSensorFailureBlock(ctx, tx, ty, tw, th, 'THR LINK ERR');
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = '#00FF66';
      ctx.fillRect(tx, ty, tw * state.telemetry.throttle, th);
    }

    // Brake label
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('BRAKE DEP', x + 20, y + 195);

    const bx = x + 20;
    const by = y + 205;
    const bw = 335;
    const bh = 12;

    if (f.brake) {
      this.drawSensorFailureBlock(ctx, bx, by, bw, bh, 'BRK SENSOR DECAY');
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#FF003C';
      ctx.fillRect(bx, by, bw * state.telemetry.brake, bh);
    }
  }

  /**
   * Renders the Chassis and Component Wear Panel (Tires FL/FR/RL/RR wear, brakes, temp).
   */
  private renderChassisWear(state: SharedGameState): void {
    const ctx = this.ctx;
    const x = 410;
    const y = 80;
    const w = 375;
    const h = 225;

    // Flat charcoal block with thick rounded borders (Ketchapp style)
    ctx.fillStyle = '#1F2937';
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 3;
    this.drawRoundRect(ctx, x, y, w, h, 8, true, true);

    // Chassis center coordinate
    const cx = x + 150;
    const cy = y + 105;

    // Renders physical chassis outline (VectorHeart arcade visual style)
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4B5563';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2); // Cockpit center
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - 8, cy - 40, 16, 28); // Nose cone
    ctx.moveTo(cx - 8, cy - 12);
    ctx.lineTo(cx - 20, cy - 4);
    ctx.lineTo(cx - 20, cy + 12);
    ctx.lineTo(cx - 8, cy + 22); // Left pod
    ctx.moveTo(cx + 8, cy - 12);
    ctx.lineTo(cx + 20, cy - 4);
    ctx.lineTo(cx + 20, cy + 12);
    ctx.lineTo(cx + 8, cy + 22); // Right pod
    ctx.rect(cx - 24, cy + 28, 48, 8); // Wing bar
    ctx.stroke();

    const f = state.environment.sensorFailures;
    const wear = state.wear;

    // Renders 4 corner tires (FL, FR, RL, RR)
    const tireW = 22;
    const tireH = 34;

    const renderTire = (tx: number, ty: number, wearVal: number, label: string) => {
      if (f.tires) {
        this.drawSensorFailureBlock(ctx, tx, ty, tireW, tireH, '?');
        return;
      }

      // Color mapping: Pristine (White) -> Worn (Yellow) -> Blown (Racing Red)
      let tireColor = '#FFFFFF';
      if (wearVal >= 0.7) {
        tireColor = '#FF003C';
      } else if (wearVal >= 0.35) {
        tireColor = '#F59E0B';
      }

      ctx.fillStyle = '#111827';
      ctx.strokeStyle = tireColor;
      ctx.lineWidth = 2.5;

      // Shape adaptation based on wear level: Worn tyres get structurally jagged!
      if (wearVal >= 0.75) {
        // Jagged, vibrating shredding path
        ctx.beginPath();
        const steps = 8;
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + tireW, ty);
        
        // Right side jagged
        for (let s = 1; s <= steps; s++) {
          const py = ty + (s / steps) * tireH;
          const px = tx + tireW + (Math.sin(s * 4.5 + this.flashTimer * 25) * 1.5);
          ctx.lineTo(px, py);
        }
        ctx.lineTo(tx, ty + tireH);
        
        // Left side jagged
        for (let s = steps - 1; s >= 0; s--) {
          const py = ty + (s / steps) * tireH;
          const px = tx + (Math.sin(s * 3.5 + this.flashTimer * 25) * 1.5);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Safe rounded tyre
        this.drawRoundRect(ctx, tx, ty, tireW, tireH, 4, true, true);
        
        // Draw wear lines (treads) inside the tire for medium wear
        if (wearVal >= 0.35) {
          ctx.strokeStyle = '#4B5563';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(tx + 5, ty + 10); ctx.lineTo(tx + tireW - 5, ty + 10);
          ctx.moveTo(tx + 5, ty + 17); ctx.lineTo(tx + tireW - 5, ty + 17);
          ctx.moveTo(tx + 5, ty + 24); ctx.lineTo(tx + tireW - 5, ty + 24);
          ctx.stroke();
        }
      }

      // Draw digital wear percent labels next to tires
      ctx.fillStyle = tireColor;
      ctx.font = '900 9px "Courier New", monospace';
      ctx.textAlign = tx < cx ? 'right' : 'left';
      const textX = tx < cx ? tx - 6 : tx + tireW + 6;
      ctx.fillText(`${Math.round(wearVal * 100)}%`, textX, ty + tireH / 2 + 3);
    };

    // Arrange corners geometrically around the chassis
    renderTire(cx - 48, cy - 44, wear.tires.frontLeft, 'FL');
    renderTire(cx + 26, cy - 44, wear.tires.frontRight, 'FR');
    renderTire(cx - 48, cy + 10, wear.tires.rearLeft, 'RL');
    renderTire(cx + 26, cy + 10, wear.tires.rearRight, 'RR');

    // Auxiliary brakes indicator bars (FL, FR, RL, RR)
    const renderBrakeBias = (bx: number, by: number, wearVal: number) => {
      if (f.brakes) return;
      ctx.fillStyle = '#374151';
      ctx.fillRect(bx, by, 3, 20);
      ctx.fillStyle = wearVal >= 0.7 ? '#FF003C' : '#FFFFFF';
      ctx.fillRect(bx, by + (1 - wearVal) * 20, 3, wearVal * 20);
    };
    renderBrakeBias(cx - 55, cy - 37, wear.brakes.frontLeft);
    renderBrakeBias(cx + 52, cy - 37, wear.brakes.frontRight);
    renderBrakeBias(cx - 55, cy + 17, wear.brakes.rearLeft);
    renderBrakeBias(cx + 52, cy + 17, wear.brakes.rearRight);

    // ENGINE WEAR AND TEMPERATURE STATUS BLOCK
    const sx = x + 250;
    const sy = y + 25;
    const sw = 105;
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.fillText('ENGINE MAP', sx, sy);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 16px "Courier New", monospace';
    ctx.fillText(`MAP ${state.telemetry.engineMap} (MAX)`, sx, sy + 18);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.fillText('ENGINE TEMP', sx, sy + 52);

    if (f.engineTemp) {
      this.drawSensorFailureBlock(ctx, sx, sy + 58, sw, 30, 'TEMP: ERR');
    } else {
      const temp = wear.engine.temperature;
      let tempColor = '#00FF66';
      if (temp >= 115) tempColor = '#FF003C';
      else if (temp >= 100) tempColor = '#F59E0B';
      else if (temp < 60) tempColor = '#38BDF8';

      ctx.fillStyle = tempColor;
      ctx.font = '900 18px "Impact", sans-serif';
      ctx.fillText(`${temp.toFixed(1)}°C`, sx, sy + 74);
    }

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.fillText('ENGINE WEAR', sx, sy + 108);

    if (f.engineWear) {
      this.drawSensorFailureBlock(ctx, sx, sy + 114, sw, 25, 'WEAR: ERR');
    } else {
      const engWear = wear.engine.wear;
      ctx.fillStyle = engWear >= 0.7 ? '#FF003C' : '#FFFFFF';
      ctx.font = '900 18px "Impact", sans-serif';
      ctx.fillText(`${Math.round(engWear * 100)}%`, sx, sy + 130);
    }
  }

  /**
   * Renders the ERS Battery Capacity and Environment details (Middle Panel).
   */
  private renderERSAndAux(state: SharedGameState): void {
    const ctx = this.ctx;
    const x = 15;
    const y = 315;
    const w = 770;
    const h = 70;

    // Flat charcoal block with thick rounded borders (Ketchapp style)
    ctx.fillStyle = '#1F2937';
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 3;
    this.drawRoundRect(ctx, x, y, w, h, 8, true, true);

    const f = state.environment.sensorFailures;

    // ERS battery cell graphic on the left
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ERS KINETIC STORAGE UNIT', x + 20, y + 22);

    const bx = x + 20;
    const by = y + 30;
    const bw = 480;
    const bh = 22;

    if (f.ersLevel) {
      this.drawSensorFailureBlock(ctx, bx, by, bw, bh, 'ERS DIAGNOSTIC DISCONNECTED');
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(bx, by, bw, bh);

      // Gradient style Ketchapp flat bar
      ctx.fillStyle = '#06B6D4'; // cyan
      ctx.fillRect(bx, by, bw * state.telemetry.ersLevel, bh);

      // Percentage label inside
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CAPACITY: ${Math.round(state.telemetry.ersLevel * 100)}%`, bx + bw / 2, by + bh / 2 + 4);
    }

    // Rubber marbles accumulation details on the right
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 11px "Courier New", monospace';
    ctx.fillText('RUBBER MARBLES', x + 530, y + 22);

    if (f.rubberMarbles) {
      this.drawSensorFailureBlock(ctx, x + 530, y + 30, 220, bh, 'MARBLES: ERR');
    } else {
      const marbles = state.environment.rubberMarbles;
      ctx.fillStyle = marbles >= 0.5 ? '#FF003C' : '#FFFFFF';
      ctx.font = '900 18px "Impact", sans-serif';
      ctx.fillText(`${(marbles * 100).toFixed(1)}% GRIP LOSS`, x + 530, y + 48);
    }
  }

  /**
   * Renders the Rhythm Input Strip panel (VectorHeart Y2K styled, asymmetrical angled boxes).
   */
  private renderRhythmStrip(rhythm: RhythmMatrix): void {
    const ctx = this.ctx;
    const x = 15;
    const y = 395;
    const w = 770;
    const h = 190;

    // VectorHeart deep black/blue panel with screaming racing red border
    this.drawAsymmetricPanel(ctx, x, y, w, h, 20, '#020617', '#FF003C', 3);

    // Active Tension Zone Badge
    const zone = rhythm.getActiveTensionZone();
    let zoneColor = '#F59E0B'; // Percorrenza yellow
    if (zone === 'Rettilineo') zoneColor = '#00FF66'; // Green
    if (zone === 'Staccata') zoneColor = '#FF003C'; // Red

    ctx.fillStyle = zoneColor;
    ctx.font = '900 12px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`[ TENSION ZONE: ${zone.toUpperCase()} ]`, x + 25, y + 28);

    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'right';
    ctx.fillText('INPUT SYSTEM: HYBRID WASD + ARROW KEY MATRIX', x + w - 25, y + 28);

    // Renders the key sequences
    const queue = rhythm.getActiveQueue();
    const activeIndex = rhythm.getActiveIndex();

    const boxW = 52;
    const boxH = 52;
    const gap = 12;
    const totalLength = queue.length * boxW + (queue.length - 1) * gap;
    const startX = x + (w - totalLength) / 2;
    const startY = y + 55;

    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      const kx = startX + i * (boxW + gap);
      const ky = startY;

      const isCompleted = i < activeIndex;
      const isActive = i === activeIndex;

      // Draw key block background
      if (isCompleted) {
        ctx.fillStyle = '#059669'; // Emerald green
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 2;
        this.drawAsymmetricPanel(ctx, kx, ky, boxW, boxH, 8, '#059669', '#34D399', 2);
      } else if (isActive) {
        // Pulsing racing red highlight using flash timer
        const pulse = Math.abs(Math.sin(this.flashTimer * 12)) * 3;
        this.drawAsymmetricPanel(ctx, kx - pulse / 2, ky - pulse / 2, boxW + pulse, boxH + pulse, 8, '#7F1D1D', '#FF003C', 3);
      } else {
        // Muted gray
        this.drawAsymmetricPanel(ctx, kx, ky, boxW, boxH, 8, '#1E293B', '#475569', 1.5);
      }

      // Draw key symbol icon (as Y2K blocky arrows or bold letters)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 18px "Courier New", Courier, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const renderKey = this.translateKeySymbol(k);
      ctx.fillText(renderKey, kx + boxW / 2, ky + boxH / 2 + 1);
      ctx.textBaseline = 'alphabetic'; // reset
    }

    // Decaying pacing progress bar
    const barW = 400;
    const barH = 8;
    const barX = x + (w - barW) / 2;
    const barY = y + 130;

    const timeLeft = rhythm.getTimeLeft();
    const maxTime = rhythm.getMaxTime();
    const timePct = maxTime > 0 ? Math.max(0, Math.min(1, timeLeft / maxTime)) : 0;

    ctx.fillStyle = '#1E293B';
    ctx.fillRect(barX, barY, barW, barH);

    // Draining racing red bar
    let barColor = '#FF003C';
    if (timePct < 0.35) {
      // Rapid flashing on low time
      const isRed = Math.floor(this.flashTimer * 12) % 2 === 0;
      barColor = isRed ? '#FF003C' : '#7F1D1D';
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barW * timePct, barH);

    ctx.fillStyle = '#64748B';
    ctx.font = '900 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STINT PACE TIMEOUT BUFFER', x + w / 2, barY + 24);
  }

  /**
   * Renders the flashing visual glitch effects, scanlines, and the large diagonal MIS-SHIFT slash.
   */
  private renderGlitchOverlay(): void {
    const ctx = this.ctx;
    const w = TelemetryCanvas.LOGICAL_WIDTH;
    const h = TelemetryCanvas.LOGICAL_HEIGHT;

    // 1. Overlay semi-transparent cyan/red splits
    ctx.fillStyle = 'rgba(255, 0, 60, 0.15)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw CRT horizontal scan lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < h; i += 6) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }

    // 3. Draw static noise blocks
    const glitchBlocks = 12;
    for (let i = 0; i < glitchBlocks; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#FF003C' : '#00FFFF';
      const bx = Math.random() * w;
      const by = Math.random() * h;
      const bw = Math.random() * 200 + 40;
      const bh = Math.random() * 15 + 4;
      ctx.fillRect(bx, by, bw, bh);
    }

    // 4. Large diagonal screaming red banner
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.06); // slight rotation slant

    ctx.fillStyle = '#FF003C';
    ctx.fillRect(-450, -45, 900, 90);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.strokeRect(-450, -45, 900, 90);

    // Flashing warning text
    const textFlash = Math.floor(this.flashTimer * 16) % 2 === 0;
    ctx.fillStyle = textFlash ? '#FFFFFF' : '#FF80A0';
    ctx.font = '900 28px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!!! MIS-SHIFT // ENGINE POWER CUT !!!', 0, 0);

    ctx.restore();
  }

  // ==========================================
  // Helper Drawing Methods
  // ==========================================

  /**
   * Translates key names into clean Y2K arrow signs or characters.
   */
  private translateKeySymbol(key: string): string {
    switch (key) {
      case 'ArrowUp': return '▲';
      case 'ArrowDown': return '▼';
      case 'ArrowLeft': return '◀';
      case 'ArrowRight': return '▶';
      default: return key.toUpperCase();
    }
  }

  /**
   * Helper to draw a sensor failure block filled with diagonal hazard caution lines.
   */
  private drawSensorFailureBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    errorMsg: string
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // Dark navy warning background
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(x, y, w, h);

    // Yellow warning hazard slashes
    ctx.strokeStyle = '#EAB308';
    ctx.lineWidth = 4;
    const spacing = 12;
    for (let i = -h; i < w + h; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }

    // High contrast error message box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x + 5, y + h / 2 - 10, w - 10, 20);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(errorMsg, x + w / 2, y + h / 2 + 1);

    ctx.restore();
  }

  /**
   * Computes the vector length (absolute velocity in m/s).
   */
  private vectorLength(v: { x: number; y: number; z: number }): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /**
   * Draws a rounded rectangle path. Works on all browser versions (with roundRect fallback).
   */
  private drawRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill = true,
    stroke = true
  ): void {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
    }
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  /**
   * Draws a VectorHeart styled asymmetric panel with custom diagonal cuts.
   */
  private drawAsymmetricPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    cut: number,
    fillColor: string,
    borderColor: string,
    borderW: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderW;
    ctx.stroke();
  }

  /**
   * Renders VectorHeart-style high-contrast asymmetric background grid and crimson diagonal cuts.
   */
  private drawVectorHeartGrid(): void {
    const ctx = this.ctx;
    const w = TelemetryCanvas.LOGICAL_WIDTH;
    const h = TelemetryCanvas.LOGICAL_HEIGHT;

    // 1. Draw slate gray grid lines (15% opacity)
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.15)';
    ctx.lineWidth = 1.0;
    
    // Vertical grid lines
    const gridSpacing = 40;
    for (let x = 0; x < w; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Horizontal grid lines
    for (let y = 0; y < h; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. High-contrast asymmetrical neon crimson diagonal cuts / vector lines (VectorHeart style)
    ctx.strokeStyle = '#FF003C';
    ctx.lineWidth = 1.5;

    // Cut 1: Bottom-left corner diagonal slice
    ctx.beginPath();
    ctx.moveTo(0, h - 120);
    ctx.lineTo(120, h);
    ctx.stroke();

    // Secondary offset line for tech aesthetic
    ctx.strokeStyle = 'rgba(255, 0, 60, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, h - 130);
    ctx.lineTo(130, h);
    ctx.stroke();

    // Cut 2: Top-right corner diagonal slice
    ctx.strokeStyle = '#FF003C';
    ctx.beginPath();
    ctx.moveTo(w - 180, 0);
    ctx.lineTo(w, 180);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 0, 60, 0.4)';
    ctx.beginPath();
    ctx.moveTo(w - 190, 0);
    ctx.lineTo(w, 190);
    ctx.stroke();

    // Cut 3: Subtle tech cross-hair indicator lines
    ctx.strokeStyle = 'rgba(255, 0, 60, 0.3)';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 30, h / 2);
    ctx.lineTo(w / 2 + 30, h / 2);
    ctx.moveTo(w / 2, h / 2 - 30);
    ctx.lineTo(w / 2, h / 2 + 30);
    ctx.stroke();
  }

  /**
   * Renders a highly immersive pit stop HUD overlay when pitStop.active is true.
   */
  private renderPitStopOverlay(state: SharedGameState): void {
    const ctx = this.ctx;
    const pit = state.pitStop!;

    // 1. LEFT PANEL: "TIRE MOUNT STATION" (Ketchapp Style rounded block)
    const lx = 15;
    const ly = 80;
    const lw = 375;
    const lh = 360;

    ctx.fillStyle = '#1F2937';
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 3;
    this.drawRoundRect(ctx, lx, ly, lw, lh, 8, true, true);

    // Header
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PIT STOP OPERATIONS // TIRE ASSEMBLY', lx + 20, ly + 25);

    // Chassis center coordinate
    const cx = lx + 187;
    const cy = ly + 180;

    // Renders physical chassis outline
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4B5563';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - 8, cy - 40, 16, 28);
    ctx.moveTo(cx - 8, cy - 12);
    ctx.lineTo(cx - 20, cy - 4);
    ctx.lineTo(cx - 20, cy + 12);
    ctx.lineTo(cx - 8, cy + 22);
    ctx.moveTo(cx + 8, cy - 12);
    ctx.lineTo(cx + 20, cy - 4);
    ctx.lineTo(cx + 20, cy + 12);
    ctx.lineTo(cx + 8, cy + 22);
    ctx.rect(cx - 24, cy + 28, 48, 8);
    ctx.stroke();

    const tireW = 24;
    const tireH = 38;

    const renderPitTire = (tx: number, ty: number, isDone: boolean, isActive: boolean, keyLabel: string, label: string) => {
      let tireColor = '#374151'; // Pending (grey)
      let borderW = 2;
      if (isDone) {
        tireColor = '#00FF66'; // Mounted (green)
      } else if (isActive) {
        // Pulsing active tire
        const pulse = Math.abs(Math.sin(this.flashTimer * 12));
        tireColor = pulse > 0.5 ? '#FF003C' : '#F59E0B'; // Flashing Red/Amber
        borderW = 3;
      }

      ctx.fillStyle = '#111827';
      ctx.strokeStyle = tireColor;
      ctx.lineWidth = borderW;
      this.drawRoundRect(ctx, tx, ty, tireW, tireH, 5, true, true);

      // Label inside if done
      if (isDone) {
        ctx.fillStyle = '#00FF66';
        ctx.font = '900 9px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('OK', tx + tireW / 2, ty + tireH / 2 + 3);
      } else if (isActive) {
        // Draw key prompt bubble above or next to it
        ctx.save();
        const bubbleX = tx < cx ? tx - 25 : tx + tireW + 25;
        const bubbleY = ty + tireH / 2;

        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 12px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(keyLabel.toUpperCase(), bubbleX, bubbleY + 1);
        ctx.restore();
      }

      // Tire name label (FL, FR, etc.)
      ctx.fillStyle = isActive ? '#FFFFFF' : '#9CA3AF';
      ctx.font = '900 10px "Courier New", monospace';
      ctx.textAlign = tx < cx ? 'right' : 'left';
      const nameX = tx < cx ? tx - 6 : tx + tireW + 6;
      ctx.fillText(label, nameX, ty - 5);
    };

    const tireStep = pit.tireStep;
    const tires = pit.tires;

    // We fetch pre-generated keys if they exist in state, else fallbacks
    const flKey = tires?.frontLeft.targetKey || pit.targetKey || 'F';
    const frKey = tires?.frontRight.targetKey || 'J';
    const rlKey = tires?.rearLeft.targetKey || 'R';
    const rrKey = tires?.rearRight.targetKey || 'K';

    renderPitTire(cx - 52, cy - 46, tireStep > 0, tireStep === 0, flKey, 'FL');
    renderPitTire(cx + 28, cy - 46, tireStep > 1, tireStep === 1, frKey, 'FR');
    renderPitTire(cx - 52, cy + 12, tireStep > 2, tireStep === 2, rlKey, 'RL');
    renderPitTire(cx + 28, cy + 12, tireStep > 3, tireStep === 3, rrKey, 'RR');

    // 2. RIGHT PANEL: "OPERATIONS & FUEL STAGE" (Ketchapp Style)
    const rx = 410;
    const ry = 80;
    const rw = 375;
    const rh = 360;

    ctx.fillStyle = '#1F2937';
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 3;
    this.drawRoundRect(ctx, rx, ry, rw, rh, 8, true, true);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '900 12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TASK LIST & REFUEL LOG', rx + 20, ry + 25);

    if (pit.stage === 'TIRES') {
      // List the 4 tires step-by-step
      const drawTaskLine = (tx: number, ty: number, label: string, isDone: boolean, isActive: boolean, role: string, keyLabel: string) => {
        ctx.fillStyle = isDone ? 'rgba(16, 185, 129, 0.15)' : isActive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(31, 41, 55, 0.5)';
        ctx.fillRect(tx, ty, 335, 45);
        ctx.strokeStyle = isDone ? '#10B981' : isActive ? '#F59E0B' : '#374151';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx, ty, 335, 45);

        ctx.fillStyle = isDone ? '#10B981' : isActive ? '#FFFFFF' : '#6B7280';
        ctx.font = '900 12px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label, tx + 15, ty + 25);

        ctx.textAlign = 'right';
        if (isDone) {
          ctx.fillStyle = '#10B981';
          ctx.fillText('[ MOUNTED ]', tx + 320, ty + 25);
        } else if (isActive) {
          ctx.fillStyle = '#FF003C';
          ctx.font = '900 12px "Courier New", monospace';
          ctx.fillText(`${role.toUpperCase()}: PRESS [ ${keyLabel.toUpperCase()} ]`, tx + 320, ty + 25);
        } else {
          ctx.fillStyle = '#4B5563';
          ctx.fillText('[ PENDING ]', tx + 320, ty + 25);
        }
      };

      drawTaskLine(rx + 20, ry + 50, '1. FRONT LEFT TIRE', tireStep > 0, tireStep === 0, 'driver', flKey);
      drawTaskLine(rx + 20, ry + 110, '2. FRONT RIGHT TIRE', tireStep > 1, tireStep === 1, 'engineer', frKey);
      drawTaskLine(rx + 20, ry + 170, '3. REAR LEFT TIRE', tireStep > 2, tireStep === 2, 'driver', rlKey);
      drawTaskLine(rx + 20, ry + 230, '4. REAR RIGHT TIRE', tireStep > 3, tireStep === 3, 'engineer', rrKey);

      // Status indicator at bottom
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '900 11px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('NEXT OPERATING STAGE: HIGH-PRESSURE REFUELING', rx + 20, ry + 315);
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('STATUS: WORK IN PROGRESS...', rx + 20, ry + 332);

    } else if (pit.stage === 'REFUEL') {
      // Render refueling active status
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '900 12px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('STAGE 2: FUEL CELL SYNC CHARGE', rx + 20, ry + 60);

      // Cyan ketchapp fuel bar
      const fx = rx + 20;
      const fy = ry + 85;
      const fw = 335;
      const fh = 45;

      ctx.fillStyle = '#111827';
      ctx.fillRect(fx, fy, fw, fh);

      const fuelPct = pit.fuelSyncTaps / 5;
      ctx.fillStyle = '#06B6D4'; // Fuel Cyan
      ctx.fillRect(fx, fy, fw * fuelPct, fh);

      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx, fy, fw, fh);

      // Text in fuel bar
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 14px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`FUEL SYNC LEVEL: ${Math.round(fuelPct * 100)}%`, fx + fw / 2, fy + fh / 2 + 5);

      // Simultaneous Taps indicators
      const dotY = ry + 175;
      const dotW = 55;
      const dotH = 25;
      const dotGap = 15;
      const dotStartX = rx + 20;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '900 11px "Courier New", monospace';
      ctx.fillText('SYNCHRONIZED DEPOSITS:', rx + 20, ry + 160);

      for (let i = 0; i < 5; i++) {
        const dx = dotStartX + i * (dotW + dotGap);
        const isSynced = i < pit.fuelSyncTaps;

        ctx.fillStyle = isSynced ? '#06B6D4' : '#111827';
        ctx.strokeStyle = isSynced ? '#22D3EE' : '#374151';
        ctx.lineWidth = 1.5;
        this.drawRoundRect(ctx, dx, dotY, dotW, dotH, 4, true, true);

        ctx.fillStyle = isSynced ? '#000000' : '#4B5563';
        ctx.font = '900 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`TAP ${i + 1}`, dx + dotW / 2, dotY + dotH / 2 + 4);
      }

      // Coordinated tap instructions
      ctx.save();
      const instructY = ry + 245;
      this.drawAsymmetricPanel(ctx, rx + 20, instructY, 335, 75, 10, '#020617', '#FF003C', 2);

      const pulse = Math.abs(Math.sin(this.flashTimer * 10));
      ctx.fillStyle = pulse > 0.4 ? '#FFFFFF' : '#FF80A0';
      ctx.font = '900 13px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('COORDINATED INJECTION REQUIRED!', rx + 187, instructY + 28);
      ctx.fillStyle = '#06B6D4';
      ctx.font = '900 11px "Courier New", monospace';
      ctx.fillText('PRESS [ SPACE ] AT THE SAME INSTANT', rx + 187, instructY + 50);
      ctx.restore();
    }

    // 3. BOTTOM PANEL: "PIT ACTIONS CONTROL STRIP" (VectorHeart style)
    const bx = 15;
    const by = 455;
    const bw = 770;
    const bh = 130;

    this.drawAsymmetricPanel(ctx, bx, by, bw, bh, 15, '#020617', '#FF003C', 3);

    // Warning strip pattern on left and right borders
    ctx.save();
    ctx.rect(bx + 5, by + 5, bw - 10, bh - 10);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 0, 60, 0.15)';
    ctx.lineWidth = 6;
    for (let i = -bh; i < bw + bh; i += 18) {
      ctx.beginPath();
      ctx.moveTo(bx + i, by);
      ctx.lineTo(bx + i + bh, by + bh);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#FF003C';
    ctx.font = '900 12px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('[ SYSTEM INTERACTION: PIT-STOP MECHANICS ]', bx + 25, by + 28);

    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'right';
    ctx.fillText('COOPERATIVE PIT GAME SYSTEM', bx + bw - 25, by + 28);

    // Large center actions instructions text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (pit.stage === 'TIRES') {
      const activeRole = (tireStep === 0 || tireStep === 2) ? 'DRIVER' : 'ENGINEER';
      const activeKeyName = (pit.targetKey || '').toUpperCase();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 20px "Courier New", Courier, monospace';
      ctx.fillText(`CURRENT WORKER: ${activeRole}`, bx + bw / 2, by + 65);

      ctx.fillStyle = '#00FF66';
      ctx.font = '900 16px "Courier New", Courier, monospace';
      ctx.fillText(`>>> ACTUATOR PRESS KEY: [ ${activeKeyName} ] <<<`, bx + bw / 2, by + 95);

    } else if (pit.stage === 'REFUEL') {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 20px "Courier New", Courier, monospace';
      ctx.fillText('STAGE 2: FUEL INJECTION PRESSURE TAPS', bx + bw / 2, by + 65);

      ctx.fillStyle = '#22D3EE';
      ctx.font = '900 16px "Courier New", Courier, monospace';
      ctx.fillText(`>>> BOTH INJECTORS PRESS: [ SPACE ] (${pit.fuelSyncTaps}/5 SYNCED) <<<`, bx + bw / 2, by + 95);
    }
    ctx.textBaseline = 'alphabetic'; // reset
  }
}
