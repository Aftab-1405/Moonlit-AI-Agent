import assert from 'node:assert/strict';
import test from 'node:test';
import { getDiagramArtifactCardPresentation } from './diagramArtifactModel.js';

test('ready diagram card exposes one concise view action', () => {
  assert.deepEqual(
    getDiagramArtifactCardPresentation({
      isGenerating: false,
      title: 'Customer onboarding diagram',
    }),
    {
      title: 'View diagram',
      metadata: null,
      ariaLabel: 'View diagram',
      isInteractive: true,
    },
  );
});

test('generating diagram card remains a descriptive live status', () => {
  assert.deepEqual(getDiagramArtifactCardPresentation({ isGenerating: true }), {
    title: 'Building diagram',
    metadata: 'Diagram · Structuring nodes and relationships',
    ariaLabel: 'Moonlit is building the diagram',
    isInteractive: false,
  });
});
