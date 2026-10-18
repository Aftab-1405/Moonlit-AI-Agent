const DIAGRAM_SKILL_NAMES = new Set(['react-flow-diagram', 'react_flow_diagram']);
const COMPLETE_DIAGRAM_BLOCK = /```diagram-flow[^\n]*\n[\s\S]*?```/i;
const OPEN_DIAGRAM_BLOCK = /```diagram-flow(?:\s|\n|$)/i;

const hasDiagramSkill = (items) =>
  (Array.isArray(items) ? items : []).some((item) => {
    if (item?.type === 'skill') {
      return (Array.isArray(item.skills) ? item.skills : []).some((skill) =>
        DIAGRAM_SKILL_NAMES.has(String(skill || '').toLowerCase()),
      );
    }
    if (item?.type !== 'tool' || !['read_skill', 'load_skill'].includes(item.name)) return false;
    const skillName =
      item.args?.skill_name ||
      item.args?.skillName ||
      item.result?.skill_name ||
      item.result?.skillName;
    return DIAGRAM_SKILL_NAMES.has(String(skillName || '').toLowerCase());
  });

export function getDiagramArtifactPhase({
  isActive = false,
  markdown = '',
  steps = [],
  timeline = [],
} = {}) {
  const content = String(markdown || '');
  if (COMPLETE_DIAGRAM_BLOCK.test(content)) return 'ready';
  if (!isActive) return 'hidden';
  if (OPEN_DIAGRAM_BLOCK.test(content) || hasDiagramSkill(steps) || hasDiagramSkill(timeline)) {
    return 'generating';
  }
  return 'hidden';
}

export function getDiagramArtifactCardPresentation({ isGenerating = false } = {}) {
  if (isGenerating) {
    return {
      title: 'Building diagram',
      metadata: 'Diagram · Structuring nodes and relationships',
      ariaLabel: 'Moonlit is building the diagram',
      isInteractive: false,
    };
  }

  return {
    title: 'View diagram',
    metadata: null,
    ariaLabel: 'View diagram',
    isInteractive: true,
  };
}
