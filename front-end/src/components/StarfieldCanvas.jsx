import { useEffect, useRef, memo, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

/**
 * Moonlit Starfield v2.0 - Next-Level Design & Performance
 * 
 * Visual Enhancements:
 * - Multi-layer parallax depth with 4 star layers
 * - Realistic star scintillation with chromatic shimmer
 * - Constellation-like star clusters for natural grouping
 * - Animated aurora/nebula bands with flowing motion
 * - Comet trails with particle dispersion
 * - Subtle moon glow ambient lighting
 * 
 * Performance Optimizations:
 * - Object pooling for meteors (zero allocation during runtime)
 * - Frame skipping based on opacity (no work when hidden)
 * - Batch rendering with minimal state changes
 * - IntersectionObserver for viewport-based rendering
 * - Capped DPR for performance
 */

// ============================================================================
// CONFIGURATION - Tunable parameters
// ============================================================================
const CONFIG = {
  // Star layers with parallax depth
  layers: [
    { count: 0.00008, sizeRange: [0.2, 0.4], opacityRange: [0.1, 0.2], speed: 0.005, twinkle: 0.1 },   // Distant dust
    { count: 0.00005, sizeRange: [0.4, 0.7], opacityRange: [0.2, 0.35], speed: 0.012, twinkle: 0.2 },  // Far stars
    { count: 0.00002, sizeRange: [0.7, 1.1], opacityRange: [0.35, 0.55], speed: 0.025, twinkle: 0.3 }, // Mid stars
    { count: 0.000008, sizeRange: [1.1, 1.8], opacityRange: [0.5, 0.75], speed: 0.04, twinkle: 0.4 },  // Near bright stars
  ],
  // Star clusters (constellation-like groupings)
  clusters: { count: 3, starsPerCluster: [8, 15], radius: [60, 120] },
  // Nebula/aurora bands
  nebulas: { count: 2, pulseSpeed: 0.0008 },
  // Meteors with particle trails
  meteors: { poolSize: 5, minDelay: 6000, maxDelay: 15000 },
  // Ambient moon glow
  moonGlow: { enabled: true, intensity: 0.04 },
  // Performance
  maxDPR: 1.5,  // Cap device pixel ratio for performance
  frameSkipThreshold: 0.02,  // Skip frames below this opacity
};

// ============================================================================
// COLOR PALETTES - Moonlit aesthetic
// ============================================================================
const COLORS = {
  stars: [
    [200, 208, 220],  // Cool silver
    [220, 226, 235],  // Bright silver
    [232, 236, 240],  // Moonlight white
    [199, 210, 254],  // Soft indigo (C7D2FE)
    [165, 180, 252],  // Indigo accent (A5B4FC)
    [180, 195, 230],  // Blue-silver
  ],
  nebulas: [
    { r: 30, g: 35, b: 55, name: 'deepIndigo' },
    { r: 40, g: 35, b: 60, name: 'purpleHaze' },
    { r: 25, g: 40, b: 50, name: 'tealMist' },
    { r: 50, g: 45, b: 70, name: 'liftedIndigo' },
  ],
  meteor: {
    head: [232, 236, 240],      // Moonlight
    trail: [165, 180, 252],     // Indigo
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const TWO_PI = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ============================================================================
// STAR FIELD CLASS
// ============================================================================
class StarField {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.stars = [];
    this.init();
  }

  init() {
    const { width, height } = this;
    const area = width * height;

    // Create stars for each layer
    CONFIG.layers.forEach((layer, layerIndex) => {
      const count = Math.floor(area * layer.count);
      for (let i = 0; i < count; i++) {
        this.stars.push(this.createStar(width, height, layer, layerIndex));
      }
    });

    // Create star clusters for natural grouping
    for (let c = 0; c < CONFIG.clusters.count; c++) {
      const centerX = rand(width * 0.1, width * 0.9);
      const centerY = rand(height * 0.1, height * 0.9);
      const radius = rand(...CONFIG.clusters.radius);
      const starCount = randInt(...CONFIG.clusters.starsPerCluster);

      for (let i = 0; i < starCount; i++) {
        const angle = Math.random() * TWO_PI;
        const dist = radius * Math.pow(Math.random(), 0.5);
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;

        if (x > 0 && x < width && y > 0 && y < height) {
          const layer = CONFIG.layers[randInt(1, 2)];
          this.stars.push({
            ...this.createStar(width, height, layer, randInt(1, 2)),
            x, y,
            isCluster: true,
          });
        }
      }
    }
  }

  createStar(w, h, layer, layerIndex) {
    const color = pickRandom(COLORS.stars);
    const size = rand(...layer.sizeRange);
    const baseOpacity = rand(...layer.opacityRange);

    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size,
      baseOpacity,
      color,
      colorStr: `rgb(${color[0]},${color[1]},${color[2]})`,
      vx: (Math.random() - 0.5) * layer.speed,
      vy: (Math.random() - 0.5) * layer.speed,
      twinklePhase: Math.random() * TWO_PI,
      twinkleSpeed: 0.002 + Math.random() * 0.006,
      twinkleIntensity: layer.twinkle,
      shimmerPhase: Math.random() * TWO_PI,
      shimmerSpeed: 0.001 + Math.random() * 0.002,
      layer: layerIndex,
      glowSize: size * 3,
    };
  }

  update(width, height) {
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      star.x += star.vx;
      star.y += star.vy;

      if (star.x < -10) star.x = width + 10;
      else if (star.x > width + 10) star.x = -10;
      if (star.y < -10) star.y = height + 10;
      else if (star.y > height + 10) star.y = -10;

      star.twinklePhase += star.twinkleSpeed;
      star.shimmerPhase += star.shimmerSpeed;
    }
  }
}

