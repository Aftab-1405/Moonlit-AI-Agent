/**
 * QuotaDisplay - Real-time user rate limit quota indicator
 * 
 * Shows user's remaining requests with a compact chip indicator.
 * Polls the /api/v1/quota/status endpoint for real-time updates.
 * Uses theme semantic colors (success/warning/error) for consistency.
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Box, Tooltip, Typography, Chip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import BoltIcon from '@mui/icons-material/Bolt';
import { getQuotaStatus } from '../api';
import logger from '../utils/logger';
const POLL_INTERVAL = 10000;
const formatResetTime = (seconds) => {
  if (!seconds || seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
};

function QuotaDisplay() {
  const theme = useTheme();

  const [quota, setQuota] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enabled, setEnabled] = useState(true);

  const intervalRef = useRef(null);

  const fetchQuota = useCallback(async () => {
    try {
      const data = await getQuotaStatus();
      if (data.status === 'success') {
        setQuota(data.quota);
        setEnabled(data.enabled ?? true);
        setError(null);
      }
    } catch (err) {
      logger.debug('Failed to fetch quota:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    const startPolling = () => {
      if (!intervalRef.current) {
        fetchQuota();
        intervalRef.current = setInterval(fetchQuota, POLL_INTERVAL);
      }
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchQuota]);
  const { remaining, limit, statusColor } = useMemo(() => {
    if (!quota?.minute) return { remaining: 0, limit: 1, statusColor: 'success' };
    
    const used = quota.minute.used || 0;
    const lim = quota.minute.limit || 1;
    const rem = Math.max(lim - used, 0);
    const percentUsed = Math.min((used / lim) * 100, 100);
    
    let color = 'success';
    if (percentUsed >= 80) color = 'error';
    else if (percentUsed >= 50) color = 'warning';
    
    return { remaining: rem, limit: lim, statusColor: color };
  }, [quota]);
  const tooltipContent = useMemo(() => {
    if (!quota) return null;
    return (
      <Box sx={{ p: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit' }}>
          Rate Limits
        </Typography>
        <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            Minute: {quota.minute?.used || 0}/{quota.minute?.limit || 0} (resets in {formatResetTime(quota.minute?.resets_in)})
          </Typography>
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            Hour: {quota.hour?.used || 0}/{quota.hour?.limit || 0}
          </Typography>
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            Day: {quota.day?.used || 0}/{quota.day?.limit || 0}
          </Typography>
        </Box>
      </Box>
    );
  }, [quota]);
  const chipStyles = useMemo(() => ({
    height: 24,
    fontWeight: 600,
    borderRadius: '12px',
    cursor: 'default',
    backgroundColor: alpha(theme.palette[statusColor].main, 0.08),
    '& .MuiChip-icon': {
      color: theme.palette[statusColor].main,
      marginLeft: '6px',
    },
    '& .MuiChip-label': {
      paddingLeft: '4px',
      paddingRight: '8px',
    },
  }), [theme, statusColor]);
  if (isLoading || error || !enabled || !quota) {
    return null;
  }

  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Chip
        icon={<BoltIcon sx={{ fontSize: 14 }} />}
        label={`${remaining}/${limit}`}
        size="small"
        color={statusColor}
        sx={chipStyles}
      />
    </Tooltip>
  );
}

export default memo(QuotaDisplay);
