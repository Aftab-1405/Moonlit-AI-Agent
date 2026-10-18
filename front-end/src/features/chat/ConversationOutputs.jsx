import { Box, Button, MenuList, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import {
  AppPopover,
  AppPopoverEmptyState,
  AppPopoverItem,
  AppPopoverSectionLabel,
} from '@/components';
import { CodeEditorIcon, SchemaIcon, TableIcon } from '@/components/icons';
import { getResponsivePillControlSx } from '@/features/styles/interfaceChrome';

export default function ConversationOutputs({
  outputs = [],
  selectedArtifact,
  onSelect,
  variant = 'menu',
}) {
  const theme = useTheme();
  const [anchor, setAnchor] = useState(null);
  const source = selectedArtifact?.source;
  const query = selectedArtifact?.props?.sourceQuery || selectedArtifact?.props?.initialQuery;
  const elapsed =
    selectedArtifact?.props?.data?.execution_time ?? selectedArtifact?.props?.executionTime;
  const pinnedSources = [
    ...new Set(
      outputs
        .map((output) =>
          [output.source?.database, output.source?.schema].filter(Boolean).join(' · '),
        )
        .filter(Boolean),
    ),
  ];
  const content = (
    <>
      <AppPopoverSectionLabel>Outputs</AppPopoverSectionLabel>
      <MenuList aria-label="Conversation outputs" sx={{ maxHeight: 280, overflowY: 'auto', p: 0 }}>
        {outputs.map((output) => (
          <AppPopoverItem
            key={output.id}
            role="menuitemradio"
            ariaChecked={output.id === selectedArtifact?.id}
            selected={output.id === selectedArtifact?.id}
            icon={
              output.type === 'sql-editor' ? (
                <CodeEditorIcon />
              ) : output.type === 'react-flow' ? (
                <SchemaIcon />
              ) : (
                <TableIcon />
              )
            }
            label={output.title}
            description={
              variant === 'summary'
                ? undefined
                : output.props?.sourceQuery || output.props?.initialQuery || undefined
            }
            onClick={() => {
              onSelect?.(output);
              setAnchor(null);
            }}
          />
        ))}
      </MenuList>
      {!outputs.length && (
        <AppPopoverEmptyState
          title="No outputs yet"
          description="Completed SQL, query results and diagrams appear here."
        />
      )}
      <AppPopoverSectionLabel
        sx={{ borderTop: '1px solid', borderColor: 'border.subtle', mt: 0.5 }}
      >
        {variant === 'summary' ? 'Sources' : 'Sources · selected output'}
      </AppPopoverSectionLabel>
      <Box sx={{ px: 1.5, pb: 1.5, overflowWrap: 'anywhere' }}>
        <Typography sx={{ ...theme.typography.uiBodySm, color: 'text.secondary' }}>
          {variant === 'summary'
            ? pinnedSources.length
              ? pinnedSources.join(' / ')
              : 'No recorded database sources.'
            : !selectedArtifact
              ? 'Select an output to inspect its source.'
              : source?.database
                ? [source.database, source.schema].filter(Boolean).join(' · ')
                : 'Database not recorded for this output.'}
        </Typography>
        {variant !== 'summary' && query && (
          <Typography
            component="pre"
            sx={{
              ...theme.typography.uiCaptionSm,
              whiteSpace: 'pre-wrap',
              maxHeight: 120,
              overflow: 'auto',
              my: 1,
            }}
          >
            {query}
          </Typography>
        )}
        {variant !== 'summary' && Number.isFinite(elapsed) && (
          <Typography sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
            Execution: {elapsed.toFixed(2)}s
          </Typography>
        )}
      </Box>
    </>
  );
  if (variant === 'summary')
    return (
      <Box
        component="aside"
        aria-label="Outputs and sources"
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'border.subtle',
          borderRadius: '20px',
          p: 1,
          overflow: 'hidden',
        }}
      >
        {content}
      </Box>
    );
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        px: 1.5,
        py: 0.5,
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Button
        type="button"
        variant="text"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={`Outputs and sources, ${outputs.length} outputs`}
        sx={{
          ...getResponsivePillControlSx(theme, { desktopHeight: 36 }),
          ...theme.typography.uiBodySm,
          color: 'text.secondary',
        }}
      >
        Outputs · {outputs.length}
      </Button>
      <AppPopover
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        width={340}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {content}
      </AppPopover>
    </Box>
  );
}
