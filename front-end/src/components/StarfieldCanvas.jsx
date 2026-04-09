import { useEffect, useRef, memo, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

const TWO_PI = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return { r: 16, g: 16, b: 18 };
};

const CONFIG = {
  layers: [
    { count: 0.00016, sizeRange: [0.2, 0.5], opacityRange: [0.14, 0.28], speed: 1.8, twinkle: 0.1 },
    { count: 0.0001, sizeRange: [0.5, 0.85], opacityRange: [0.24, 0.42], speed: 4, twinkle: 0.2 },
    { count: 0.00005, sizeRange: [0.85, 1.3], opacityRange: [0.36, 0.58], speed: 7.5, twinkle: 0.28 },
    { count: 0.00002, sizeRange: [1.2, 2.0], opacityRange: [0.5, 0.76], speed: 12, twinkle: 0.36 },
  ],
  clusters: { count: 5, starsPerCluster: [12, 22], radius: [80, 160] },
  nebulas: { count: 4, pulseSpeed: 0.08 },
  meteors: { poolSize: 8, minDelay: 3500, maxDelay: 9000 },
  ambientGlow: { enabled: true, intensity: 0.09 },
  maxDPR: 1.5,
  frameSkipThreshold: 0.02,
  targetFps: 60,
};

const COLORS = {
  stars: [
    // Cool white-silver (O/A class — majority)
    [195, 195, 200],
    [215, 215, 220],
    [235, 235, 240],
    [248, 248, 252],
    // Selene blue-white (B class)
    [170, 185, 240],
    [190, 202, 245],
    [155, 168, 230],
    // Ice blue
    [180, 218, 255],
    [200, 228, 250],
    // Warm amber-gold (K class — rare warmth for depth)
    [255, 218, 175],
    [240, 200, 160],
  ],
  nebulas: [
    { r: 12, g: 12, b: 22,  name: 'voidBlack' },
    { r: 22, g: 18, b: 48,  name: 'deepPurple' },
    { r: 12, g: 25, b: 55,  name: 'deepBlue' },
    { r: 18, g: 38, b: 48,  name: 'deepTeal' },
    { r: 45, g: 50, b: 115, name: 'seleneDeep' },
  ],
  meteor: {
    head: [238, 242, 255],
    trail: [175, 175, 180],
  },
  glow: {
    inner: [180, 195, 250],
    mid:   [130, 150, 225],
    outer: [90, 110, 195],
  },
};

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

    CONFIG.layers.forEach((layer, layerIndex) => {
      const count = Math.floor(area * layer.count);
      for (let i = 0; i < count; i++) {
        this.stars.push(this.createStar(width, height, layer, layerIndex));
      }
    });

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
            x,
            y,
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

    // Consistent drift direction with per-star spread — simulates traveling through space
    const baseAngle = Math.PI * 0.82;
    const angle = baseAngle + (Math.random() - 0.5) * 0.35;
    const speed = layer.speed * (0.8 + Math.random() * 0.4);

    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size,
      baseOpacity,
      color,
      colorStr: `rgb(${color[0]},${color[1]},${color[2]})`,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      twinklePhase: Math.random() * TWO_PI,
      twinkleSpeed: 0.5 + Math.random() * 1.0,
      twinkleIntensity: layer.twinkle,
      shimmerPhase: Math.random() * TWO_PI,
      shimmerSpeed: 0.18 + Math.random() * 0.4,
      layer: layerIndex,
      glowSize: size * 3.5,
    };
  }

  update(width, height, dt) {
    const stars = this.stars;
    const len = stars.length;
    for (let i = 0; i < len; i++) {
      const star = stars[i];
      star.x += star.vx * dt;
      star.y += star.vy * dt;

      if (star.x < -10) star.x = width + 10;
      else if (star.x > width + 10) star.x = -10;
      if (star.y < -10) star.y = height + 10;
      else if (star.y > height + 10) star.y = -10;

      star.twinklePhase += star.twinkleSpeed * dt;
      star.shimmerPhase += star.shimmerSpeed * dt;
    }
  }
}

class NebulaSystem {
  constructor(width, height) {
    this.nebulas = [];
    this.init(width, height);
  }

