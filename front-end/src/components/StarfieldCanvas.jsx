import { useEffect, useRef, memo } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

/**
 * Moonlit Starfield - Serene, mystical night sky
 * Silvery stars, soft indigo/purple nebulas with teal hints, elegant meteors.
 * Evokes the tranquil glow of moonlight.
 */
function StarfieldCanvas({ active = false }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const starsRef = useRef([]);
  const nebulasRef = useRef([]);
  const meteorsRef = useRef([]);
  const opacityRef = useRef(0);
  const targetOpacityRef = useRef(0);
  const lastMeteorTimeRef = useRef(0);
  const nextMeteorDelayRef = useRef(0);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    if (!isDarkMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (nextMeteorDelayRef.current === 0) {
      nextMeteorDelayRef.current = 8000 + Math.random() * 12000;
    }

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Moonlit star colors - silvery whites with cool blue/indigo hints
    const starColors = [
      { r: 155, g: 168, b: 180 },  // Cool silver (dim)
      { r: 184, g: 196, b: 207 },  // Silver-blue
      { r: 200, g: 212, b: 220 },  // Bright silver
      { r: 232, g: 236, b: 240 },  // Moonlight white
      { r: 199, g: 210, b: 254 },  // Soft indigo tint (C7D2FE)
      { r: 165, g: 180, b: 252 },  // Indigo star (A5B4FC)
    ];

    const getStarColor = () => starColors[Math.floor(Math.random() * starColors.length)];

    const initStars = (w, h) => {
      const stars = [];
      const area = w * h;

      // Distant layer - subtle background
      const distantCount = Math.floor(area / 8000);
      for (let i = 0; i < distantCount; i++) {
        const color = getStarColor();
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 0.3 + Math.random() * 0.5,
          baseOpacity: 0.15 + Math.random() * 0.2,
          color,
          colorStr: `rgb(${color.r},${color.g},${color.b})`,
          vx: (Math.random() - 0.5) * 0.01,
          vy: (Math.random() - 0.5) * 0.01,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.002 + Math.random() * 0.005,
          twinkleIntensity: 0.15 + Math.random() * 0.2,
        });
      }

      // Mid layer
      const midCount = Math.floor(area / 25000);
      for (let i = 0; i < midCount; i++) {
        const color = getStarColor();
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 0.5 + Math.random() * 0.7,
          baseOpacity: 0.25 + Math.random() * 0.25,
          color,
          colorStr: `rgb(${color.r},${color.g},${color.b})`,
          vx: (Math.random() - 0.5) * 0.02,
          vy: (Math.random() - 0.5) * 0.02,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.004 + Math.random() * 0.008,
          twinkleIntensity: 0.2 + Math.random() * 0.25,
          layer: 1,
        });
      }

      // Near layer - brighter, fewer
      const nearCount = Math.floor(area / 80000);
      for (let i = 0; i < nearCount; i++) {
        const color = getStarColor();
        const size = 0.9 + Math.random() * 0.8;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size,
          baseOpacity: 0.4 + Math.random() * 0.35,
          color,
          colorStr: `rgb(${color.r},${color.g},${color.b})`,
          vx: (Math.random() - 0.5) * 0.035,
          vy: (Math.random() - 0.5) * 0.035,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.006 + Math.random() * 0.01,
          twinkleIntensity: 0.25 + Math.random() * 0.3,
          layer: 2,
        });
      }

      return stars;
    };

    // Moonlit nebula colors - deep indigo, purple, with subtle teal hints
    const nebulaColors = [
      { r: 26, g: 31, b: 51 },    // Deep indigo-charcoal
      { r: 35, g: 28, b: 52 },    // Purple-charcoal
      { r: 20, g: 35, b: 45 },    // Teal-charcoal hint
      { r: 45, g: 40, b: 65 },    // Lifted indigo-purple
      { r: 30, g: 40, b: 55 },    // Cool blue-charcoal
    ];

    const initNebulas = (w, h) => {
      const nebulas = [];
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
        nebulas.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 180 + Math.random() * 300,
          color,
          baseOpacity: 0.08 + Math.random() * 0.06,
          vx: (Math.random() - 0.5) * 0.03,
          vy: (Math.random() - 0.5) * 0.03,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.001 + Math.random() * 0.002,
        });
      }
      return nebulas;
    };

    // Meteor - elegant silvery trail with soft indigo hint
    const createMeteor = (w) => {
      const speedVal = 10 + Math.random() * 8;
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.4;
      return {
        x: Math.random() * w * 1.2 - w * 0.1,
        y: -30,
        vx: Math.cos(angle) * speedVal * 0.3,
        vy: Math.sin(angle) * speedVal,
        speed: speedVal,
        length: 120 + Math.random() * 80,
        opacity: 0.85,
        life: 1.0,
        decay: 0.01 + Math.random() * 0.008,
      };
    };

    if (starsRef.current.length === 0) starsRef.current = initStars(width, height);
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

      // Render nebulas first (background)
      const nebulas = nebulasRef.current;
      for (let i = 0; i < nebulas.length; i++) {
        const n = nebulas[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -n.radius) n.x = width + n.radius;
        else if (n.x > width + n.radius) n.x = -n.radius;
        if (n.y < -n.radius) n.y = height + n.radius;
        else if (n.y > height + n.radius) n.y = -n.radius;

        n.pulsePhase += n.pulseSpeed;
        const pulse = 0.85 + 0.15 * Math.sin(n.pulsePhase);
        const opacity = n.baseOpacity * pulse * globalOpacity;
        const { r, g, b } = n.color;

        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
        gradient.addColorStop(0.3, `rgba(${r},${g},${b},${opacity * 0.7})`);
        gradient.addColorStop(0.6, `rgba(${r},${g},${b},${opacity * 0.35})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, TWO_PI);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Render stars
      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.x += star.vx;
        star.y += star.vy;

        if (star.x < -5) star.x = width + 5;
        else if (star.x > width + 5) star.x = -5;
        if (star.y < -5) star.y = height + 5;
        else if (star.y > height + 5) star.y = -5;

        star.twinklePhase += star.twinkleSpeed;
        const scintillation = 1 - star.twinkleIntensity +
          star.twinkleIntensity * (0.5 + 0.5 * Math.sin(star.twinklePhase) * Math.sin(star.twinklePhase * 1.2 + 0.5));
        const opacity = star.baseOpacity * scintillation * globalOpacity;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = star.colorStr;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, TWO_PI);
        ctx.fill();

        // Soft glow for brighter stars
        if (star.layer >= 1 && opacity > 0.2) {
          ctx.globalAlpha = opacity * 0.25;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 2.5, 0, TWO_PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Meteor spawning - every 5-12 seconds
      const timeSinceLastMeteor = timestamp - lastMeteorTimeRef.current;
      if (globalOpacity > 0.5 && timeSinceLastMeteor > nextMeteorDelayRef.current && meteorsRef.current.length < 2) {
        meteorsRef.current.push(createMeteor(width));
        lastMeteorTimeRef.current = timestamp;
        nextMeteorDelayRef.current = 5000 + Math.random() * 7000;
      }

      // Render meteors
      const meteors = meteorsRef.current;
      for (let i = meteors.length - 1; i >= 0; i--) {
        const meteor = meteors[i];
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        meteor.life -= meteor.decay;

        if (meteor.life <= 0 || meteor.y > height + 50) {
          meteors.splice(i, 1);
          continue;
        }

        const meteorOpacity = meteor.opacity * meteor.life * globalOpacity;
        const invSpeed = 1 / meteor.speed;
        const tailX = meteor.x - meteor.vx * invSpeed * meteor.length * meteor.life;
        const tailY = meteor.y - meteor.vy * invSpeed * meteor.length * meteor.life;

        // Moonlit meteor trail - silvery with indigo hints
        const gradient = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        gradient.addColorStop(0, `rgba(165,180,252,0)`);           // Indigo fade
        gradient.addColorStop(0.3, `rgba(184,196,207,${meteorOpacity * 0.2})`);   // Silver-blue
        gradient.addColorStop(0.6, `rgba(200,212,220,${meteorOpacity * 0.5})`);   // Bright silver
        gradient.addColorStop(0.85, `rgba(232,236,240,${meteorOpacity * 0.8})`);  // Moonlight
        gradient.addColorStop(1, `rgba(232,236,240,${meteorOpacity})`);           // Pure moonlight

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(meteor.x, meteor.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Small bright head with slight indigo glow
        ctx.globalAlpha = meteorOpacity * 0.8;
        ctx.fillStyle = '#E8ECF0';  // Silvery moonlight
        ctx.beginPath();
        ctx.arc(meteor.x, meteor.y, 1.5, 0, TWO_PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      starsRef.current = initStars(width, height);
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
