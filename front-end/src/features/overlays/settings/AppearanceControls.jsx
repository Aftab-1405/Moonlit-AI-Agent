import { useEffect, useId, useRef, useState } from 'react';
import { Box, ButtonBase, Popover, TextField, Typography } from '@mui/material';
import { normalizeHex } from '@/theme/appearance';
import { hexToHsv, hsvToHex } from '@/theme/colorModel';
export function NumberControl({ label, value, min, max, onChange }) {
  const [draft, setDraft] = useState(String(value)),
    [error, setError] = useState(false),
    lastCommit = useRef(value);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile reset/account changes without persisting drafts.
    setDraft(String(value));
    setError(false);
    lastCommit.current = value;
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) {
      if (n !== lastCommit.current) {
        lastCommit.current = n;
        onChange(n);
      }
      setError(false);
    } else setError(true);
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <TextField
        type="number"
        size="small"
        value={draft}
        error={error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            setDraft(String(value));
            setError(false);
          }
        }}
        slotProps={{
          htmlInput: {
            'aria-label': label,
            min,
            max,
            step: 1,
            'aria-description': error ? `Enter a whole number from ${min} to ${max}.` : undefined,
          },
        }}
        sx={{
          width: '64px !important',
          minWidth: 64,
          maxWidth: 64,
          '& .MuiInputBase-root': { height: 28, minHeight: 28 },
          '& input': { p: '4px 8px', fontSize: 14 },
        }}
      />
      <Typography data-appearance-unit sx={{ fontSize: 12, color: 'text.secondary' }}>
        px
      </Typography>
    </Box>
  );
}

const clamp = (n) => Math.max(0, Math.min(1, n));
const spectrum = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';
const rangeSx = {
  appearance: 'none',
  display: 'block',
  width: '100%',
  height: 12,
  m: 0,
  borderRadius: '999px',
  cursor: 'pointer',
  touchAction: 'none',
  '&::-webkit-slider-thumb': {
    appearance: 'none',
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    border: '2px solid #333',
    boxShadow: '0 0 0 1px #fff',
  },
  '&::-moz-range-thumb': {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#fff',
    border: '2px solid #333',
    boxShadow: '0 0 0 1px #fff',
  },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'text.secondary', outlineOffset: 5 },
};

