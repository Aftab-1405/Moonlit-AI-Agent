import { Box, Button, IconButton, Typography } from '@mui/material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  AiSparkleIcon,
  AnalyticsIcon,
  CloseIcon,
  CodeEditorIcon,
  DatabaseIcon,
  SchemaIcon,
} from '@/components/icons';
import {
  COMPOSER_MAX_WIDTH,
  getWelcomeCategorySx,
  getWelcomeSuggestionCloseSx,
  getWelcomeSuggestionPanelSx,
} from '@/features/styles/interfaceChrome';
import {
  beginWelcomeStageTransition,
  createWelcomeInteractionGuard,
  getSuggestionNavigationIndex,
  getWelcomeSuggestionMotion,
  isWelcomeCategoryDisabled,
  isWelcomeEntryDisabled,
  runGuardedWelcomeActivation,
} from './welcomeSuggestions.js';

const MotionBox = motion.create(Box);

const ICONS = Object.freeze({
  database: DatabaseIcon,
  schema: SchemaIcon,
  code: CodeEditorIcon,
  analysis: AnalyticsIcon,
  moonlit: AiSparkleIcon,
});

function CategoryIcon({ icon }) {
  const Icon = ICONS[icon] ?? SchemaIcon;
  return <Icon aria-hidden sx={{ width: 16, height: 16 }} />;
}

