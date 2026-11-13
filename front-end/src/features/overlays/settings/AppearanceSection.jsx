import { Children, Fragment, useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Tooltip,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  Select,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { CopyIcon, ImportIcon, ExpandMoreIcon, SendIcon } from '@/components/icons';
import { useAppearanceReducedMotion } from '@/hooks/useAppearanceReducedMotion';
import { KEYBOARD_FOCUS_SELECTOR } from '@/styles/mediaQueries';
import { useSettings } from '@/contexts/SettingsContext';
import { PreferenceRow } from '@/features/overlays/preference-surface';
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  updateProfile,
  selectPreset,
  importTheme,
  exportTheme,
} from '@/theme/appearance';
import { getAccentBase } from '@/theme/tokens/semantic';
import { ColorControl, NumberControl } from './AppearanceControls';
import ContrastControl from './ContrastControl';
import { profileVariables, useProfilePreview } from './profilePreview';
function Row(props) {
  return <PreferenceRow variant="appearance" tabIndex={-1} {...props} />;
}
function Group({ label, id, children, ref, style }) {
  return (
    <Box
      component="section"
      ref={ref}
      style={style}
      role="group"
      aria-label={label}
      id={id}
      tabIndex={id ? -1 : undefined}
      data-appearance-group
      sx={(theme) => ({
        border: '1px solid',
        borderColor: `var(--profile-border, ${theme.palette.divider})`,
        backgroundColor: 'var(--profile-bg, transparent)',
        color: 'var(--profile-ink, inherit)',
        '& ::selection': {
          backgroundColor: `var(--profile-selection, ${theme.palette.textSelection.background})`,
          color: `var(--profile-selection-ink, ${theme.palette.textSelection.foreground})`,
        },
        borderRadius: '10px',
        overflow: 'visible',
        mb: 1.5,
      })}
    >
      {Children.toArray(children).map((child, i) => (
        <Fragment key={child.key || i}>
          {i > 0 && (
            <Divider
              sx={(theme) => ({
                mx: 1.5,
                borderColor: `var(--profile-separator, ${theme.palette.divider})`,
              })}
            />
          )}
          {child}
        </Fragment>
      ))}
    </Box>
  );
}
const selectSx = {
  height: 30,
  borderRadius: '999px',
  fontSize: 12,
  minWidth: 112,
  '& .MuiSelect-select': { py: 0.5, px: 1.25, color: 'var(--profile-ink)' },
  backgroundColor: 'transparent',
  color: 'var(--profile-ink)',
  '& .MuiSelect-icon': { fontSize: 18, color: 'var(--profile-secondary)' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--profile-border)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--profile-secondary)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--profile-border)' },
  '&.Mui-focused:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--profile-secondary)',
  },
};
const profileIconSx = {
  width: 32,
  height: 32,
  minWidth: 32,
  color: 'var(--profile-secondary)',
  '&:hover': { color: 'var(--profile-ink)', backgroundColor: 'var(--profile-hover)' },
  '&:active': { backgroundColor: 'var(--profile-selected)' },
  '@media (pointer: coarse)': { width: 44, height: 44, minWidth: 44 },
};
const disclosureSx = {
  minHeight: 36,
  px: 1,
  ml: -1,
  gap: 0.75,
  borderRadius: '6px',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 500,
  color: 'text.secondary',
  backgroundColor: 'transparent',
  transition: 'none',
  '&:hover': { color: 'text.primary', backgroundColor: 'action.hover' },
  '&:active': { color: 'text.primary', backgroundColor: 'action.selected' },
  '&[aria-expanded="true"]': { color: 'text.secondary' },
  '&[aria-expanded="true"]:hover': { color: 'text.primary' },
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.secondary', outlineOffset: 2 },
  '@media (pointer: coarse)': { minHeight: 44 },
};
export default function AppearanceSection({ active = true, ...props }) {
  const { settingsScope } = useSettings();
  return active ? <AppearancePanel key={settingsScope} {...props} /> : null;
}
function AppearancePanel({ revealTarget, revealRequest, onTargetReady }) {
  const { settings, updateSetting } = useSettings(),
    theme = useTheme(),
    persisted = settings.appearance,
    effective = theme.palette.mode;
  const reducedMotion = useAppearanceReducedMotion();
  const [advanced, setAdvanced] = useState(false),
    [importMode, setImportMode] = useState(null),
    [share, setShare] = useState(''),
    [importError, setImportError] = useState(''),
    [status, setStatus] = useState('');
  const a = persisted;
  const { ref: profileRef, preview, cancel: cancelPreview } = useProfilePreview(persisted);
  useEffect(() => {
    if (revealTarget && /font|motion|separate|contrast|full-width|diff/.test(revealTarget)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Search reveals a collapsed target without changing preferences.
      setAdvanced(true);
    }
  }, [revealTarget, revealRequest]);
  const save = (patch) => updateSetting('appearance', { ...a, ...patch });
  const edit = (mode, patch) => {
    const next = updateProfile(persisted, mode, patch);
    if (JSON.stringify(next) !== JSON.stringify(persisted)) updateSetting('appearance', next);
    cancelPreview();
  };
  const modes = a.separateModes ? ['light', 'dark'] : [effective];
  const segmented = (label, value, options, onChange) => (
    <ToggleButtonGroup
      size="small"
      exclusive
      aria-label={label}
      value={value}
      onChange={(_, v) => {
        if (v !== null) onChange(v);
      }}
      sx={{
        border: 0,
        p: 0.25,
        gap: 0.25,
        backgroundColor: 'background.sunken',
        borderRadius: '999px',
        '& .MuiToggleButton-root': {
          minHeight: 26,
          height: 26,
          border: '0 !important',
          borderRadius: '999px !important',
          px: 1.25,
          fontSize: 12,
          whiteSpace: 'nowrap',
        },
        '& .Mui-selected': { backgroundColor: 'action.selected' },
      }}
    >
      {options.map(([id, text]) => (
        <ToggleButton key={id} value={id}>
          {text}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
  const toggle = (label, key, id, description) => (
    <Row label={label} id={id} description={description}>
      <Switch
        size="small"
        checked={a[key]}
        onChange={(e) => save({ [key]: e.target.checked })}
        slotProps={{ input: { role: 'switch', 'aria-label': label } }}
      />
    </Row>
  );
  return (
    <Box data-appearance-panel>
      <Typography
        component="h2"
        sx={{ fontSize: 16, fontWeight: 500, lineHeight: '24px', mb: 1.5 }}
      >
        Visual style
      </Typography>
      <Group label="Mode">
        <Row label="Mode" id="appearance-mode" sx={{ minHeight: 76 }}>
          <RadioGroup
            row
            aria-label="Mode"
            value={a.mode}
            onChange={(e) => save({ mode: e.target.value })}
            sx={{ gap: { xs: 1, sm: 2 }, flexWrap: 'nowrap' }}
          >
            {['system', 'light', 'dark'].map((mode) => (
              <FormControlLabel
                key={mode}
                value={mode}
                control={
                  <Radio
                    size="small"
                    slotProps={{ input: { 'aria-label': mode[0].toUpperCase() + mode.slice(1) } }}
                    sx={{ position: 'absolute', opacity: 0 }}
                  />
                }
                label={
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: { xs: 72, sm: 80 },
                      aspectRatio: '4 / 3',
                      borderRadius: '7px',
                      overflow: 'hidden',
                      background:
                        mode === 'system'
                          ? 'linear-gradient(90deg,#fcfcfc 50%,#212121 50%)'
                          : mode === 'dark'
                            ? '#212121'
                            : '#fcfcfc',
                      p: 1,
                      display: 'flex',
                      gap: 0.75,
                    }}
                  >
                    <Box
                      sx={{
                        width: 12,
                        borderRadius: 0.5,
                        background: mode === 'dark' ? '#414141' : '#cdcdcd',
                      }}
                    />
                    <Box sx={{ flex: 1, mt: 0.75 }}>
                      {[1, 2, 3].map((n) => (
                        <Box
                          key={n}
                          sx={{
                            height: 3,
                            mb: 0.75,
                            borderRadius: 1,
                            background: mode === 'dark' ? '#afafaf' : '#8f8f8f',
                            width: n === 3 ? '65%' : '100%',
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                }
                sx={{
                  m: 0,
                  position: 'relative',
                  borderRadius: '8px',
                  outline: a.mode === mode ? '2px solid' : '1px solid',
                  outlineColor: a.mode === mode ? 'text.secondary' : 'divider',
                  outlineOffset: 2,
                  [KEYBOARD_FOCUS_SELECTOR]: {
                    '&:has(:focus-visible)': {
                      outline: '2px solid',
                      outlineColor: 'accent.foreground',
                      outlineOffset: 3,
                    },
                  },
                  '& .MuiFormControlLabel-label': { lineHeight: 0 },
                }}
              />
            ))}
          </RadioGroup>
        </Row>
      </Group>
      {modes.map((mode) => {
        const p = a.profiles[mode];
        return (
          <Group
            key={mode}
            ref={profileRef(mode, 'theme')}
            style={profileVariables(a, mode)}
            label={a.separateModes ? `${mode} theme settings` : 'Theme settings'}
          >
            <Box
              id={mode === effective ? 'appearance-theme' : undefined}
              tabIndex={-1}
              sx={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 40,
                px: 1.5,
                py: 0.5,
                gap: 1,
              }}
            >
              <Typography
                component="h3"
                sx={{ fontSize: 14, fontWeight: 500, mr: 'auto', color: 'var(--profile-ink)' }}
              >
                {a.separateModes ? `${mode === 'light' ? 'Light' : 'Dark'} theme` : 'Theme'}
              </Typography>
              <Tooltip title="Import theme">
                <IconButton
                  size="small"
                  aria-label={a.separateModes ? `Import ${mode} theme` : 'Import theme'}
                  onClick={() => {
                    setImportMode(mode);
                    setShare('');
                    setImportError('');
                  }}
                  sx={profileIconSx}
                >
                  <ImportIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Copy theme">
                <IconButton
                  size="small"
                  aria-label={a.separateModes ? `Copy ${mode} theme` : 'Copy theme'}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(exportTheme(p, mode));
                      setStatus('Theme copied.');
                    } catch {
                      setStatus('Could not copy theme. Check clipboard permissions and try again.');
                    }
                  }}
                  sx={profileIconSx}
                >
                  <CopyIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Select
                size="small"
                value={p.presetId}
                inputProps={{ 'aria-label': `${mode} theme preset` }}
                sx={selectSx}
              >
                {[
                  ['chatgpt', 'ChatGPT'],
                  ['moonlit', 'Moonlit'],
                ].map(([id, label]) => (
                  <MenuItem
                    key={id}
                    value={id}
                    onClick={() => updateSetting('appearance', selectPreset(a, mode, id))}
                  >
                    Aa · {label}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Row label="Accent" id={mode === effective ? 'appearance-accent' : undefined}>
              <Select
                size="small"
                value={p.accent}
                inputProps={{ 'aria-label': `${mode} accent` }}
                onChange={(e) => edit(mode, { accent: e.target.value })}
                sx={selectSx}
              >
                {ACCENTS.map((c) => (
                  <MenuItem
                    key={c.id}
                    value={c.id}
                    sx={{
                      '&.Mui-selected, &.Mui-selected:hover': {
                        backgroundColor: 'action.selected',
                      },
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        mr: 1,
                        display: 'inline-block',
                        backgroundColor:
                          c.id === 'custom'
                            ? 'var(--profile-accent-main)'
                            : getAccentBase({ ...p, accent: c.id }, mode),
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                    {c.label}
                  </MenuItem>
                ))}
              </Select>
            </Row>
            {p.accent === 'custom' && (
              <Row label="Custom accent">
                <Box
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}
                >
                  <ColorControl
                    label={a.separateModes ? `${mode} custom accent` : 'Custom accent'}
                    resetKey={persisted.profiles[mode]}
                    value={persisted.profiles[mode].customAccent}
                    onChange={(color) => edit(mode, { customAccent: color })}
                    onPreview={(color) => preview(mode, { customAccent: color })}
                    onCancelPreview={cancelPreview}
                  />
                  <Box
                    role="group"
                    aria-label={`${mode} accent preview`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Box
                      component="span"
                      sx={{
                        px: 1.25,
                        py: 0.5,
                        borderRadius: '12px',
                        fontSize: 12,
                        backgroundColor: 'var(--profile-user-message-bg)',
                        color: 'var(--profile-user-message-ink)',
                        '&::selection': { color: 'var(--profile-user-message-selection-ink)' },
                      }}
                    >
                      Your message
                    </Box>
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        display: 'grid',
                        placeItems: 'center',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: 'var(--profile-composer-bg)',
                        color: 'var(--profile-composer-ink)',
                      }}
                    >
                      <SendIcon sx={{ fontSize: 14 }} />
                    </Box>
                  </Box>
                </Box>
              </Row>
            )}
            <Row label="Background" id={mode === effective ? 'appearance-background' : undefined}>
              <ColorControl
                label={a.separateModes ? `${mode} background` : 'Background'}
                resetKey={persisted.profiles[mode]}
                value={persisted.profiles[mode].surface}
                onChange={(color) => edit(mode, { surface: color })}
                onPreview={(color) => preview(mode, { surface: color })}
                onCancelPreview={cancelPreview}
              />
            </Row>
            <Row label="Foreground" id={mode === effective ? 'appearance-foreground' : undefined}>
              <ColorControl
                label={a.separateModes ? `${mode} foreground` : 'Foreground'}
                resetKey={persisted.profiles[mode]}
                value={persisted.profiles[mode].ink}
                onChange={(color) => edit(mode, { ink: color })}
                onPreview={(color) => preview(mode, { ink: color })}
                onCancelPreview={cancelPreview}
              />
            </Row>
          </Group>
        );
      })}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 3,
          mb: 1.25,
        }}
      >
        <ButtonBase
          aria-expanded={advanced}
          aria-controls="appearance-advanced"
          onClick={() => setAdvanced((v) => !v)}
          sx={disclosureSx}
        >
          Advanced
          <ExpandMoreIcon
            aria-hidden="true"
            sx={{
              fontSize: 18,
              transform: advanced ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: reducedMotion ? 'none' : 'transform 140ms ease',
            }}
          />
        </ButtonBase>
        {JSON.stringify(a) !== JSON.stringify(DEFAULT_APPEARANCE) && (
          <ButtonBase
            onClick={() => updateSetting('appearance', DEFAULT_APPEARANCE)}
            sx={{ ...disclosureSx, fontSize: 12, mr: -1 }}
          >
            Reset to default
          </ButtonBase>
        )}
      </Box>
      <Collapse
        in={advanced}
        timeout={reducedMotion ? 0 : 'auto'}
        unmountOnExit
        onEntered={() => onTargetReady?.()}
      >
        <Box id="appearance-advanced">
          <Group label="Font sizes" id="appearance-font">
            {[
              ['uiFontSize', 'UI font size', 11, 16, 'Base size for app navigation and controls'],
              [
                'contentFontSize',
                'Content font size',
                12,
                24,
                'Text size in responses and reading content',
              ],
              ['codeFontSize', 'Code font size', 8, 24, 'Text size in code blocks and SQL editors'],
            ].map(([key, label, min, max, description]) => (
              <Row key={key} label={label} description={description}>
                <NumberControl
                  label={label}
                  value={a[key]}
                  min={min}
                  max={max}
                  onChange={(value) => save({ [key]: value })}
                />
              </Row>
            ))}
          </Group>
          <Group label="Motion and mode profiles">
            <Row
              label="Reduce motion"
              description="Control interface animations"
              id="appearance-reduced-motion"
            >
              {segmented(
                'Reduce motion',
                a.reducedMotion,
                [
                  ['system', 'System'],
                  ['on', 'On'],
                  ['off', 'Off'],
                ],
                (v) => save({ reducedMotion: v }),
              )}
            </Row>
            {toggle(
              'Separate light and dark modes',
              'separateModes',
              'appearance-separate-modes',
              'Customize each mode independently',
            )}
          </Group>
          {modes.map((mode) => (
            <Group
              key={mode}
              ref={profileRef(mode, 'contrast')}
              style={profileVariables(a, mode)}
              label={`${mode} contrast settings`}
            >
              <Row
                label={
                  a.separateModes ? `${mode === 'light' ? 'Light' : 'Dark'} contrast` : 'Contrast'
                }
                id={mode === effective ? 'appearance-contrast' : undefined}
              >
                <ContrastControl
                  value={persisted.profiles[mode].contrast}
                  label={`${mode === 'light' ? 'Light' : 'Dark'} contrast`}
                  onPreview={(contrast) => preview(mode, { contrast })}
                  onChange={(contrast) => edit(mode, { contrast })}
                  onCancelPreview={cancelPreview}
                />
              </Row>
            </Group>
          ))}
          <Group label="Diff settings">
            <Row
              label="Diff markers"
              description="Identify added and deleted lines"
              id="appearance-diff-markers"
            >
              {segmented(
                'Diff markers',
                a.diffMarkers,
                [
                  ['color', 'Color'],
                  ['sign', '+/-'],
                ],
                (v) => save({ diffMarkers: v }),
              )}
            </Row>
          </Group>
        </Box>
      </Collapse>
      {status && (
        <Typography
          role={status === 'Theme copied.' ? 'status' : 'alert'}
          sx={{ mt: 2, fontSize: 12 }}
        >
          {status}
        </Typography>
      )}
      <Dialog
        open={!!importMode}
        onClose={() => setImportMode(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="import-theme-title"
      >
        <DialogTitle id="import-theme-title">Import theme</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            label="Theme share string"
            value={share}
            onChange={(e) => setShare(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 20000 } }}
            sx={{ mt: 1 }}
          />
          <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary' }}>
            Supports Moonlit v1 and validated Codex v1 colors, contrast and supported fonts. Codex
            syntax maps to Moonlit.
          </Typography>
          {importError && (
            <Typography role="alert" color="error">
              {importError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportMode(null)}>Cancel</Button>
          <Button
            disabled={!share.trim()}
            onClick={() => {
              try {
                const result = importTheme(share);
                save({ profiles: { ...a.profiles, [result.mode]: result.profile } });
                setImportMode(null);
              } catch (e) {
                setImportError(e.message);
              }
            }}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
