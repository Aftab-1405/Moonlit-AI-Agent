import { Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getExecutionResult } from '@/api/conversations';
import { normalizeExecutionResult } from '@/features/chat/conversationOutputs';
import ArtifactShell, {
  ArtifactEmptyState,
} from '@/features/sidebar-right/artifact-loader/ArtifactLayout';
import DataVisualizationPanel from '@/features/sidebar-right/artifacts/data-visualization';

export default function QueryResultArtifact({
  conversationId,
  executionId,
  sourceQuery,
  ...props
}) {
  const result = useQuery({
    queryKey: ['executionResult', conversationId, executionId],
    queryFn: async () => {
      const response = await getExecutionResult(conversationId, executionId);
      if (response.status !== 'success' || !response.data)
        throw new Error(response.message || 'Could not load this query result.');
      return normalizeExecutionResult(response.data);
    },
    retry: false,
    staleTime: Infinity,
  });
  if (result.isPending || result.isError) {
    return (
      <ArtifactShell
        {...props}
        title="Query results"
        footer={
          result.isError ? (
            <Button onClick={() => result.refetch()}>Retry loading results</Button>
          ) : null
        }
      >
        <ArtifactEmptyState
          role={result.isError ? 'alert' : 'status'}
          ariaLive="polite"
          title={result.isError ? 'Results unavailable' : 'Loading query results'}
          message={result.isError ? result.error.message : 'Retrieving the saved execution.'}
        />
      </ArtifactShell>
    );
  }
  return <DataVisualizationPanel {...props} data={result.data} sourceQuery={sourceQuery} />;
}