function WelcomeSuggestions({
  categories,
  activeCategoryId,
  onCategoryChange,
  onActivate,
  canOpenDatabase = false,
  disabled = false,
}) {
  const reduceMotion = useReducedMotion();
  const suggestionRefs = useRef([]);
  const returnFocusIdRef = useRef(null);
  const panelFocusPendingRef = useRef(false);
  const interactionGuardRef = useRef(null);
  const [interactionLocked, setInteractionLocked] = useState(false);
  if (interactionGuardRef.current === null) {
    interactionGuardRef.current = createWelcomeInteractionGuard();
  }
  const activeCategory = useMemo(
    () => categories.find(({ id }) => id === activeCategoryId) ?? null,
    [activeCategoryId, categories],
  );
  const availability = useMemo(
    () => ({ promptDisabled: disabled, canOpenDatabase }),
    [canOpenDatabase, disabled],
  );
  const isSuggestionDisabled = useCallback(
    (entry) => isWelcomeEntryDisabled(entry, availability),
    [availability],
  );
  const { containerLayout, stageTransition, panelVariants, itemVariants } = useMemo(
    () => getWelcomeSuggestionMotion(reduceMotion),
    [reduceMotion],
  );

  const closePanel = useCallback(() => {
    const started = beginWelcomeStageTransition(interactionGuardRef.current, () => {
      returnFocusIdRef.current = activeCategoryId;
      onCategoryChange(null);
    });
    if (started) setInteractionLocked(true);
  }, [activeCategoryId, onCategoryChange]);

  const openCategory = useCallback(
    (categoryId) => {
      const started = beginWelcomeStageTransition(interactionGuardRef.current, () => {
        returnFocusIdRef.current = null;
        panelFocusPendingRef.current = true;
        onCategoryChange(categoryId);
      });
      if (started) setInteractionLocked(true);
    },
    [onCategoryChange],
  );

  const handleExitComplete = useCallback(() => {
    interactionGuardRef.current.completeTransition();
    setInteractionLocked(false);
  }, []);

  const handleSuggestionKeyDown = useCallback(
    (event, index) => {
      const nextIndex = getSuggestionNavigationIndex({
        key: event.key,
        currentIndex: index,
        itemCount: activeCategory?.entries.length ?? 0,
      });
      if (nextIndex == null) return;
      event.preventDefault();
      suggestionRefs.current[nextIndex]?.focus();
    },
    [activeCategory],
  );

  const handlePanelKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePanel();
    },
    [closePanel],
  );

  const handleSuggestionActivate = useCallback(
    (entry) => {
      if (isSuggestionDisabled(entry)) return;
      const handled = runGuardedWelcomeActivation(interactionGuardRef.current, () =>
        onActivate(entry),
      );
      if (!handled) return;
      returnFocusIdRef.current = null;
      panelFocusPendingRef.current = false;
      setInteractionLocked(true);
      onCategoryChange(null);
    },
    [isSuggestionDisabled, onActivate, onCategoryChange],
  );

  return (
    <MotionBox
      layout={containerLayout}
      inert={interactionLocked ? true : undefined}
      aria-busy={interactionLocked || undefined}
      sx={{
        position: 'relative',
        zIndex: 3,
        maxWidth: COMPOSER_MAX_WIDTH,
        mx: 'auto',
        mt: 2,
        mb: 2,
        pointerEvents: interactionLocked ? 'none' : 'auto',
      }}
    >
      <AnimatePresence mode="wait" initial={false} onExitComplete={handleExitComplete}>
        {!activeCategory ? (
          <MotionBox
            key="categories"
            component="ul"
            aria-label="Prompt categories"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={stageTransition}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              p: 0,
              m: 0,
              listStyle: 'none',
            }}
          >
            {categories.map((category) => (
              <Box component="li" key={category.id}>
                <Button
                  type="button"
                  ref={(node) => {
                    if (node && returnFocusIdRef.current === category.id) {
                      node.focus();
                      returnFocusIdRef.current = null;
                    }
                  }}
                  disabled={isWelcomeCategoryDisabled(category, availability)}
                  onClick={() => openCategory(category.id)}
                  startIcon={<CategoryIcon icon={category.icon} />}
                  sx={(theme) => ({
                    ...getWelcomeCategorySx(theme),
                    width: '100%',
                    height: 44,
                    justifyContent: 'flex-start',
                    bgcolor: 'transparent',
                    px: 2.5,
                    gap: 1.5,
                    fontSize: '15px',
                  })}
                >
                  {category.label}
                </Button>
              </Box>
            ))}
          </MotionBox>
        ) : (
          <MotionBox
            key={activeCategory.id}
            role="region"
            aria-label={`${activeCategory.label} suggestions`}
            onKeyDown={handlePanelKeyDown}
            initial="closed"
            animate="open"
            exit="closed"
            variants={panelVariants}
            style={{ originY: 'top' }}
            sx={(theme) => getWelcomeSuggestionPanelSx(theme)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 48, px: 2, gap: 1 }}>
              <CategoryIcon icon={activeCategory.icon} />
              <Typography
                sx={(theme) => ({
                  ...theme.typography.uiBodySm,
                  flex: 1,
                  color: 'text.secondary',
                })}
              >
                {activeCategory.label}
              </Typography>
              <IconButton
                type="button"
                aria-label="Close suggestions"
                onClick={closePanel}
                sx={(theme) => getWelcomeSuggestionCloseSx(theme)}
              >
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
              {activeCategory.entries.map((entry, index) => (
                <MotionBox
                  component="li"
                  key={entry.id}
                  variants={itemVariants}
                  sx={{ borderTop: '1px solid', borderColor: 'border.separator' }}
                >
                  <Button
                    type="button"
                    ref={(node) => {
                      suggestionRefs.current[index] = node;
                      if (node && index === 0 && panelFocusPendingRef.current) {
                        node.focus();
                        panelFocusPendingRef.current = false;
                      }
                    }}
                    fullWidth
                    aria-disabled={isSuggestionDisabled(entry)}
                    onClick={() => handleSuggestionActivate(entry)}
                    onKeyDown={(event) => handleSuggestionKeyDown(event, index)}
                    sx={{
                      minHeight: 44,
                      justifyContent: 'flex-start',
                      px: 2,
                      py: 1.25,
                      borderRadius: 0,
                      color: 'text.secondary',
                      textAlign: 'left',
                      textTransform: 'none',
                      '&[aria-disabled="true"]': {
                        color: 'text.disabled',
                        cursor: 'default',
                      },
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        color: 'text.primary',
                      },
                      '&[aria-disabled="true"]:hover': {
                        backgroundColor: 'transparent',
                        color: 'text.disabled',
                      },
                      '&.Mui-focusVisible': {
                        backgroundColor: 'action.hover',
                        color: 'text.primary',
                        outline: '2px solid',
                        outlineColor: 'border.focus',
                        outlineOffset: -2,
                        boxShadow: 'none',
                      },
                      '&[aria-disabled="true"].Mui-focusVisible': {
                        color: 'text.disabled',
                      },
                    }}
                  >
                    {entry.label}
                  </Button>
                </MotionBox>
              ))}
            </Box>
          </MotionBox>
        )}
      </AnimatePresence>
    </MotionBox>
  );
}

export default memo(WelcomeSuggestions);