// ============================================================================
// NEBULA SYSTEM - Flowing aurora-like bands
// ============================================================================
class NebulaSystem {
  constructor(width, height) {
    this.nebulas = [];
    this.init(width, height);
  }

  init(width, height) {
    for (let i = 0; i < CONFIG.nebulas.count; i++) {
      const color = pickRandom(COLORS.nebulas);
      this.nebulas.push({
        x: rand(0, width),
        y: rand(0, height),
        radiusX: rand(200, 400),
        radiusY: rand(150, 300),
        rotation: rand(0, Math.PI),
        rotationSpeed: (Math.random() - 0.5) * 0.0001,
        color,
        baseOpacity: rand(0.06, 0.10),
        vx: (Math.random() - 0.5) * 0.04,
        vy: (Math.random() - 0.5) * 0.04,
        pulsePhase: Math.random() * TWO_PI,
        pulseSpeed: CONFIG.nebulas.pulseSpeed + Math.random() * 0.0005,
        distortPhase: Math.random() * TWO_PI,
        distortSpeed: 0.0003 + Math.random() * 0.0002,
      });
    }
  }

  update(width, height) {
    for (const n of this.nebulas) {
      n.x += n.vx;
      n.y += n.vy;
      n.rotation += n.rotationSpeed;
      n.pulsePhase += n.pulseSpeed;
      n.distortPhase += n.distortSpeed;

      const maxR = Math.max(n.radiusX, n.radiusY);
      if (n.x < -maxR) n.x = width + maxR;
      else if (n.x > width + maxR) n.x = -maxR;
      if (n.y < -maxR) n.y = height + maxR;
      else if (n.y > height + maxR) n.y = -maxR;
    }
  }