export function ColorControl({ label, value, resetKey, onChange, onPreview, onCancelPreview }) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState(''),
    [anchor, setAnchor] = useState(null),
    [color, setColor] = useState(() => hexToHsv(value));
  const errorId = useId();
  const live = useRef(color),
    committed = useRef(color),
    lastCommit = useRef(value),
    drag = useRef(null),
    cancelled = useRef(false),
    ownEcho = useRef(false),
    source = useRef({ value, resetKey }),
    frame = useRef(null);
  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    const changed = source.current.value !== value || source.current.resetKey !== resetKey;
    source.current = { value, resetKey };
    if (!changed) return;
    const echo = ownEcho.current && value === lastCommit.current;
    ownEcho.current = false;
    if (echo) return;
    // The caller supplies a stable profile revision. Same-color external resets discard hue,
    // while our own saved-value echo retains the HSV dimensions hex cannot represent.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    drag.current = null;
    cancelled.current = true;
    live.current = committed.current = hexToHsv(value);
    lastCommit.current = value;
    setColor(live.current);
    setDraft(value);
    setError('');
    setAnchor(null);
    onCancelPreview?.();
  }, [value, resetKey, onCancelPreview]);
  const paint = () => {
    frame.current = null;
    setColor(live.current);
    setDraft(hsvToHex(live.current));
    setError('');
    onPreview?.(hsvToHex(live.current));
  };
  const commitPicker = () => {
    cancelFrame();
    if (cancelled.current) return;
    committed.current = { ...live.current };
    const hex = hsvToHex(live.current);
    setColor(live.current);
    setDraft(hex);
    setError('');
    if (hex !== lastCommit.current) {
      lastCommit.current = hex;
      ownEcho.current = true;
      onChange(hex);
    } else onCancelPreview?.();
  };
  const choose = (patch, transient = false) => {
    if (cancelled.current) return;
    live.current = { ...live.current, ...patch };
    if (transient) {
      if (frame.current === null) frame.current = requestAnimationFrame(paint);
    } else commitPicker();
  };
  const cancel = () => {
    cancelled.current = true;
    drag.current = null;
    cancelFrame();
    live.current = { ...committed.current };
    setColor(live.current);
    setDraft(lastCommit.current);
    setError('');
    onCancelPreview?.();
  };
  const commitHex = () => {
    if (cancelled.current) return;
    const hex = normalizeHex(draft);
    if (!hex) {
      setError('Enter a valid 6-digit hex color.');
      return;
    }
    cancelFrame();
    const next = hexToHsv(hex);
    // Achromatic hex does not carry hue. Keep the user's editing hue while this picker is open.
    if (next.s === 0 && anchor) next.h = live.current.h;
    live.current = committed.current = next;
    setColor(next);
    setDraft(hex);
    setError('');
    if (hex !== lastCommit.current) {
      lastCommit.current = hex;
      ownEcho.current = true;
      onChange(hex);
    } else onCancelPreview?.();
  };
  const hexEvents = {
    onChange: (e) => {
      cancelled.current = false;
      setDraft(e.target.value);
    },
    onBlur: () => {
      if (!drag.current) commitHex();
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitHex();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        if (anchor) setAnchor(null);
      } else cancelled.current = false;
    },
  };
  const begin = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.focus({ preventScroll: true });
    cancelled.current = false;
    drag.current = { id: e.pointerId, node: e.currentTarget };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const finish = (e) => {
    if (drag.current?.id !== e.pointerId || drag.current?.node !== e.currentTarget) return;
    drag.current = null;
    commitPicker();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const planePoint = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    choose(
      { s: clamp((e.clientX - r.left) / r.width), v: 1 - clamp((e.clientY - r.top) / r.height) },
      true,
    );
  };
  const dimension = (name, channel, max, background) => (
    <Box
      component="label"
      sx={{ display: 'block', mt: 1.5, fontSize: 12, color: 'text.secondary' }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <span>{name}</span>
        <output>
          {Math.round(color[channel] * (max === 100 ? 100 : 1))}
          {max === 100 ? '%' : '°'}
        </output>
      </Box>
      <Box sx={{ py: 1, '@media (pointer: coarse)': { py: 2 } }}>
        <Box
          component="input"
          type="range"
          aria-label={name}
          min={0}
          max={max}
          step={1}
          value={Math.round(color[channel] * (max === 100 ? 100 : 1))}
          aria-valuetext={`${Math.round(color[channel] * (max === 100 ? 100 : 1))}${max === 100 ? ' percent' : ' degrees'}`}
          onPointerDown={begin}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={(e) => {
            if (drag.current?.node === e.currentTarget) {
              drag.current = null;
              commitPicker();
            }
          }}
          onChange={(e) =>
            choose(
              { [channel]: Number(e.target.value) / (max === 100 ? 100 : 1) },
              drag.current !== null,
            )
          }
          onBlur={(e) => {
            if (!drag.current || drag.current.node === e.currentTarget) {
              drag.current = null;
              commitPicker();
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') cancelled.current = false;
          }}
          sx={{ ...rangeSx, background }}
        />
      </Box>
    </Box>
  );
  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          border: '1px solid',
          borderColor: error
            ? theme.palette.error.main
            : `var(--profile-border, ${theme.palette.divider})`,
          borderRadius: '999px',
          px: 0.5,
          height: 30,
          width: 112,
          '@media (pointer: coarse)': { height: 44, width: 128 },
        })}
      >
        <ButtonBase
          aria-label={`${label} color`}
          aria-haspopup="dialog"
          aria-expanded={!!anchor}
          onClick={(e) => {
            cancelled.current = false;
            ownEcho.current = false;
            live.current = committed.current = hexToHsv(value);
            lastCommit.current = value;
            setColor(live.current);
            setDraft(value);
            setError('');
            setAnchor(e.currentTarget);
          }}
          sx={(theme) => ({
            width: 28,
            height: 28,
            borderRadius: '50%',
            flexShrink: 0,
            '@media (pointer: coarse)': { width: 44, height: 44 },
            '&:hover': { backgroundColor: `var(--profile-hover, ${theme.palette.action.hover})` },
            '&:active': {
              backgroundColor: `var(--profile-selected, ${theme.palette.action.selected})`,
            },
            '&.Mui-focusVisible': {
              outline: '2px solid',
              outlineColor: 'text.secondary',
              outlineOffset: 1,
            },
            '&::after': {
              content: '""',
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '1px solid',
              borderColor: `var(--profile-border, ${theme.palette.divider})`,
              backgroundColor: normalizeHex(draft) || value,
            },
          })}
        />
        <Box
          component="input"
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          value={draft}
          maxLength={7}
          {...hexEvents}
          sx={{
            width: 70,
            minWidth: 0,
            border: 0,
            p: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--profile-ink, inherit)',
            fontFamily: 'inherit',
            fontSize: 12,
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'text.secondary',
              outlineOffset: 1,
            },
          }}
        />
      </Box>
      {error && (
        <Typography
          id={errorId}
          role="alert"
          sx={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: 180,
            fontSize: 11,
            color: 'error.main',
            zIndex: 1,
            backgroundColor: 'background.paper',
          }}
        >
          {error}
        </Typography>
      )}
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={(_, reason) => {
          if (reason === 'escapeKeyDown') cancel();
          else {
            drag.current = null;
            commitHex();
          }
          setAnchor(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box
          role="dialog"
          aria-label={`${label} picker`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              cancel();
              setAnchor(null);
            }
          }}
          sx={{ width: 272, maxWidth: 'calc(100vw - 32px)', p: 2 }}
        >
          <Box
            role="group"
            aria-label="Saturation and brightness plane"
            tabIndex={-1}
            onPointerDown={(e) => {
              begin(e);
              if (drag.current?.node === e.currentTarget && drag.current.id === e.pointerId)
                planePoint(e);
            }}
            onPointerMove={(e) => {
              if (drag.current?.node === e.currentTarget && drag.current.id === e.pointerId)
                planePoint(e);
            }}
            onPointerUp={(e) => {
              if (drag.current?.id === e.pointerId && drag.current?.node === e.currentTarget) {
                planePoint(e);
                finish(e);
              }
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={(e) => {
              if (drag.current?.node === e.currentTarget) cancel();
            }}
            sx={{
              height: 160,
              position: 'relative',
              borderRadius: 1,
              touchAction: 'none',
              cursor: 'crosshair',
              background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${color.h} 100% 50%))`,
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left: `${color.s * 100}%`,
                top: `${(1 - color.v) * 100}%`,
                width: 12,
                height: 12,
                transform: 'translate(-50%,-50%)',
                borderRadius: '50%',
                border: '2px solid #fff',
                boxShadow: '0 0 0 1px #333',
                pointerEvents: 'none',
              }}
            />
          </Box>
          {dimension('Hue', 'h', 359, spectrum)}
          {dimension(
            'Saturation',
            's',
            100,
            `linear-gradient(to right,${hsvToHex({ ...color, s: 0 })},${hsvToHex({ ...color, s: 1 })})`,
          )}
          {dimension(
            'Brightness',
            'v',
            100,
            `linear-gradient(to right,#000,${hsvToHex({ ...color, v: 1 })})`,
          )}
          <TextField
            label="Hex"
            size="small"
            value={draft}
            {...hexEvents}
            error={!!error}
            helperText={error || undefined}
            slotProps={{ htmlInput: { 'aria-label': `${label} picker hex`, maxLength: 7 } }}
            sx={{ mt: 1.5, width: '100%' }}
          />
        </Box>
      </Popover>
    </Box>
  );
}
