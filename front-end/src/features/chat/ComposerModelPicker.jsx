import {
  Box,
  Button,
  IconButton,
  ListSubheader,
  MenuList,
  Skeleton,
  Slider,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { AppPopover, AppPopoverEmptyState, AppPopoverItem } from '@/components';
import { CheckIcon, ChevronRightIcon, PerformanceIcon } from '@/components/icons';
import { REASONING_EFFORT_OPTIONS } from '@/config/userSettings';
import { getModelDisplayName } from '@/config/llmSelection';
import { getPopoverSectionLabelSx } from '@/styles/shared';

export default function ComposerModelPicker({
  anchorEl,
  onClose,
  providerOptions,
  selectedProvider,
  selectedModel,
  loading,
  error,
  onRetry,
  onSelect,
  supportsReasoning,
  reasoningEffort,
  onReasoningEffortChange,
  isStreaming,
  effectiveTaskMode,
  usageContent,
  placement = 'active',
}) {
  const [showModels, setShowModels] = useState(false);
  const [search, setSearch] = useState('');
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const modelRef = useRef(null);
  const focusControl = () => (showModels ? searchRef : modelRef).current?.focus();
  useEffect(() => {
    (showModels ? searchRef : modelRef).current?.focus();
  }, [showModels]);
  const query = search.trim().toLowerCase();
  const sections = providerOptions
    .map((provider) => ({
      ...provider,
      models: (provider.models || []).filter((model) =>
        `${provider.name} ${provider.label || ''} ${model} ${getModelDisplayName(model)}`
          .toLowerCase()
          .includes(query),
      ),
    }))
    .filter((provider) => provider.models.length);
  const effortIndex = Math.max(
    0,
    REASONING_EFFORT_OPTIONS.findIndex((option) => option.value === reasoningEffort),
  );
  const effortLabel = REASONING_EFFORT_OPTIONS[effortIndex].label;
  const below = placement === 'welcome';

  return (
    <AppPopover
      open
      anchorEl={anchorEl}
      onClose={onClose}
      width={280}
      anchorOrigin={{ vertical: below ? 'bottom' : 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: below ? 'top' : 'bottom', horizontal: 'right' }}
      paperSx={{
        mt: below ? 0.5 : -0.5,
        borderRadius: '18px',
        bgcolor: 'background.elevated2',
        p: 0.75,
        overflowY: 'auto',
      }}
      slotProps={{
        paper: { role: 'dialog', 'aria-label': 'Model settings' },
        transition: { onEntered: focusControl },
      }}
    >
      {showModels ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, pb: 0.5 }}>
            <IconButton
              aria-label="Back to model settings"
              size="small"
              onClick={() => {
                setShowModels(false);
                setSearch('');
              }}
            >
              <ChevronRightIcon sx={{ transform: 'rotate(180deg)', fontSize: 18 }} />
            </IconButton>
            <Typography sx={{ typography: 'uiBodySm', color: 'text.secondary' }}>
              Select model
            </Typography>
          </Box>
          <TextField
            inputRef={searchRef}
            fullWidth
            size="small"
            placeholder="Search models"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ mb: 0.5 }}
            slotProps={{ htmlInput: { 'aria-label': 'Search models' } }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                listRef.current?.querySelector('[role="menuitemradio"]')?.focus();
              }
            }}
          />
          <MenuList
            ref={listRef}
            aria-label="Models"
            sx={{ p: 0, maxHeight: 280, overflowY: 'auto' }}
          >
            {sections.flatMap((provider) => [
              <ListSubheader
                key={`${provider.name}-heading`}
                disableSticky
                sx={(theme) => ({ ...getPopoverSectionLabelSx(theme), bgcolor: 'transparent' })}
              >
                {provider.label || provider.name}
              </ListSubheader>,
              ...provider.models.map((model) => {
                const selected = provider.name === selectedProvider && model === selectedModel;
                return (
                  <AppPopoverItem
                    key={`${provider.name}-${model}`}
                    role="menuitemradio"
                    ariaChecked={selected}
                    selected={selected}
                    label={getModelDisplayName(model)}
                    reserveTrailing
                    trailing={selected ? <CheckIcon /> : null}
                    labelSx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                    onClick={() => {
                      onSelect?.(provider.name, model);
                      setShowModels(false);
                      setSearch('');
                    }}
                  />
                );
              }),
            ])}
          </MenuList>
        </>
      ) : (
        <>
          <Button
            ref={modelRef}
            fullWidth
            aria-label="Choose a model"
            onClick={() => setShowModels(true)}
            startIcon={<PerformanceIcon />}
            endIcon={<ChevronRightIcon />}
            sx={{
              minHeight: 40,
              px: 1,
              color: 'text.primary',
              borderRadius: '12px',
              textTransform: 'none',
              '& .MuiButton-startIcon': { color: 'text.secondary', mr: 'auto' },
              '& .MuiButton-endIcon': { color: 'text.secondary' },
            }}
          >
            <Box
              component="span"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 1 }}
            >
              {getModelDisplayName(selectedModel) || 'Select model'}
              {supportsReasoning ? ` · ${effortLabel}` : ''}
            </Box>
          </Button>
          {supportsReasoning && (
            <Box sx={{ px: 1.5, pt: 0.5, pb: 0.75 }}>
              <Slider
                aria-label="Reasoning effort"
                min={0}
                max={2}
                step={1}
                marks
                value={effortIndex}
                getAriaValueText={(index) => REASONING_EFFORT_OPTIONS[index].label}
                onChange={(_, index) =>
                  onReasoningEffortChange?.(REASONING_EFFORT_OPTIONS[index].value)
                }
                sx={{
                  color: 'text.primary',
                  height: 16,
                  py: 0.75,
                  '& .MuiSlider-rail': { opacity: 0.15 },
                  '& .MuiSlider-track': { border: 0 },
                  '& .MuiSlider-thumb': { width: 24, height: 24, boxShadow: 'none' },
                  '& .MuiSlider-mark': { width: 3, height: 3, borderRadius: '50%' },
                }}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  typography: 'uiCaptionSm',
                  color: 'text.secondary',
                }}
              >
                {REASONING_EFFORT_OPTIONS.map((option) => (
                  <span key={option.value}>{option.label}</span>
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
      {loading && (
        <Box role="status" aria-label="Loading models" sx={{ p: 1 }}>
          <Skeleton height={32} />
        </Box>
      )}
      {!loading && !sections.length && (
        <AppPopoverEmptyState
          title={
            error ? 'Could not load models' : query ? 'No matching models' : 'No models available'
          }
          description={
            error
              ? 'Try loading the available models again.'
              : query
                ? 'Try a different model or provider.'
                : 'No models are configured for this deployment.'
          }
        />
      )}
      {error && onRetry && <Button onClick={onRetry}>Retry loading models</Button>}
      {isStreaming && (
        <Typography sx={{ px: 1, pt: 1, typography: 'uiCaptionSm', color: 'text.secondary' }}>
          Changes apply to your next message.
          {effectiveTaskMode && (
            <Box component="span" sx={{ display: 'block' }}>
              Last resolved task mode: {effectiveTaskMode.label}.
            </Box>
          )}
        </Typography>
      )}
      {usageContent && (
        <Box sx={{ p: 1, borderTop: '1px solid', borderColor: 'border.subtle' }}>
          {usageContent}
        </Box>
      )}
    </AppPopover>
  );
}