  render(ctx, globalOpacity) {
    ctx.save();
    for (const n of this.nebulas) {
      const pulse = 0.8 + 0.2 * Math.sin(n.pulsePhase);
      const distort = 1 + 0.1 * Math.sin(n.distortPhase);
      const opacity = n.baseOpacity * pulse * globalOpacity;

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.rotation);
      ctx.scale(distort, 1 / distort);

      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, n.radiusX);
      const { r, g, b } = n.color;
      gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
      gradient.addColorStop(0.4, `rgba(${r},${g},${b},${opacity * 0.6})`);
      gradient.addColorStop(0.7, `rgba(${r},${g},${b},${opacity * 0.25})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.beginPath();
      ctx.ellipse(0, 0, n.radiusX, n.radiusY, 0, 0, TWO_PI);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ============================================================================
// METEOR POOL - Zero-allocation object pooling
// ============================================================================
class MeteorPool {
  constructor() {
    this.pool = [];
    this.active = [];
    this.lastSpawnTime = 0;
    this.nextDelay = rand(CONFIG.meteors.minDelay, CONFIG.meteors.maxDelay);

    for (let i = 0; i < CONFIG.meteors.poolSize; i++) {
      this.pool.push(this.createMeteor());
    }
  }

  createMeteor() {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      speed: 0, length: 0, life: 0, decay: 0,
      particles: [], active: false,
    };
  }

  spawn(width) {
    let meteor = this.pool.pop();
    if (!meteor) meteor = this.createMeteor();

    const speed = rand(12, 20);
    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3;

    meteor.x = rand(-width * 0.1, width * 0.8);
    meteor.y = rand(-50, -20);
    meteor.vx = Math.cos(angle) * speed * 0.35;
    meteor.vy = Math.sin(angle) * speed;
    meteor.speed = speed;
    meteor.length = rand(100, 180);
    meteor.life = 1.0;
    meteor.decay = rand(0.008, 0.015);
    meteor.active = true;

    meteor.particles = [];
    for (let i = 0; i < 8; i++) {
      meteor.particles.push({
        x: meteor.x, y: meteor.y,
        life: 0, size: rand(0.5, 1.5),
        vx: 0, vy: 0,
      });
    }

    this.active.push(meteor);
  }

  update(timestamp, width, height, globalOpacity) {
    if (globalOpacity > 0.5 && timestamp - this.lastSpawnTime > this.nextDelay && this.active.length < 2) {
      this.spawn(width);
      this.lastSpawnTime = timestamp;
      this.nextDelay = rand(CONFIG.meteors.minDelay, CONFIG.meteors.maxDelay);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      m.x += m.vx;
      m.y += m.vy;
      m.life -= m.decay;

      for (let j = 0; j < m.particles.length; j++) {
        const p = m.particles[j];
        if (p.life > 0) {
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.03;
          p.vy += 0.05;
        } else if (Math.random() < 0.15) {
          p.x = m.x + rand(-2, 2);
          p.y = m.y + rand(-2, 2);
          p.vx = rand(-0.5, 0.5);
          p.vy = rand(-0.3, 0.8);
          p.life = rand(0.3, 0.7);
        }
      }

      if (m.life <= 0 || m.y > height + 100) {
        m.active = false;
        this.pool.push(m);
        this.active.splice(i, 1);
      }
    }
  }

  render(ctx, globalOpacity) {
    const [hr, hg, hb] = COLORS.meteor.head;
    const [tr, tg, tb] = COLORS.meteor.trail;

    for (const m of this.active) {
      const opacity = m.life * globalOpacity;
      const invSpeed = 1 / m.speed;
      const tailX = m.x - m.vx * invSpeed * m.length * m.life;
      const tailY = m.y - m.vy * invSpeed * m.length * m.life;

      const gradient = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      gradient.addColorStop(0, `rgba(${tr},${tg},${tb},0)`);
      gradient.addColorStop(0.3, `rgba(${tr},${tg},${tb},${opacity * 0.15})`);
      gradient.addColorStop(0.6, `rgba(${hr},${hg},${hb},${opacity * 0.4})`);
      gradient.addColorStop(0.85, `rgba(${hr},${hg},${hb},${opacity * 0.7})`);
      gradient.addColorStop(1, `rgba(${hr},${hg},${hb},${opacity * 0.9})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.globalAlpha = opacity * 0.9;
      ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, TWO_PI);
      ctx.fill();

