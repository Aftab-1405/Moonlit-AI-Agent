import { useEffect, useRef, useState } from 'react';
import { Box, Slider } from '@mui/material';

export default function ContrastControl({ value, label, onPreview, onChange, onCancelPreview }) {
  const [draft, setDraft] = useState(value);
  const live = useRef(value),
    committed = useRef(value),
    cancelled = useRef(false),
    frame = useRef(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    if (value !== committed.current) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      live.current = committed.current = value;
      cancelled.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- External reset reconciliation.
      setDraft(value);
    }
  }, [value]);
  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const commit = () => {
    cancelFrame();
    if (cancelled.current) return;
    setDraft(live.current);
    if (live.current !== committed.current) {
      committed.current = live.current;
      onChange(live.current);
    } else onCancelPreview();
  };
  const cancel = () => {
    cancelled.current = true;
    cancelFrame();
    live.current = committed.current;
    setDraft(committed.current);
    onCancelPreview();
  };
  return (
    <Box
      sx={{ width: 180, maxWidth: '100%', display: 'flex', gap: 2, alignItems: 'center' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else cancelled.current = false;
      }}
    >
      <Slider
        min={0}
        max={100}
        step={1}
        value={draft}
        aria-label={label}
        onMouseDownCapture={() => {
          cancelled.current = false;
        }}
        onTouchStartCapture={() => {
          cancelled.current = false;
        }}
        onTouchCancel={cancel}
        onPointerCancel={cancel}
        onChange={(_, v) => {
          if (cancelled.current) return;
          live.current = v;
          if (frame.current === null)
            frame.current = requestAnimationFrame(() => {
              frame.current = null;
              setDraft(live.current);
              onPreview(live.current);
            });
        }}
        onChangeCommitted={(_, v) => {
          if (!cancelled.current) {
            live.current = v;
            commit();
          }
        }}
        onBlur={commit}
        sx={{
          height: 2,
          py: 1,
          color: 'var(--profile-accent)',
          '& .MuiSlider-thumb': { width: 12, height: 12 },
        }}
      />
      <output style={{ fontSize: 12, minWidth: 20, textAlign: 'right' }}>{draft}</output>
    </Box>
  );
}
