import { useEffect, useRef, memo } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

/**
 * OPTIMIZED: Pre-cached values, reduced gradient creation, batched rendering, reverse iteration cleanup
 * Features: Spectral star classes, parallax depth layers, realistic twinkle physics.
 */
function StarfieldCanvas({ active = false }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const starsRef = useRef([]);
  // dustRef removed - circular blobs disabled
  const nebulasRef = useRef([]);  // Re-enabled
  const meteorsRef = useRef([]);
  const cometsRef = useRef([]);
  const sparksRef = useRef([]);
  const opacityRef = useRef(0);
  const targetOpacityRef = useRef(0);
  const lastMeteorTimeRef = useRef(0);
  const lastCometTimeRef = useRef(0);
  const nextMeteorDelayRef = useRef(0);  // Initialized in useEffect
  const nextCometDelayRef = useRef(0);   // Initialized in useEffect
  const isVisibleRef = useRef(true);

  useEffect(() => {
    if (!isDarkMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize random delays (safe inside useEffect)
    if (nextMeteorDelayRef.current === 0) {
      nextMeteorDelayRef.current = 3000 + Math.random() * 5000;
    }
    if (nextCometDelayRef.current === 0) {
      nextCometDelayRef.current = 15000 + Math.random() * 20000;
    }

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const spectralClasses = [
      { r: 155, g: 176, b: 255, rarity: 0.01 },  // O-type blue
      { r: 170, g: 191, b: 255, rarity: 0.03 },  // B-type blue-white
      { r: 202, g: 215, b: 255, rarity: 0.08 },  // A-type white
      { r: 248, g: 247, b: 255, rarity: 0.15 },  // F-type yellow-white
      { r: 255, g: 244, b: 232, rarity: 0.25 },  // G-type yellow (like our Sun)
      { r: 255, g: 210, b: 161, rarity: 0.25 },  // K-type orange
      { r: 255, g: 204, b: 111, rarity: 0.15 },  // M0-type red
      { r: 255, g: 189, b: 111, rarity: 0.08 },  // M5-type red dwarf
    ];

    const getStarColor = () => {
      const rand = Math.random();
      let cumulative = 0;
      for (const sc of spectralClasses) {
        cumulative += sc.rarity;
        if (rand < cumulative) return sc;
      }
      return spectralClasses[4];
    };

    const initStars = (w, h) => {
      const stars = [];
      const area = w * h;
      
      const distantCount = Math.floor(area / 6000);
      for (let i = 0; i < distantCount; i++) {
        const color = getStarColor();
        const size = 0.3 + Math.random() * 0.5;
        stars.push({
          x: Math.random() * w, y: Math.random() * h, size, layer: 0,
          baseOpacity: 0.2 + Math.random() * 0.25, color,
          colorStr: `rgb(${color.r},${color.g},${color.b})`,
          vx: (Math.random() - 0.5) * 0.015, vy: (Math.random() - 0.5) * 0.015,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.003 + Math.random() * 0.007,
          twinkleIntensity: 0.15 + Math.random() * 0.2,
        });
      }
      
      const midCount = Math.floor(area / 20000);
      for (let i = 0; i < midCount; i++) {
        const color = getStarColor();
        const size = 0.5 + Math.random() * 0.8;
        stars.push({
          x: Math.random() * w, y: Math.random() * h, size, layer: 1,
          baseOpacity: 0.35 + Math.random() * 0.35, color,
          colorStr: `rgb(${color.r},${color.g},${color.b})`,
          vx: (Math.random() - 0.5) * 0.03, vy: (Math.random() - 0.5) * 0.03,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.007 + Math.random() * 0.011,
          twinkleIntensity: 0.2 + Math.random() * 0.25,
        });
      }
      
      const nearCount = Math.floor(area / 70000);
      for (let i = 0; i < nearCount; i++) {
        const color = getStarColor();
        const size = 1.0 + Math.random() * 1.2;
        stars.push({
          x: Math.random() * w, y: Math.random() * h, size, layer: 2,
          baseOpacity: 0.65 + Math.random() * 0.35, color,
          colorStr: `rgb(${color.r},${color.g},${color.b})`,
          vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.06,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.012 + Math.random() * 0.018,
          twinkleIntensity: 0.25 + Math.random() * 0.3,
          hasSpikes: size > 1.5, spikeLen: size * 4.5,
        });
      }
      
      const clusterCount = 2 + Math.floor(Math.random() * 2);
      for (let c = 0; c < clusterCount; c++) {
        const cx = Math.random() * w, cy = Math.random() * h;
        const clusterStars = 12 + Math.floor(Math.random() * 15);
        for (let i = 0; i < clusterStars; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.pow(Math.random(), 0.5) * 100;
          const color = getStarColor();
          const size = 0.3 + Math.random() * 0.6;
          stars.push({
            x: Math.max(0, Math.min(w, cx + Math.cos(angle) * dist)),
            y: Math.max(0, Math.min(h, cy + Math.sin(angle) * dist)),
            size, layer: 1, baseOpacity: 0.25 + Math.random() * 0.35, color,
            colorStr: `rgb(${color.r},${color.g},${color.b})`,
            vx: (Math.random() - 0.5) * 0.03, vy: (Math.random() - 0.5) * 0.03,
            twinklePhase: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.006 + Math.random() * 0.01,
            twinkleIntensity: 0.12 + Math.random() * 0.18,
          });
        }
      }
      return stars;
    };

    // initDust removed - circular blobs disabled

    // Darker, more subtle nebula colors (near monochrome)
    const nebulaColors = [
      { r: 35, g: 35, b: 50 },  // Dark blue-gray
      { r: 30, g: 40, b: 50 },  // Steel blue
      { r: 40, g: 35, b: 45 },  // Dark purple-gray
      { r: 25, g: 35, b: 45 },  // Deep blue
      { r: 45, g: 40, b: 40 },  // Warm dark gray
    ];

    const initNebulas = (w, h) => {
      const nebulas = [], count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
        nebulas.push({
          x: Math.random() * w, y: Math.random() * h,
          radius: 200 + Math.random() * 400, color,
          baseOpacity: 0.06 + Math.random() * 0.04,  // Very subtle
          vx: (Math.random() - 0.5) * 0.04, vy: (Math.random() - 0.5) * 0.04,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.0015 + Math.random() * 0.0025,
        });
      }
      return nebulas;
    };

    const meteorColors = [
      { r: 255, g: 255, b: 255 }, { r: 200, g: 230, b: 255 }, { r: 255, g: 220, b: 180 },
    ];

    const createMeteor = (w) => {
      const speedVal = 8 + Math.random() * 8;
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.5;
      const color = meteorColors[Math.floor(Math.random() * meteorColors.length)];
      return {
        x: Math.random() * w * 1.2 - w * 0.1, y: -20,
        vx: Math.cos(angle) * speedVal * 0.3, vy: Math.sin(angle) * speedVal,
        speed: speedVal, length: 80 + Math.random() * 120,
        opacity: 0.9, life: 1.0, decay: 0.012 + Math.random() * 0.008,
        color, sparkTimer: 0,
      };
    };

    const cometColors = [{ r: 150, g: 220, b: 255 }, { r: 255, g: 240, b: 200 }];

    const createComet = (w, h) => {
      const speedVal = 1.5 + Math.random() * 1.5;
      const fromLeft = Math.random() > 0.5;
      const startX = fromLeft ? -80 : w + 80, startY = Math.random() * h * 0.4;
      const targetX = fromLeft ? w + 100 : -100, targetY = h * 0.4 + Math.random() * h * 0.4;
      const dirAngle = Math.atan2(targetY - startY, targetX - startX);
      const color = cometColors[Math.floor(Math.random() * cometColors.length)];
      return {
        x: startX, y: startY,
        vx: Math.cos(dirAngle) * speedVal, vy: Math.sin(dirAngle) * speedVal,
        speed: speedVal, length: 250 + Math.random() * 200,
        opacity: 0.85, life: 1.0, decay: 0.002 + Math.random() * 0.001,
        color, coreSize: 5 + Math.random() * 3, sparkTimer: 0,
      };
    };

    const createSpark = (x, y, baseVx, baseVy, color) => {
      const angle = Math.random() * Math.PI * 2, speed = 0.3 + Math.random() * 1.2;
      return {
        x, y, vx: baseVx * 0.2 + Math.cos(angle) * speed,
        vy: baseVy * 0.2 + Math.sin(angle) * speed,
        life: 1.0, decay: 0.04 + Math.random() * 0.04,
        size: 0.4 + Math.random() * 0.8, color,
      };
    };

    if (starsRef.current.length === 0) starsRef.current = initStars(width, height);
    // REMOVED: dustRef initialization (circular blobs)
    if (nebulasRef.current.length === 0) nebulasRef.current = initNebulas(width, height);

    const TWO_PI = Math.PI * 2;
    const animate = (timestamp) => {
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const opacityDiff = targetOpacityRef.current - opacityRef.current;
      if (Math.abs(opacityDiff) > 0.005) {
        opacityRef.current += opacityDiff * 0.025;
      } else {
        opacityRef.current = targetOpacityRef.current;
      }

      if (opacityRef.current < 0.01) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      const globalOpacity = opacityRef.current;

      // REMOVED: Dust rendering - circular blobs disabled

      // Nebulas (soft gradient spheres)
      const nebulas = nebulasRef.current;
      const nebulaLen = nebulas.length;
      for (let i = 0; i < nebulaLen; i++) {
        const n = nebulas[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < -n.radius) n.x = width + n.radius;
        else if (n.x > width + n.radius) n.x = -n.radius;
        if (n.y < -n.radius) n.y = height + n.radius;
        else if (n.y > height + n.radius) n.y = -n.radius;

        n.pulsePhase += n.pulseSpeed;
        const pulse = 0.9 + 0.1 * Math.sin(n.pulsePhase);
        const opacity = n.baseOpacity * pulse * globalOpacity;
        const { r, g, b } = n.color;

        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
        gradient.addColorStop(0.2, `rgba(${r},${g},${b},${opacity * 0.8})`);
        gradient.addColorStop(0.4, `rgba(${r},${g},${b},${opacity * 0.5})`);
        gradient.addColorStop(0.7, `rgba(${r},${g},${b},${opacity * 0.2})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, TWO_PI);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Optimized star rendering
      const stars = starsRef.current;
      const starLen = stars.length;
      for (let i = 0; i < starLen; i++) {
        const star = stars[i];
        star.x += star.vx; star.y += star.vy;
        if (star.x < -5) star.x = width + 5;
        else if (star.x > width + 5) star.x = -5;
        if (star.y < -5) star.y = height + 5;
        else if (star.y > height + 5) star.y = -5;

        star.twinklePhase += star.twinkleSpeed;
        const scintillation = 1 - star.twinkleIntensity + 
          star.twinkleIntensity * (0.5 + 0.5 * Math.sin(star.twinklePhase) * Math.sin(star.twinklePhase * 1.3 + 0.7) * Math.sin(star.twinklePhase * 0.8 + 0.3));
        const opacity = star.baseOpacity * scintillation * globalOpacity;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = star.colorStr;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, TWO_PI);
        ctx.fill();

        if (star.layer >= 1) {
          ctx.globalAlpha = opacity * 0.3;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 2.2, 0, TWO_PI);
          ctx.fill();
        }

        if (star.hasSpikes && opacity > 0.4) {
          ctx.globalAlpha = opacity * 0.5;
          ctx.strokeStyle = star.colorStr;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(star.x - star.spikeLen, star.y);
          ctx.lineTo(star.x + star.spikeLen, star.y);
          ctx.moveTo(star.x, star.y - star.spikeLen);
          ctx.lineTo(star.x, star.y + star.spikeLen);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Meteor/Comet spawning
      const timeSinceLastMeteor = timestamp - lastMeteorTimeRef.current;
      if (globalOpacity > 0.5 && timeSinceLastMeteor > nextMeteorDelayRef.current && meteorsRef.current.length < 2) {
        meteorsRef.current.push(createMeteor(width, height));
        lastMeteorTimeRef.current = timestamp;
        nextMeteorDelayRef.current = 4000 + Math.random() * 8000;
      }

      const timeSinceLastComet = timestamp - lastCometTimeRef.current;
      if (globalOpacity > 0.5 && timeSinceLastComet > nextCometDelayRef.current && cometsRef.current.length < 1) {
        cometsRef.current.push(createComet(width, height));
        lastCometTimeRef.current = timestamp;
        nextCometDelayRef.current = 20000 + Math.random() * 25000;
      }

      // Reverse-iterate sparks for efficient removal
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        spark.x += spark.vx; spark.y += spark.vy;
        spark.vy += 0.015; spark.life -= spark.decay;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const { r, g, b } = spark.color;
        ctx.globalAlpha = spark.life * globalOpacity * 0.7;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Reverse-iterate meteors
      const meteors = meteorsRef.current;
      for (let i = meteors.length - 1; i >= 0; i--) {
        const meteor = meteors[i];
        meteor.x += meteor.vx; meteor.y += meteor.vy;
        meteor.life -= meteor.decay; meteor.sparkTimer += 1;

        if (meteor.sparkTimer > 2) {
          if (Math.random() > 0.6) {
            sparks.push(createSpark(meteor.x, meteor.y, meteor.vx, meteor.vy, meteor.color));
          }
          meteor.sparkTimer = 0;
        }

        if (meteor.life <= 0 || meteor.y > height + 50) {
          meteors.splice(i, 1);
          continue;
        }

        const { r, g, b } = meteor.color;
        const meteorOpacity = meteor.opacity * meteor.life * globalOpacity;
        const invSpeed = 1 / meteor.speed;
        const tailX = meteor.x - meteor.vx * invSpeed * meteor.length * meteor.life;
        const tailY = meteor.y - meteor.vy * invSpeed * meteor.length * meteor.life;

        const gradient = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
        gradient.addColorStop(0.6, `rgba(${r},${g},${b},${meteorOpacity * 0.4})`);
        gradient.addColorStop(0.9, `rgba(255,255,255,${meteorOpacity * 0.8})`);
        gradient.addColorStop(1, `rgba(255,255,255,${meteorOpacity})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(meteor.x, meteor.y);
        ctx.strokeStyle = gradient; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.stroke();

        ctx.globalAlpha = meteorOpacity;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(meteor.x, meteor.y, 2, 0, TWO_PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Reverse-iterate comets
      const comets = cometsRef.current;
      for (let i = comets.length - 1; i >= 0; i--) {
        const comet = comets[i];
        comet.x += comet.vx; comet.y += comet.vy;
        comet.life -= comet.decay; comet.sparkTimer += 1;

        if (comet.sparkTimer > 2) {
          sparks.push(createSpark(comet.x, comet.y, comet.vx, comet.vy, comet.color));
          comet.sparkTimer = 0;
        }

        if (comet.life <= 0 || comet.x < -250 || comet.x > width + 250) {
          comets.splice(i, 1);
          continue;
        }

        const { r, g, b } = comet.color;
        const cometOpacity = comet.opacity * comet.life * globalOpacity;
        const invSpeed = 1 / comet.speed;
        const tailX = comet.x - comet.vx * invSpeed * comet.length * comet.life;
        const tailY = comet.y - comet.vy * invSpeed * comet.length * comet.life;

        const tailGradient = ctx.createLinearGradient(tailX, tailY, comet.x, comet.y);
        tailGradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
        tailGradient.addColorStop(0.4, `rgba(${r},${g},${b},${cometOpacity * 0.15})`);
        tailGradient.addColorStop(0.8, `rgba(255,255,255,${cometOpacity * 0.5})`);
        tailGradient.addColorStop(1, `rgba(255,255,255,${cometOpacity})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(comet.x, comet.y);
        ctx.strokeStyle = tailGradient; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.stroke();

        const coreGradient = ctx.createRadialGradient(
          comet.x, comet.y, 0, comet.x, comet.y, comet.coreSize * 2.5
        );
        coreGradient.addColorStop(0, `rgba(255,255,255,${cometOpacity})`);
        coreGradient.addColorStop(0.4, `rgba(255,255,255,${cometOpacity * 0.6})`);
        coreGradient.addColorStop(0.7, `rgba(${r},${g},${b},${cometOpacity * 0.3})`);
        coreGradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.beginPath();
        ctx.arc(comet.x, comet.y, comet.coreSize * 2.5, 0, TWO_PI);
        ctx.fillStyle = coreGradient;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = canvas.offsetWidth; height = canvas.offsetHeight;
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      starsRef.current = initStars(width, height);
      // REMOVED: dustRef resize (circular blobs)
      nebulasRef.current = initNebulas(width, height);
    };

    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 200);
    };

    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
    };

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('visibilitychange', handleVisibility);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(resizeTimeout);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isDarkMode]);

  useEffect(() => {
    targetOpacityRef.current = active ? 1 : 0;
  }, [active]);

  if (!isDarkMode) return null;

  return (
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </Box>
  );
}

export default memo(StarfieldCanvas);
