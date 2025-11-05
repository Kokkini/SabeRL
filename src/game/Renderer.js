export class Renderer {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.theme = {
      colors: { bg: '#111', player: '#2196F3', ai: '#f44336' }
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
    const arenaRect = {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
    
    // Fill arena background
    ctx.fillStyle = '#222';
    ctx.fillRect(arenaRect.x, arenaRect.y, arenaRect.width, arenaRect.height);
    
    // Draw arena edges with glow effect
    this.renderGlowingRect(ctx, arenaRect, '#888', 1);

    // Draw sabers first (behind players)
    const p = core.players?.[0];
    const a = core.ais?.[0];

    // Draw player's saber with glow effect
    if (p && p.saber) {
      const ends = p.saber.getEndpoints(p.position);
      // Offset base to start from player's edge instead of center
      const direction = {
        x: ends.tip.x - ends.base.x,
        y: ends.tip.y - ends.base.y
      };
      const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
      if (length > 0) {
        const normalized = { x: direction.x / length, y: direction.y / length };
        const playerRadius = (p.radius || 10);
        const gapSize = 0.2; // Small gap between player edge and saber base
        const offsetBase = {
          x: ends.base.x + normalized.x * (playerRadius + gapSize),
          y: ends.base.y + normalized.y * (playerRadius + gapSize)
        };
        const base = gameToCanvas(offsetBase);
        const tip = gameToCanvas(ends.tip);
        this.renderLightsaber(ctx, base, tip, this.theme.colors.player, 4);
      }
    }

    // Draw AI's saber with glow effect
    if (a && a.saber) {
      const ends = a.saber.getEndpoints(a.position);
      // Offset base to start from AI's edge instead of center
      const direction = {
        x: ends.tip.x - ends.base.x,
        y: ends.tip.y - ends.base.y
      };
      const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
      if (length > 0) {
        const normalized = { x: direction.x / length, y: direction.y / length };
        const aiRadius = (a.radius || 10);
        const gapSize = 0.2; // Small gap between AI edge and saber base
        const offsetBase = {
          x: ends.base.x + normalized.x * (aiRadius + gapSize),
          y: ends.base.y + normalized.y * (aiRadius + gapSize)
        };
        const base = gameToCanvas(offsetBase);
        const tip = gameToCanvas(ends.tip);
        this.renderLightsaber(ctx, base, tip, this.theme.colors.ai, 4);
      }
    }

    // Draw players on top of sabers
    if (p) {
      const pp = gameToCanvas(p.position);
      const playerRadius = (p.radius || 10) * this.scale;
      
      // Draw player circle with gradient
      const playerGradient = ctx.createRadialGradient(
        pp.x - playerRadius * 0.3, pp.y - playerRadius * 0.3, 0,
        pp.x, pp.y, playerRadius
      );
      playerGradient.addColorStop(0, this.lightenColor(this.theme.colors.player, 60));
      playerGradient.addColorStop(1, this.theme.colors.player);
      ctx.fillStyle = playerGradient;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, playerRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw player eyes looking at opponent
      if (a) {
        const ap = gameToCanvas(a.position);
        this.renderEyes(ctx, pp, playerRadius, ap, '#000');
      }
    }

    // Draw AI on top of sabers
    if (a) {
      const ap = gameToCanvas(a.position);
      const aiRadius = (a.radius || 10) * this.scale;
      
      // Draw AI circle with gradient
      const aiGradient = ctx.createRadialGradient(
        ap.x - aiRadius * 0.3, ap.y - aiRadius * 0.3, 0,
        ap.x, ap.y, aiRadius
      );
      aiGradient.addColorStop(0, this.lightenColor(this.theme.colors.ai, 60));
      aiGradient.addColorStop(1, this.theme.colors.ai);
      ctx.fillStyle = aiGradient;
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, aiRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw AI eyes looking at player
      if (p) {
        const pp = gameToCanvas(p.position);
        this.renderEyes(ctx, ap, aiRadius, pp, '#000');
      }
    }
  }

  /**
   * Lighten a hex color by adding brightness to RGB values
   * @param {string} hex - Hex color string
   * @param {number} amount - Amount to lighten (0-255)
   * @returns {string} Lightened hex color
   */
  lightenColor(hex, amount) {
    const cleanHex = hex.replace('#', '');
    const num = parseInt(cleanHex, 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
    const b = Math.min(255, (num & 0x0000FF) + amount);
    const newNum = ((r << 16) | (g << 8) | b);
    return `#${newNum.toString(16).padStart(6, '0')}`;
  }

  /**
   * Render a lightsaber with glow effect
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} base - Base position {x, y}
   * @param {Object} tip - Tip position {x, y}
   * @param {string} color - Saber color (hex)
   * @param {number} coreWidth - Core line width in pixels
   */
  renderLightsaber(ctx, base, tip, color, coreWidth = 4) {

    // Create gradient for the saber
    const gradient = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
    const brightColor = this.lightenColor(color, 80);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, brightColor);
    gradient.addColorStop(1, brightColor);

    // Save context state
    ctx.save();

    // Outer glow layers (drawn first, behind everything)
    const glowLayers = [
      { width: coreWidth * 4, opacity: 0.15 },
      { width: coreWidth * 3, opacity: 0.25 },
      { width: coreWidth * 2, opacity: 0.4 }
    ];

    for (const layer of glowLayers) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = layer.opacity;
      ctx.lineWidth = layer.width;
      ctx.lineCap = 'round';
      ctx.shadowBlur = layer.width * 2;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }

    // Reset shadow for core
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Core bright line (drawn on top)
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = coreWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    // Glowing tip circle
    ctx.fillStyle = brightColor;
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = coreWidth * 2;
    ctx.shadowColor = color;
    ctx.beginPath();
    // ctx.arc(tip.x, tip.y, coreWidth * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Restore context state
    ctx.restore();
  }

  /**
   * Render a rectangle with glowing edges
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} rect - Rectangle {x, y, width, height}
   * @param {string} color - Edge color (hex)
   * @param {number} lineWidth - Core line width in pixels
   */
  renderGlowingRect(ctx, rect, color, lineWidth = 2) {
    // Save context state
    ctx.save();

    // Glow layers (drawn first, behind everything)
    const glowLayers = [
      { width: lineWidth * 3, opacity: 0.2 },
      { width: lineWidth * 2, opacity: 0.35 },
      { width: lineWidth * 1.5, opacity: 0.5 }
    ];

    for (const layer of glowLayers) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = layer.opacity;
      ctx.lineWidth = layer.width;
      ctx.shadowBlur = layer.width * 2;
      ctx.shadowColor = color;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    // Reset shadow for core
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Core bright line (drawn on top)
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    // Restore context state
    ctx.restore();
  }

  /**
   * Render googly eyes on an entity looking at a target
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} entityPos - Entity position {x, y} in canvas coordinates
   * @param {number} entityRadius - Entity radius in canvas pixels
   * @param {Object} targetPos - Target position {x, y} in canvas coordinates
   * @param {string} irisColor - Iris/pupil color (hex)
   */
  renderEyes(ctx, entityPos, entityRadius, targetPos, irisColor) {
    // Eye size relative to entity radius
    const eyeSize = entityRadius * 0.35;
    const eyeSpacing = entityRadius * 0.7; // Distance between eyes
    const eyeOffset = entityRadius * 0.2; // How far forward eyes are positioned
    const irisSize = eyeSize * 0.55; // Iris is half the eye size
    const maxIrisOffset = eyeSize - irisSize - 1; // Max distance iris can move within eye
    
    // Fixed eye positions relative to entity center (always face forward)
    const leftEyeX = entityPos.x - eyeSpacing * 0.5;
    const leftEyeY = entityPos.y - eyeOffset;
    const rightEyeX = entityPos.x + eyeSpacing * 0.5;
    const rightEyeY = entityPos.y - eyeOffset;
    
    // Calculate direction from entity to target
    const dx = targetPos.x - entityPos.x;
    const dy = targetPos.y - entityPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) {
      // If target is at same position, draw centered irises
      this.drawGooglyEye(ctx, leftEyeX, leftEyeY, eyeSize, 0, 0, irisSize, irisColor);
      this.drawGooglyEye(ctx, rightEyeX, rightEyeY, eyeSize, 0, 0, irisSize, irisColor);
      return;
    }
    
    // Normalized direction to target
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    // Calculate iris offset within each eye (proportional to direction, clamped to eye bounds)
    const leftIrisOffsetX = Math.max(-maxIrisOffset, Math.min(maxIrisOffset, dirX * maxIrisOffset));
    const leftIrisOffsetY = Math.max(-maxIrisOffset, Math.min(maxIrisOffset, dirY * maxIrisOffset));
    const rightIrisOffsetX = Math.max(-maxIrisOffset, Math.min(maxIrisOffset, dirX * maxIrisOffset));
    const rightIrisOffsetY = Math.max(-maxIrisOffset, Math.min(maxIrisOffset, dirY * maxIrisOffset));
    
    // Draw googly eyes
    this.drawGooglyEye(ctx, leftEyeX, leftEyeY, eyeSize, leftIrisOffsetX, leftIrisOffsetY, irisSize, irisColor);
    this.drawGooglyEye(ctx, rightEyeX, rightEyeY, eyeSize, rightIrisOffsetX, rightIrisOffsetY, irisSize, irisColor);
  }

  /**
   * Draw a single googly eye (white eyeball with moving iris)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} eyeX - Eye center X position
   * @param {number} eyeY - Eye center Y position
   * @param {number} eyeSize - Eye radius
   * @param {number} irisOffsetX - Iris X offset from center
   * @param {number} irisOffsetY - Iris Y offset from center
   * @param {number} irisSize - Iris radius
   * @param {string} irisColor - Iris color
   */
  drawGooglyEye(ctx, eyeX, eyeY, eyeSize, irisOffsetX, irisOffsetY, irisSize, irisColor) {
    // Draw white eyeball
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // // Draw eye outline
    // ctx.strokeStyle = '#333';
    // ctx.lineWidth = 1;
    // ctx.beginPath();
    // ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI * 2);
    // ctx.stroke();
    
    // Draw iris/pupil (moves within the eye)
    ctx.fillStyle = irisColor;
    ctx.beginPath();
    ctx.arc(eyeX + irisOffsetX, eyeY + irisOffsetY, irisSize, 0, Math.PI * 2);
    ctx.fill();
  }
}


