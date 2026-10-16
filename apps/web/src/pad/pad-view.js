// Live pad renderer (phase 6 S2.2).
//
// Draws only the grid and trace. The accessible text — axis names, legend,
// confidence banner, flag labels — lives in the DOM, not only on the canvas.
// Nothing animates: every update is a static redraw, so reduced-motion is
// satisfied by construction.

import { isTrustworthy, mapPitch, mapResonance, padPoint } from "./pad-model.js";

const MARGIN = { left: 44, right: 12, top: 12, bottom: 28 };
const PITCH_TICKS = [100, 200, 400, 800];
const RESONANCE_TICKS = [-6, -3, 0, 3, 6];

export const PAD_TEXT = {
  pitchAxis: "Pitch (Hz)",
  resonanceAxis: "Resonance (semitones)",
  legend: "Pitch: circles. Resonance: squares.",
  lowConfidence: {
    heading: "These results are not trustworthy yet",
    body: "The microphone or the room may be the cause. Try a quieter room, move closer to the mic, or check the input notes.",
  },
};

export class PadView {
  constructor(canvas, { maxPoints = 240 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.maxPoints = maxPoints;
    this.frames = [];
  }

  push(frame) {
    this.frames.push(frame);
    if (this.frames.length > this.maxPoints) this.frames.shift();
    this.render();
  }

  setFrames(frames) {
    this.frames = frames.slice(-this.maxPoints);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    const plot = {
      x: MARGIN.left,
      y: MARGIN.top,
      w: width - MARGIN.left - MARGIN.right,
      h: height - MARGIN.top - MARGIN.bottom,
    };
    this.#grid(ctx, plot);
    this.#trace(ctx, plot);
    const current = this.frames[this.frames.length - 1];
    if (current) this.#current(ctx, plot, current);
  }

  #grid(ctx, plot) {
    ctx.save();
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#333";
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    for (const hz of PITCH_TICKS) {
      const x = plot.x + mapPitch(hz) * plot.w;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(String(hz), x - 9, plot.y + plot.h + 15);
    }
    for (const st of RESONANCE_TICKS) {
      const y = plot.y + plot.h - mapResonance(st) * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillText(String(st), 8, y + 4);
    }
    ctx.strokeStyle = "#333";
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.restore();
  }

  #trace(ctx, plot) {
    if (this.frames.length === 0) return;
    ctx.save();
    ctx.strokeStyle = "#3a6ea5";
    ctx.fillStyle = "#3a6ea5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.frames.forEach((frame, index) => {
      const { x, y } = padPoint(frame);
      const px = plot.x + x * plot.w;
      const py = plot.y + plot.h - y * plot.h;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    for (const frame of this.frames) {
      const { x, y } = padPoint(frame);
      ctx.beginPath();
      ctx.arc(plot.x + x * plot.w, plot.y + plot.h - y * plot.h, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  #current(ctx, plot, frame) {
    const { x, y } = padPoint(frame);
    const px = plot.x + x * plot.w;
    const py = plot.y + plot.h - y * plot.h;
    ctx.save();
    if (!isTrustworthy(frame)) {
      // Low-confidence overlay: a hatch plus a text label, never colour alone.
      ctx.strokeStyle = "rgba(180,120,0,0.55)";
      ctx.lineWidth = 1;
      for (let d = -plot.h; d < plot.w; d += 8) {
        ctx.beginPath();
        ctx.moveTo(plot.x + d, plot.y);
        ctx.lineTo(plot.x + d + plot.h, plot.y + plot.h);
        ctx.stroke();
      }
      ctx.fillStyle = "#7a4d00";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("Confidence: low", plot.x + 6, plot.y + 16);
    }
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 4, py - 4, 8, 8);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
