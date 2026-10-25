import { Box, Button, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryClient';
import { getDashboardOverview } from '@/api/user';
import {
  ArrowForwardIcon,
  CodeEditorIcon,
  DatabaseIcon,
  NewChatIcon,
  TableIcon,
} from '@/components/icons';
import { sidebarCard, singleLine } from '../styles/sectionGeometry';
import SidebarSectionLayout, { LoadingStatus, SidebarSkeleton } from './SidebarSectionLayout';

const numberFormatter = new Intl.NumberFormat();
const METRICS = [
  ['conversation_count', 'Conversations', NewChatIcon],
  ['cached_database_count', 'Cached databases', DatabaseIcon],
  ['cached_table_count', 'Cached tables', TableIcon],
  ['saved_recent_query_count', 'Saved recent queries', CodeEditorIcon],
];

// Share the full dashboard's account-scoped cache. Mount only while this panel
// is visible so ordinary chat/sidebar interactions do not fetch dashboard data.
export default function DashboardPreview({
  userId,
  isConnected,
  currentDatabase,
  onOpenDashboard,
}) {
  const overview = useQuery({
    queryKey: queryKeys.dashboardOverview(userId),
    queryFn: getDashboardOverview,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  const data = overview.data?.data;

  return (
    <SidebarSectionLayout
      footer={
        <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={onOpenDashboard}>
          Open full dashboard
        </Button>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 7,
            height: 7,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: isConnected ? 'success.main' : 'text.disabled',
          }}
        />
        <Typography
          title={currentDatabase || undefined}
          sx={{ fontSize: 12, color: 'text.secondary', ...singleLine }}
        >
          {isConnected
            ? currentDatabase
              ? `Connected to ${currentDatabase}`
              : 'Connected'
            : 'Not connected'}
        </Typography>
      </Box>
      <Box sx={{ height: 64, overflow: 'hidden' }}>
        {overview.isLoading && !data && <LoadingStatus>Loading overview…</LoadingStatus>}
        {overview.isError ? (
          <Box role="alert">
            <Typography sx={{ typography: 'uiBodySm', color: 'text.secondary' }}>
              {data ? 'Couldn’t refresh overview.' : 'Couldn’t load overview.'}
            </Typography>
            <Button size="small" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              Retry overview
            </Button>
          </Box>
        ) : !overview.isLoading && !data ? (
          <Typography sx={{ typography: 'uiBodySm', color: 'text.secondary' }}>
            Overview unavailable. Open the full dashboard for details.
          </Typography>
        ) : null}
      </Box>
      {
        <Box
          component="dl"
          aria-busy={(overview.isLoading && !data) || undefined}
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, m: 0 }}
        >
          {METRICS.map(([key, label, Icon]) => (
            <Box
              key={key}
              sx={{
                ...sidebarCard,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  width: 96,
                  height: 96,
                  right: -32,
                  bottom: -40,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  border: '12px solid',
                  borderColor: (theme) => alpha(theme.palette.info.main, 0.05),
                },
              }}
            >
              <Typography
                component="dt"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: 'text.secondary',
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: '9px',
                    color: 'info.main',
                    bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
                  }}
                >
                  <Box component={Icon} sx={{ fontSize: 17 }} />
                </Box>
                {label}
              </Typography>
              <Typography
                component="dd"
                title={
                  typeof data?.[key] === 'number' ? numberFormatter.format(data[key]) : undefined
                }
                sx={{
                  height: 47,
                  boxSizing: 'border-box',
                  fontSize: '2rem',
                  lineHeight: 1.2,
                  fontWeight: 500,
                  mt: 'auto',
                  pt: 1,
                  mx: 0,
                  mb: 0,
                  fontVariantNumeric: 'tabular-nums',
                  ...singleLine,
                }}
              >
                {overview.isLoading && !data ? (
                  <SidebarSkeleton width="55%" height={32} />
                ) : typeof data?.[key] === 'number' ? (
                  numberFormatter.format(data[key])
                ) : (
                  '—'
                )}
              </Typography>
            </Box>
          ))}
        </Box>
      }
    </SidebarSectionLayout>
  );
}
