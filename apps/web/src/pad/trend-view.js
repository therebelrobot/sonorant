// Trend sparkline with core_version boundary marks (S5.4). Draws the chart; the
// accessible text lives in the DOM, never on the canvas alone.

import { TREND_COPY, channelLabel, trendStopsAt } from "../store/trends.js";

const MARGIN = { left: 46, right: 14, top: 16, bottom: 30 };

export class TrendView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.series = null;
  }

  setSeries(series) {
    this.series = series;
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
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    const points = this.series?.points ?? [];
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#333";
    if (points.length < 2) {
      ctx.fillText(TREND_COPY.empty, plot.x, plot.y + 18);
      return;
    }

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const t0 = points[0].t_ms;
    const t1 = points[points.length - 1].t_ms;
    const spanT = t1 - t0 || 1;
    const toX = (t) => plot.x + ((t - t0) / spanT) * plot.w;
    const toY = (v) => plot.y + plot.h - ((v - min) / span) * plot.h;

    // Trace.
    ctx.strokeStyle = "#3a6ea5";
    ctx.beginPath();
    points.forEach((p, index) => {
      const x = toX(p.t_ms);
      const y = toY(p.value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Boundary marks: a line, a label, and (in the DOM) a text note — never colour alone.
    const stop = trendStopsAt(this.series);
    const stopT = stop ? this.series.segments[stop.index].points[0].t_ms : null;
    for (const boundary of this.series.boundaries) {
      const x = toX(boundary.t_ms);
      ctx.save();
      ctx.strokeStyle = "#7a4d00";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#7a4d00";
      const labelWidth = ctx.measureText(TREND_COPY.boundaryLabel).width;
      const labelX = Math.max(plot.x, Math.min(x + 4, plot.x + plot.w - labelWidth));
      ctx.fillText(TREND_COPY.boundaryLabel, labelX, plot.y + 12);
    }
    if (stopT != null) {
      ctx.fillStyle = "#7a4d00";
      ctx.fillText(TREND_COPY.stopped, plot.x, plot.y + plot.h - 6);
    }

    // Axis labels + range, as text.
    ctx.fillStyle = "#333";
    ctx.fillText(channelLabel(this.series.channel), plot.x, plot.y + plot.h + 20);
    ctx.fillText(max.toFixed(1), 4, plot.y + 10);
    ctx.fillText(min.toFixed(1), 4, plot.y + plot.h);
  }
}