  init(width, height) {
    const seleneColor = COLORS.nebulas.find(n => n.name === 'seleneDeep');
    for (let i = 0; i < CONFIG.nebulas.count; i++) {
      // Last slot is always Selene-tinted for brand identity
      const isSelene = i === CONFIG.nebulas.count - 1;
      const color = isSelene ? seleneColor : pickRandom(COLORS.nebulas.slice(0, 4));
      this.nebulas.push({
        x: rand(0, width),
        y: rand(0, height),
        radiusX: rand(300, 550),
        radiusY: rand(220, 420),
        rotation: rand(0, Math.PI),
        rotationSpeed: (Math.random() - 0.5) * 0.012,
        color,
        baseOpacity: isSelene ? rand(0.18, 0.3) : rand(0.12, 0.22),
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        pulsePhase: Math.random() * TWO_PI,
        pulseSpeed: CONFIG.nebulas.pulseSpeed + Math.random() * 0.025,
        distortPhase: Math.random() * TWO_PI,
        distortSpeed: 0.018 + Math.random() * 0.012,
      });
    }
  }

  update(width, height, dt) {
    for (const n of this.nebulas) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.rotation += n.rotationSpeed * dt;
      n.pulsePhase += n.pulseSpeed * dt;
      n.distortPhase += n.distortSpeed * dt;

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
      const pulse = 0.75 + 0.25 * Math.sin(n.pulsePhase);
      const distort = 1 + 0.12 * Math.sin(n.distortPhase);
      const opacity = n.baseOpacity * pulse * globalOpacity;

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.rotation);
      ctx.scale(distort, 1 / distort);

      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, n.radiusX);
      const { r, g, b } = n.color;
      gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
      gradient.addColorStop(0.35, `rgba(${r},${g},${b},${opacity * 0.55})`);
      gradient.addColorStop(0.65, `rgba(${r},${g},${b},${opacity * 0.2})`);
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
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speed: 0,
      length: 0,
      life: 0,
      decay: 0,
      particles: [],
      active: false,
      prevX: 0,
      prevY: 0,
    };
  }

  spawn(width) {
    let meteor = this.pool.pop();
    if (!meteor) meteor = this.createMeteor();

    const speed = rand(800, 1100);
    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2;

    meteor.x = rand(-width * 0.1, width * 0.75);
    meteor.y = rand(-80, -30);
    meteor.prevX = meteor.x;
    meteor.prevY = meteor.y;
    meteor.vx = Math.cos(angle) * speed * 0.36;
    meteor.vy = Math.sin(angle) * speed;
    meteor.speed = speed;
    meteor.length = rand(140, 220);
    meteor.life = 1.0;
    meteor.decay = rand(0.35, 0.55);
    meteor.active = true;

    meteor.particles = [];
    for (let i = 0; i < 12; i++) {
      meteor.particles.push({
        x: meteor.x,
        y: meteor.y,
        life: 0,
        size: rand(0.5, 1.4),
        vx: 0,
        vy: 0,
        delay: i * 0.04,
      });
    }

    this.active.push(meteor);
  }

  update(timestamp, width, height, globalOpacity, dt) {
    if (globalOpacity > 0.5 && timestamp - this.lastSpawnTime > this.nextDelay && this.active.length < 2) {
      this.spawn(width);
      this.lastSpawnTime = timestamp;
      this.nextDelay = rand(CONFIG.meteors.minDelay, CONFIG.meteors.maxDelay);
    }

    const smoothDt = Math.min(dt, 0.033);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      m.prevX = m.x;
      m.prevY = m.y;
      m.x += m.vx * smoothDt;
      m.y += m.vy * smoothDt;
      m.life -= m.decay * smoothDt;

      for (let j = 0; j < m.particles.length; j++) {
        const p = m.particles[j];
        if (p.life > 0) {
          p.x += p.vx * smoothDt;
          p.y += p.vy * smoothDt;
          p.life -= 1.0 * smoothDt;
          p.vy += 1.8 * smoothDt;
        } else if (Math.random() < 0.08 * smoothDt * 60) {
          p.x = m.x + rand(-1, 1);
          p.y = m.y + rand(-1, 1);
          p.vx = rand(-0.2, 0.2);
          p.vy = rand(-0.15, 0.4);
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
      const opacity = m.life * m.life * globalOpacity;
      const invSpeed = 1 / m.speed;
      const tailX = m.x - m.vx * invSpeed * m.length * m.life;
      const tailY = m.y - m.vy * invSpeed * m.length * m.life;

      const gradient = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      gradient.addColorStop(0, `rgba(${tr},${tg},${tb},0)`);
      gradient.addColorStop(0.2, `rgba(${tr},${tg},${tb},${opacity * 0.08})`);
      gradient.addColorStop(0.5, `rgba(${hr},${hg},${hb},${opacity * 0.35})`);
      gradient.addColorStop(0.75, `rgba(${hr},${hg},${hb},${opacity * 0.65})`);
      gradient.addColorStop(1, `rgba(${hr},${hg},${hb},${opacity * 0.9})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5 + opacity * 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.globalAlpha = opacity * 0.95;
      ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.8 + opacity * 0.8, 0, TWO_PI);
      ctx.fill();

      ctx.globalAlpha = opacity * 0.25;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4 + opacity * 1.5, 0, TWO_PI);
      ctx.fill();

      for (const p of m.particles) {
        if (p.life > 0) {
          const pOpacity = p.life * p.life * opacity * 0.55;
          ctx.globalAlpha = pOpacity;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, TWO_PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

function StarfieldCanvas({ active = false, intensity = 'medium' }) {
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
    bgCanvas: null,
    bgCtx: null,
    noiseCanvas: null,
    noisePattern: null,
    lastTime: 0,
    lastFrameTime: 0,
    dpr: 1,
    reduceMotion: false,
  });
  const intensityScaleRef = useRef(1);

  const renderStars = useCallback((ctx, stars, globalOpacity) => {
    const len = stars.length;
    for (let i = 0; i < len; i++) {
      const star = stars[i];
      const twinkle1 = Math.sin(star.twinklePhase);
      const twinkle2 = Math.sin(star.twinklePhase * 1.3 + 0.5);
      const scintillation = 1 - star.twinkleIntensity + star.twinkleIntensity * (0.5 + 0.25 * twinkle1 + 0.25 * twinkle2);
      const opacity = star.baseOpacity * scintillation * globalOpacity;

      if (opacity < 0.02) continue;

      const shimmer = Math.sin(star.shimmerPhase);
      const shimmerAmt = shimmer * 12;
      const r = clamp(Math.round(star.color[0] + shimmerAmt), 0, 255);
      const g = clamp(Math.round(star.color[1] + shimmerAmt), 0, 255);
      const b = clamp(Math.round(star.color[2] + shimmerAmt), 0, 255);

      ctx.globalAlpha = opacity;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TWO_PI);
      ctx.fill();

      if (star.layer >= 2 && opacity > 0.22) {
        ctx.globalAlpha = opacity * 0.14;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.glowSize, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, []);

  const renderAmbientGlow = useCallback((ctx, width, height, globalOpacity) => {
    if (!CONFIG.ambientGlow.enabled) return;

    const gradient = ctx.createRadialGradient(width * 0.88, height * 0.12, 0, width * 0.88, height * 0.12, Math.max(width, height) * 0.65);
    const intensity = CONFIG.ambientGlow.intensity * globalOpacity;
    const [ir, ig, ib] = COLORS.glow.inner;
    const [mr, mg, mb] = COLORS.glow.mid;
    const [or, og, ob] = COLORS.glow.outer;

    gradient.addColorStop(0, `rgba(${ir},${ig},${ib},${intensity * 1.6})`);
    gradient.addColorStop(0.18, `rgba(${mr},${mg},${mb},${intensity * 1.1})`);
    gradient.addColorStop(0.45, `rgba(${or},${og},${ob},${intensity * 0.45})`);
    gradient.addColorStop(1, `rgba(${or},${og},${ob},0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);

  useEffect(() => {
    intensityScaleRef.current =
      intensity === 'low' ? 0.6 : intensity === 'high' ? 1.3 : 1;
  }, [intensity]);

  useEffect(() => {
    if (!isDarkMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = stateRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
    state.dpr = dpr;
    const frameInterval = 1000 / CONFIG.targetFps;
    state.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const initCanvas = () => {
      state.width = canvas.offsetWidth;
      state.height = canvas.offsetHeight;
      canvas.width = state.width * dpr;
      canvas.height = state.height * dpr;
      state.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!state.bgCanvas) {
        state.bgCanvas = document.createElement('canvas');
        state.bgCtx = state.bgCanvas.getContext('2d', { alpha: true });
      }
      if (!state.noiseCanvas) {
        state.noiseCanvas = document.createElement('canvas');
      }
      state.bgCanvas.width = state.width;
      state.bgCanvas.height = state.height;

      const baseColor =
        theme.palette.background.default ||
        (theme.palette.mode === 'dark' ? theme.palette.common.black : theme.palette.common.white);
      const base = hexToRgb(baseColor);
      const bright = {
        r: clamp(base.r + 8, 0, 255),
        g: clamp(base.g + 8, 0, 255),
        b: clamp(base.b + 12, 0, 255),
      };
      const dim = {
        r: clamp(base.r - 8, 0, 255),
        g: clamp(base.g - 8, 0, 255),
        b: clamp(base.b - 5, 0, 255),
      };

      const bg = state.bgCtx;
      bg.clearRect(0, 0, state.width, state.height);
      const grad = bg.createRadialGradient(state.width * 0.12, state.height * 0.18, 0, state.width * 0.12, state.height * 0.18, Math.max(state.width, state.height) * 0.92);
      grad.addColorStop(0, `rgb(${bright.r},${bright.g},${bright.b})`);
      grad.addColorStop(0.55, `rgb(${base.r},${base.g},${base.b})`);
      grad.addColorStop(1, `rgb(${dim.r},${dim.g},${dim.b})`);
      bg.fillStyle = grad;
      bg.fillRect(0, 0, state.width, state.height);

      const vignette = bg.createRadialGradient(
        state.width * 0.5,
        state.height * 0.5,
        Math.min(state.width, state.height) * 0.28,
        state.width * 0.5,
        state.height * 0.5,
        Math.max(state.width, state.height) * 0.72
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
      bg.fillStyle = vignette;
      bg.fillRect(0, 0, state.width, state.height);

      // Selene moonrise bloom — brand tint at top-center
      const brand = hexToRgb(theme.palette.primary.main);
      const moonBloom = bg.createRadialGradient(
        state.width * 0.52, state.height * -0.05, 0,
        state.width * 0.52, state.height * -0.05, state.height * 0.55
      );
      moonBloom.addColorStop(0,    `rgba(${brand.r},${brand.g},${brand.b},0.12)`);
      moonBloom.addColorStop(0.45, `rgba(${brand.r},${brand.g},${brand.b},0.05)`);
      moonBloom.addColorStop(1,    `rgba(${brand.r},${brand.g},${brand.b},0)`);
      bg.fillStyle = moonBloom;
      bg.fillRect(0, 0, state.width, state.height);

      const noiseSize = 100;
      state.noiseCanvas.width = noiseSize;
      state.noiseCanvas.height = noiseSize;
      const nctx = state.noiseCanvas.getContext('2d', { alpha: true });
      const imageData = nctx.createImageData(noiseSize, noiseSize);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = 195 + Math.floor(Math.random() * 60);
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = Math.random() < 0.55 ? 14 : 0;
      }
      nctx.putImageData(imageData, 0, 0);
      state.noisePattern = state.ctx.createPattern(state.noiseCanvas, 'repeat');
    };

    initCanvas();

    if (!state.starField) state.starField = new StarField(state.width, state.height);
    if (!state.nebulaSystem) state.nebulaSystem = new NebulaSystem(state.width, state.height);
    if (!state.meteorPool) state.meteorPool = new MeteorPool();

    const animate = (timestamp) => {
      if (!state.isVisible) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      if (timestamp - state.lastFrameTime < frameInterval) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const dtMs = Math.min(timestamp - state.lastTime, 50);
      const dt = dtMs / 1000;
      state.lastTime = timestamp;
      state.lastFrameTime = timestamp;

      const opacityDiff = state.targetOpacity - state.opacity;
      if (Math.abs(opacityDiff) > 0.003) {
        state.opacity += opacityDiff * 0.055;
      } else {
        state.opacity = state.targetOpacity;
      }

      if (state.opacity < CONFIG.frameSkipThreshold) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const { ctx, width, height, opacity: baseOpacity } = state;
      const globalOpacity = clamp(baseOpacity * intensityScaleRef.current, 0, 1.5);

      ctx.clearRect(0, 0, width, height);
      if (state.bgCanvas) {
        ctx.globalAlpha = 1;
        ctx.drawImage(state.bgCanvas, 0, 0, width, height);
      }
      if (state.noisePattern) {
        ctx.save();
        const noiseBase = state.reduceMotion ? 0.045 : 0.09;
        const dprFactor = state.dpr >= 1.25 ? 0.7 : 1;
        ctx.globalAlpha = noiseBase * dprFactor * globalOpacity;
        ctx.fillStyle = state.noisePattern;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      renderAmbientGlow(ctx, width, height, globalOpacity);

      state.nebulaSystem.update(width, height, dt);
      state.nebulaSystem.render(ctx, globalOpacity);

      state.starField.update(width, height, dt);
      renderStars(ctx, state.starField.stars, globalOpacity);

      state.meteorPool.update(timestamp, width, height, globalOpacity, dt);
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
  }, [isDarkMode, renderStars, renderAmbientGlow, theme]);

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
      <Box
        component="canvas"
        ref={canvasRef}
        sx={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </Box>
  );
}

export default memo(StarfieldCanvas);
