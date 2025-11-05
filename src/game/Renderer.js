export class Renderer {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.theme = {
      colors: { bg: '#111', player: '#4caf50', ai: '#f44336' }
    };
    this.scale = 1;
    this.offset = { x: 0, y: 0 };
  }

  render(core) {
    if (!this.ctx || !core) return;
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.theme.colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Compute world->screen scale and offset (match legacy RenderSystem)
    const arenaWidth = core.arena?.width || width;
    const arenaHeight = core.arena?.height || height;
    const padding = 50;
    const scaleX = (width - padding * 2) / arenaWidth;
    const scaleY = (height - padding * 2) / arenaHeight;
    this.scale = Math.min(scaleX, scaleY);
    this.offset = {
      x: (width - arenaWidth * this.scale) / 2,
      y: (height - arenaHeight * this.scale) / 2
    };

    const gameToCanvas = (pos) => ({
      x: pos.x * this.scale + this.offset.x,
      y: pos.y * this.scale + this.offset.y
    });

    // Draw arena rect
    const topLeft = gameToCanvas({ x: 0, y: 0 });
    const bottomRight = gameToCanvas({ x: arenaWidth, y: arenaHeight });
    ctx.fillStyle = '#222';
    ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    // Draw player
    const p = core.players?.[0];
    if (p) {
      ctx.fillStyle = this.theme.colors.player;
      ctx.beginPath();
      const pp = gameToCanvas(p.position);
      ctx.arc(pp.x, pp.y, (p.radius || 10) * this.scale, 0, Math.PI * 2);
      ctx.fill();

      // Draw player's saber
      if (p.saber) {
        const ends = p.saber.getEndpoints(p.position);
        ctx.strokeStyle = this.theme.colors.player;
        ctx.lineWidth = (p.saber.width || 2); // pixel width, not scaled
        ctx.beginPath();
        const base = gameToCanvas(ends.base);
        const tip = gameToCanvas(ends.tip);
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();

        // tip dot
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, (p.saber.width || 2) / 2, 0, Math.PI * 2);
        ctx.fillStyle = this.theme.colors.player;
        ctx.fill();
      }
    }

    // Draw AI
    const a = core.ais?.[0];
    if (a) {
      ctx.fillStyle = this.theme.colors.ai;
      ctx.beginPath();
      const ap = gameToCanvas(a.position);
      ctx.arc(ap.x, ap.y, (a.radius || 10) * this.scale, 0, Math.PI * 2);
      ctx.fill();

      // Draw AI's saber
      if (a.saber) {
        const ends = a.saber.getEndpoints(a.position);
        ctx.strokeStyle = this.theme.colors.ai;
        ctx.lineWidth = (a.saber.width || 2);
        ctx.beginPath();
        const base = gameToCanvas(ends.base);
        const tip = gameToCanvas(ends.tip);
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();

        // tip dot
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, (a.saber.width || 2) / 2, 0, Math.PI * 2);
        ctx.fillStyle = this.theme.colors.ai;
        ctx.fill();
      }
    }
  }
}