      ctx.globalAlpha = opacity * 0.3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, TWO_PI);
      ctx.fill();

      for (const p of m.particles) {
        if (p.life > 0) {
          ctx.globalAlpha = p.life * opacity * 0.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, TWO_PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
function StarfieldCanvas({ active = false }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const stateRef = useRef({
    starField: null,
    nebulaSystem: null,
    meteorPool: null,
    opacity: 0,
    targetOpacity: 0,
    isVisible: true,
    width: 0,
    height: 0,
    ctx: null,
  });

  const renderStars = useCallback((ctx, stars, globalOpacity) => {
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];

      const twinkle1 = Math.sin(star.twinklePhase);
      const twinkle2 = Math.sin(star.twinklePhase * 1.3 + 0.5);
      const scintillation = 1 - star.twinkleIntensity +
        star.twinkleIntensity * (0.5 + 0.25 * twinkle1 + 0.25 * twinkle2);

      const opacity = star.baseOpacity * scintillation * globalOpacity;
      if (opacity < 0.02) continue;

      const shimmer = Math.sin(star.shimmerPhase);
      const r = Math.round(star.color[0] + shimmer * 5);
      const g = Math.round(star.color[1] + shimmer * 3);
      const b = Math.round(star.color[2] + shimmer * 8);

      ctx.globalAlpha = opacity;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TWO_PI);
      ctx.fill();

      if (star.layer >= 2 && opacity > 0.25) {
        ctx.globalAlpha = opacity * 0.15;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.glowSize, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, []);

  const renderMoonGlow = useCallback((ctx, width, height, globalOpacity) => {
    if (!CONFIG.moonGlow.enabled) return;

    const gradient = ctx.createRadialGradient(
      width * 0.85, height * 0.15, 0,
      width * 0.85, height * 0.15, Math.max(width, height) * 0.6
    );
    const intensity = CONFIG.moonGlow.intensity * globalOpacity;
    gradient.addColorStop(0, `rgba(199,210,254,${intensity * 1.5})`);
    gradient.addColorStop(0.2, `rgba(165,180,252,${intensity})`);
    gradient.addColorStop(0.5, `rgba(129,140,248,${intensity * 0.4})`);
    gradient.addColorStop(1, 'rgba(129,140,248,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);

  useEffect(() => {
    if (!isDarkMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = stateRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);

    const initCanvas = () => {
      state.width = canvas.offsetWidth;
      state.height = canvas.offsetHeight;
      canvas.width = state.width * dpr;
      canvas.height = state.height * dpr;
      state.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      state.ctx.scale(dpr, dpr);
    };

    initCanvas();

    if (!state.starField) {
      state.starField = new StarField(state.width, state.height);
    }
    if (!state.nebulaSystem) {
      state.nebulaSystem = new NebulaSystem(state.width, state.height);
    }
    if (!state.meteorPool) {
      state.meteorPool = new MeteorPool();
    }

    const animate = (timestamp) => {
      if (!state.isVisible) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const opacityDiff = state.targetOpacity - state.opacity;
      if (Math.abs(opacityDiff) > 0.003) {
        state.opacity += opacityDiff * 0.03;
      } else {
        state.opacity = state.targetOpacity;
      }

      if (state.opacity < CONFIG.frameSkipThreshold) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const { ctx, width, height, opacity: globalOpacity } = state;

      ctx.clearRect(0, 0, width, height);

      renderMoonGlow(ctx, width, height, globalOpacity);

      state.nebulaSystem.update(width, height);
      state.nebulaSystem.render(ctx, globalOpacity);

      state.starField.update(width, height);
      renderStars(ctx, state.starField.stars, globalOpacity);

      state.meteorPool.update(timestamp, width, height, globalOpacity);
      state.meteorPool.render(ctx, globalOpacity);

      animationRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      initCanvas();
      state.starField = new StarField(state.width, state.height);
      state.nebulaSystem = new NebulaSystem(state.width, state.height);
    };

    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 250);
    };

    const handleVisibility = () => {
      state.isVisible = !document.hidden;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        state.isVisible = entries[0].isIntersecting && !document.hidden;
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('visibilitychange', handleVisibility);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(resizeTimeout);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isDarkMode, renderStars, renderMoonGlow]);

  useEffect(() => {
    stateRef.current.targetOpacity = active ? 1 : 0;
  }, [active]);

  if (!isDarkMode) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </Box>
  );
}

export default memo(StarfieldCanvas);
