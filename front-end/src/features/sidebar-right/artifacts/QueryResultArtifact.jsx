import { Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getExecutionResult } from '@/api/conversations';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeExecutionResult } from '@/features/chat/conversationOutputs';
import ArtifactShell, {
  ArtifactCanvasPanel,
  ArtifactEmptyState,
  ArtifactLoadingState,
} from '@/features/sidebar-right/artifact-loader/ArtifactLayout';
import DataVisualizationPanel from '@/features/sidebar-right/artifacts/data-visualization';

export default function QueryResultArtifact({
  conversationId,
  executionId,
  sourceQuery,
  ...props
}) {
  const { user } = useAuth();
  const result = useQuery({
    queryKey: ['executionResult', user?.uid, conversationId, executionId],
    queryFn: async ({ signal }) => {
      const response = await getExecutionResult(conversationId, executionId, signal);
      if (response.status !== 'success' || !response.data)
        throw new Error(response.message || 'Could not load this query result.');
      return normalizeExecutionResult(response.data);
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  if (result.isPending || result.isError) {
    return (
      <ArtifactShell
        {...props}
        title={props.title || 'Query results'}
        footer={
          result.isError ? (
            <Button onClick={() => result.refetch()}>Retry loading results</Button>
          ) : null
        }
      >
        <ArtifactCanvasPanel>
          {result.isPending ? (
            <ArtifactLoadingState title="Loading query results" />
          ) : (
            <ArtifactEmptyState
              role="alert"
              ariaLive="polite"
              title="Results unavailable"
              message={result.error.message}
            />
          )}
        </ArtifactCanvasPanel>
      </ArtifactShell>
    );
  }
  return <DataVisualizationPanel {...props} data={result.data} sourceQuery={sourceQuery} />;
}
