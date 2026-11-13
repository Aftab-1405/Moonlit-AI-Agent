import { useAppearanceReducedMotion } from '@/hooks/useAppearanceReducedMotion';
import {
  Box,
  CircularProgress,
  Collapse,
  Container,
  Fade,
  IconButton,
  LinearProgress,
  ListItemButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { USER } from '@/api/endpoints';
import { getContextMetrics } from '@/api/user';
import {
  ActivityIcon,
  AnalyticsIcon,
  CheckIcon,
  DatabaseIcon,
  DeleteIcon,
  ExpandMoreIcon,
  PerformanceIcon,
  RefreshIcon,
  SaveIcon,
  ServerIcon,
  TimeIcon,
  UserIcon,
  WarningIcon,
} from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';


const getLabelSx = (theme) => ({
  ...theme.typography.uiMonoLabel,
  color: 'text.secondary',
});

const ICON_PROPS = { sx: { fontSize: 18 }, 'aria-hidden': true };

const numberFormatter = new Intl.NumberFormat('en-US');
const formatNumber = (value) => numberFormatter.format(value || 0);

const formatLatency = (latency) => {
  if (latency === null || latency === undefined) return 'No signal';
  return `${latency} ms`;
};

const formatSeconds = (value) => {
  if (value === null || value === undefined) return 'Inactive';
  if (value <= 0) return 'Expired';

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

function getStatusTone(apiHealth) {
  if (apiHealth.checking) {
    return {
      label: 'Checking',
      color: 'warning.main',
      copy: 'Verifying backend availability',
    };
  }

  if (apiHealth.online) {
    return {
      label: 'Online',
      color: 'success.main',
      copy: 'Backend responding normally',
    };
  }

  return {
    label: 'Offline',
    color: 'warning.main',
    copy: 'Backend connection is unavailable',
  };
}

function Card({ children, sx = {}, component = 'section', ...props }) {
  return (
    <Box
      component={component}
      sx={{
        borderRadius: '8px',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: 'none',
        p: 3,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}

function CardHeader({ label, title, icon: Icon }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={getLabelSx}>{label}</Typography>
        <Typography
          sx={{
            mt: 0.5,
            color: 'text.primary',
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>
      </Box>
      {Icon && (
        <Box sx={{ color: 'text.secondary', lineHeight: 0 }}>
          <Icon {...ICON_PROPS} />
        </Box>
      )}
    </Box>
  );
}

function MetricRow({ icon, label, value, detail, tone = 'neutral' }) {
  const Icon = icon;
  const color =
    tone === 'good' ? 'success.main' : tone === 'warning' ? 'warning.main' : 'text.primary';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '32px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 1.5,
        py: 1.5,
        minHeight: 64,
      }}
    >
      <Box sx={{ color: 'text.secondary', lineHeight: 0 }}>
        <Icon {...ICON_PROPS} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: 'text.primary',
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.35,
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            color: 'text.secondary',
            fontSize: 12,
            lineHeight: 1.3,
          }}
        >
          {detail}
        </Typography>
      </Box>
      <Typography
        sx={{
          color,
          fontFamily: (theme) => theme.typography.fontFamilyMono,
          fontSize: 15,
          fontWeight: 400,
          textAlign: 'right',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function HitRateCard({ hitRate, hits, misses }) {
  const missedRate = Math.max(0, 100 - hitRate);

  return (
    <Card sx={{ height: '100%', minHeight: 300 }}>
      <CardHeader label="Cache efficiency" title="Context reuse" icon={AnalyticsIcon} />
      <Typography
        aria-label={`Cache hit rate ${hitRate}%`}
        sx={{
          color: 'text.primary',
          fontFamily: (theme) => theme.typography.fontFamilyMono,
          fontSize: 48,
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {hitRate}
        <Box
          component="span"
          sx={{ ml: 0.5, color: 'text.secondary', fontSize: 20, fontWeight: 400 }}
        >
          %
        </Box>
      </Typography>
      <Typography sx={(theme) => ({ ...getLabelSx(theme), mt: 1 })}>Hit rate</Typography>
      <LinearProgress
        variant="determinate"
        value={hitRate}
        sx={{
          mt: 3,
          height: 6,
          borderRadius: '999px',
          bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
          '& .MuiLinearProgress-bar': { borderRadius: '999px', bgcolor: 'text.secondary' },
        }}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 2,
          mt: 3,
        }}
      >
        <Box>
          <Typography sx={getLabelSx}>Cache hits</Typography>
          <Typography
            sx={{
              mt: 0.5,
              color: 'text.secondary',
              fontFamily: (theme) => theme.typography.fontFamilyMono,
              fontSize: 16,
              fontWeight: 400,
            }}
          >
            {formatNumber(hits)}
          </Typography>
        </Box>
        <Box>
          <Typography sx={getLabelSx}>Miss pressure</Typography>
          <Typography
            sx={{
              mt: 0.5,
              color: missedRate > 30 ? 'warning.main' : 'text.primary',
              fontFamily: (theme) => theme.typography.fontFamilyMono,
              fontSize: 16,
              fontWeight: 400,
            }}
          >
            {formatNumber(misses)} · {missedRate}%
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

function ApiStatusCard({ statusTone, apiHealth, refreshing, onRefresh }) {
  return (
    <Card
      role="status"
      aria-live="polite"
      sx={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 2,
        p: 2,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '8px',
          bgcolor: (theme) => {
            const [key] = statusTone.color.split('.');
            return alpha(theme.palette[key].main, 0.1);
          },
          color: statusTone.color,
        }}
      >
        <ServerIcon {...ICON_PROPS} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              flex: '0 0 auto',
              borderRadius: '50%',
              bgcolor: statusTone.color,
            }}
          />
          <Typography sx={(theme) => ({ ...getLabelSx(theme), color: statusTone.color })}>
            API relay · {statusTone.label}
          </Typography>
        </Box>
        <Typography
          sx={{
            mt: 0.5,
            color: 'text.primary',
            fontFamily: (theme) => theme.typography.fontFamilyMono,
            fontSize: 14,
            fontWeight: 400,
          }}
        >
          {formatLatency(apiHealth.latency)}
        </Typography>
        <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12 }}>
          {statusTone.copy}
        </Typography>
      </Box>
      <Tooltip title="Check API relay">
        <span>
          <IconButton
            aria-label="Check API relay"
            aria-busy={refreshing}
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <CircularProgress size={16} sx={{ color: 'text.primary' }} />
            ) : (
              <RefreshIcon {...ICON_PROPS} />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </Card>
  );
}

function AdminDashboard() {
  const metricsRef = useRef(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiHealth, setApiHealth] = useState({ online: false, latency: null, checking: true });
  const [metricsError, setMetricsError] = useState(null);
  const [ttlRemaining, setTtlRemaining] = useState(null);
  const [redisExpanded, setRedisExpanded] = useState(false);
  const prefersReducedMotion = useAppearanceReducedMotion();
  const { user } = useAuth();

  const applyMetrics = useCallback((nextMetrics) => {
    if (!nextMetrics) return;
    metricsRef.current = nextMetrics;
    setMetrics(nextMetrics);

    const remaining = nextMetrics.config?.ttl_remaining;
    setTtlRemaining(remaining !== undefined ? remaining : null);
  }, []);

  const checkApiHealth = useCallback(async ({ initial = false } = {}) => {
    const startTime = performance.now();
    if (initial) {
      setApiHealth((prev) => ({ ...prev, checking: true }));
    } else {
      setRefreshing(true);
    }

    try {
      const healthResult = await fetch('/api/v1/')
        .then(async (res) => {
          const endTime = performance.now();
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
              return { online: true, latency: Math.round(endTime - startTime) };
            }
          }
          return { online: false, latency: null };
        })
        .catch(() => ({ online: false, latency: null }));

      setApiHealth({ ...healthResult, checking: false });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkApiHealth({ initial: true });
  }, [checkApiHealth]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setMetricsError('Sign in to view telemetry metrics.');
      return undefined;
    }

    let active = true;
    setLoading(true);
    setMetricsError(null);

    getContextMetrics()
      .then((res) => {
        if (!active) return;
        applyMetrics(res.metrics);
        setMetricsError(null);
      })
      .catch((err) => {
        if (!active) return;
        logger.error('Error fetching initial metrics:', err);
        setMetricsError(
          err.status
            ? `Initial metrics request failed with HTTP ${err.status}.`
            : 'Initial metrics request failed. Live telemetry will continue if Firestore is available.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyMetrics, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const events = new EventSource(USER.CONTEXT_METRICS_STREAM, {
      withCredentials: true,
    });

    events.addEventListener('metrics', (event) => {
      try {
        applyMetrics(JSON.parse(event.data));
        setMetricsError(null);
        setLoading(false);
      } catch (err) {
        logger.error('Live telemetry payload error:', err);
        setMetricsError('Live telemetry payload could not be read.');
      }
    });

    events.onerror = () => {
      setMetricsError('Live telemetry stream disconnected. Refresh the page to reconnect.');
      setLoading(false);
    };

    return () => events.close();
  }, [applyMetrics, user?.uid]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTtlRemaining((prev) => {
        if (prev !== null && prev > 0) return prev - 1;
        return prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const dashboardData = useMemo(() => {
    const hitRate = metrics ? Math.round(metrics.hit_rate_percent || 0) : 0;
    const hits = metrics?.hits || 0;
    const misses = metrics?.misses || 0;
    const totalQueries = hits + misses;
    const connectedDatabase = metrics?.config?.connected_database;
    const activeTableCount = metrics?.config?.active_table_count || 0;
    const remainingTables = connectedDatabase
      ? (metrics?.config?.remaining_tables ?? 1000)
      : (metrics?.config?.schema_context_max_tables ?? 1000);

    return {
      hitRate,
      hits,
      misses,
      totalQueries,
      connectedDatabase,
      activeTableCount,
      remainingTables,
      ttlLabel: formatSeconds(ttlRemaining),
      metricsEnabled: Boolean(metrics?.metrics_enabled),
      stores: metrics?.stores || 0,
      clears: metrics?.clears || 0,
    };
  }, [metrics, ttlRemaining]);

  const statusTone = useMemo(() => getStatusTone(apiHealth), [apiHealth]);

  const configurationStats = useMemo(
    () => [
      {
        label: 'Cache TTL',
        value: dashboardData.ttlLabel,
        detail: ttlRemaining !== null ? 'Context cache countdown' : 'No active cache window',
        icon: TimeIcon,
      },
      {
        label: 'Table Budget',
        value: formatNumber(dashboardData.remainingTables),
        detail: dashboardData.connectedDatabase
          ? `${dashboardData.activeTableCount} active in ${dashboardData.connectedDatabase}`
          : 'Waiting for database context',
        icon: DatabaseIcon,
      },
      {
        label: 'Metrics Feed',
        value: dashboardData.metricsEnabled ? 'Live' : 'Quiet',
        detail: 'Realtime context instrumentation',
        icon: ActivityIcon,
        tone: dashboardData.metricsEnabled ? 'good' : 'warning',
      },
    ],
    [dashboardData, ttlRemaining],
  );

  const operationStats = useMemo(
    () => [
      {
        label: 'Cache Hits',
        value: formatNumber(dashboardData.hits),
        detail: 'Served without recompilation',
        icon: CheckIcon,
        tone: 'good',
      },
      {
        label: 'Cache Misses',
        value: formatNumber(dashboardData.misses),
        detail: 'Required fresh context assembly',
        icon: WarningIcon,
        tone: 'warning',
      },
      {
        label: 'Writes',
        value: formatNumber(dashboardData.stores),
        detail: 'Stored context snapshots',
        icon: SaveIcon,
      },
      {
        label: 'Clears',
        value: formatNumber(dashboardData.clears),
        detail: 'Cache invalidation events',
        icon: DeleteIcon,
        tone: dashboardData.clears > 0 ? 'warning' : 'neutral',
      },
    ],
    [dashboardData],
  );

  const redisStats = useMemo(() => {
    const redis = metrics?.redis || { connected: false };
    return [
      {
        label: 'Connection',
        value: redis.connected ? 'Online' : 'Offline',
        detail: redis.connected
          ? redis.upstash_version
            ? 'Upstash Redis Server'
            : 'Standard Redis Server'
          : 'Checkpointer offline',
        icon: ServerIcon,
        tone: redis.connected ? 'good' : 'warning',
      },
      {
        label: 'Keys Stored',
        value: redis.connected ? formatNumber(redis.total_keys) : '0',
        detail: 'Total active checkpointer keys',
        icon: DatabaseIcon,
      },
      {
        label: 'Storage Size',
        value: redis.connected
          ? redis.total_data_size_human || redis.used_memory_human || '0 B'
          : '0 B',
        detail: `Max capacity: ${redis.maxmemory_human || '64.00MB'}`,
        icon: PerformanceIcon,
      },
    ];
  }, [metrics]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        color: 'text.primary',
        bgcolor: 'background.default',
      }}
    >
      <Container
        maxWidth="xl"
        sx={{
          minHeight: '100%',
          py: { xs: 3, lg: 4 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Fade in timeout={prefersReducedMotion ? 0 : 320}>
          <Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                gap: 3,
                alignItems: 'center',
                pb: 4,
                mb: 3,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', lg: 'span 8' } }}>
                <Typography sx={getLabelSx}>Moonlit runtime</Typography>
                <Typography
                  component="h1"
                  sx={{
                    mt: 1,
                    color: 'text.primary',
                    fontSize: { xs: 26, sm: 32 },
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    lineHeight: 1.15,
                  }}
                >
                  Operations overview
                </Typography>
                <Typography
                  sx={{
                    mt: 1,
                    maxWidth: 660,
                    color: 'text.secondary',
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  Live context-cache telemetry and runtime health.
                </Typography>
              </Box>
              <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 4' } }}>
                <ApiStatusCard
                  statusTone={statusTone}
                  apiHealth={apiHealth}
                  refreshing={refreshing}
                  onRefresh={() => checkApiHealth()}
                />
              </Box>
            </Box>

            {!apiHealth.checking && !apiHealth.online && (
              <Card
                role="alert"
                sx={{
                  mb: 3,
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  borderColor: (theme) => alpha(theme.palette.warning.main, 0.45),
                }}
              >
                <Box sx={{ color: 'warning.main', lineHeight: 0 }}>
                  <WarningIcon {...ICON_PROPS} />
                </Box>
                <Typography
                  sx={{
                    color: 'text.primary',
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  Backend connection is offline. Metrics will resume when the API relay responds.
                </Typography>
              </Card>
            )}

            {metricsError && apiHealth.online && (
              <Card
                role="alert"
                sx={{
                  mb: 3,
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  borderColor: (theme) => alpha(theme.palette.warning.main, 0.45),
                }}
              >
                <Box sx={{ color: 'warning.main', lineHeight: 0 }}>
                  <WarningIcon {...ICON_PROPS} />
                </Box>
                <Typography
                  sx={{
                    color: 'text.primary',
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  {metricsError}
                </Typography>
              </Card>
            )}

            {loading ? (
              <Card
                role="status"
                aria-live="polite"
                aria-label="Loading runtime telemetry"
                sx={{
                  minHeight: 420,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <CircularProgress size={32} thickness={3.5} sx={{ color: 'text.secondary' }} />
                  <Typography sx={(theme) => ({ ...getLabelSx(theme), mt: 2 })}>
                    Reading runtime telemetry
                  </Typography>
                </Box>
              </Card>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  gap: 3,
                  '& > *': { minWidth: 0 },
                }}
              >
                <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 6', lg: 'span 4' } }}>
                  <HitRateCard
                    hitRate={dashboardData.hitRate}
                    hits={dashboardData.hits}
                    misses={dashboardData.misses}
                  />
                </Box>
                <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 6', lg: 'span 4' } }}>
                  <Card sx={{ height: '100%', minHeight: 300 }}>
                    <CardHeader
                      label="Runtime summary"
                      title="Current operating limits"
                      icon={PerformanceIcon}
                    />
                    <Box
                      sx={{
                        '& > *:not(:last-child)': {
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        },
                      }}
                    >
                      <MetricRow
                        icon={PerformanceIcon}
                        label="Total context requests"
                        detail="Hits and misses combined"
                        value={formatNumber(dashboardData.totalQueries)}
                      />
                      <MetricRow
                        icon={ActivityIcon}
                        label="Metrics capture"
                        detail="Runtime instrumentation"
                        value={dashboardData.metricsEnabled ? 'Enabled' : 'Disabled'}
                        tone={dashboardData.metricsEnabled ? 'good' : 'warning'}
                      />
                      <MetricRow
                        icon={UserIcon}
                        label="Signed-in operator"
                        detail="Current admin session"
                        value={user?.email || 'Active'}
                      />
                    </Box>
                  </Card>
                </Box>
                <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 6', lg: 'span 4' } }}>
                  <Card sx={{ height: '100%', minHeight: 300 }}>
                    <CardHeader
                      label="Configuration"
                      title="Foundation signals"
                      icon={DatabaseIcon}
                    />
                    <Box
                      sx={{
                        '& > *:not(:last-child)': {
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        },
                      }}
                    >
                      {configurationStats.map((stat) => (
                        <MetricRow key={stat.label} {...stat} />
                      ))}
                    </Box>
                  </Card>
                </Box>
                <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 8' } }}>
                  <Card sx={{ height: '100%' }}>
                    <CardHeader label="Operations" title="Cache movement" icon={ActivityIcon} />
                    <Box
                      sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
                    >
                      {operationStats.map((stat, index) => (
                        <Box
                          key={stat.label}
                          sx={{
                            gridColumn: { xs: 'span 12', sm: 'span 6', lg: 'span 3' },
                            px: { xs: 0, sm: 2 },
                            borderLeft: {
                              sm: index % 2 === 0 ? 'none' : '1px solid',
                              lg: index === 0 ? 'none' : '1px solid',
                            },
                            borderLeftColor: 'divider',
                            borderTop: {
                              xs: index === 0 ? 'none' : '1px solid',
                              sm: index < 2 ? 'none' : '1px solid',
                              lg: 'none',
                            },
                            borderTopColor: 'divider',
                          }}
                        >
                          <MetricRow {...stat} />
                        </Box>
                      ))}
                    </Box>
                  </Card>
                </Box>
                <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 4' } }}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardHeader label="Memory State" title="Redis telemetry" icon={ServerIcon} />
                    <Box
                      sx={{
                        '& > *:not(:last-child)': {
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        },
                      }}
                    >
                      {redisStats.map((stat) => (
                        <MetricRow key={stat.label} {...stat} />
                      ))}
                    </Box>
                    {metrics?.redis?.connected && (
                      <Box sx={{ mt: 'auto', pt: 1.5 }}>
                        <ListItemButton
                          onClick={() => setRedisExpanded(!redisExpanded)}
                          aria-expanded={redisExpanded}
                          aria-controls="redis-advanced-telemetry"
                          sx={{
                            py: 1,
                            px: 1.5,
                            minHeight: { xs: 44, md: 36 },
                            borderRadius: (theme) => theme.shape.radius.pill,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            bgcolor: 'transparent',
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                          }}
                        >
                          <Typography
                            sx={{ fontSize: 12, fontWeight: 400, color: 'text.secondary' }}
                          >
                            Advanced telemetry
                          </Typography>
                          <ExpandMoreIcon
                            sx={{
                              fontSize: 16,
                              transform: redisExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: prefersReducedMotion ? 'none' : 'transform 0.2s ease',
                              color: 'text.secondary',
                            }}
                          />
                        </ListItemButton>
                        <Collapse in={redisExpanded} timeout={prefersReducedMotion ? 0 : 200}>
                          <Box
                            id="redis-advanced-telemetry"
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 1,
                              mt: 1,
                            }}
                          >
                            {[
                              {
                                label: 'Client count',
                                value: `${metrics.redis.connected_clients} active`,
                              },
                              { label: 'Redis version', value: metrics.redis.redis_version },
                              {
                                label: 'Upstash version',
                                value: metrics.redis.upstash_version || 'N/A',
                              },
                              {
                                label: 'Max memory limit',
                                value: metrics.redis.maxmemory_human || 'N/A',
                              },
                            ].map((item) => (
                              <Box
                                key={item.label}
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  p: 1,
                                  backgroundColor: (theme) =>
                                    alpha(theme.palette.text.primary, 0.01),
                                  border: '1px solid',
                                  borderColor: (theme) => alpha(theme.palette.text.primary, 0.04),
                                  borderRadius: '6px',
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: 11.5,
                                    color: 'text.secondary',
                                    fontFamily: (theme) => theme.typography.fontFamilyMono,
                                  }}
                                >
                                  {item.label}
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: 11.5,
                                    color: 'text.primary',
                                    fontWeight: 400,
                                    fontFamily: (theme) => theme.typography.fontFamilyMono,
                                  }}
                                >
                                  {item.value}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Collapse>
                      </Box>
                    )}
                  </Card>
                </Box>
              </Box>
            )}
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}

export default AdminDashboard;
