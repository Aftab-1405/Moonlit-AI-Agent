---
name: react-flow-diagram
description: Use when the user requests a diagram, ERD, schema map, flowchart, mind map, dependency graph, query plan, state machine, or architecture visualization.
when_to_use: The requested output is a visual node-and-edge artifact that can be represented with React Flow.
avoid_when: The user wants only prose, SQL results, raw schema facts, a chart of numeric values, or a visual format that is not a node-and-edge diagram.
---

# React Flow Diagram

Return one grounded JSON object in a fenced `diagram-flow` block. Adapt its visual grammar to the requested idea; do not reuse an ERD-like card layout for every diagram.

## Evidence and tool decisions

A diagram is a presentation task, not permission for exhaustive analysis. Use the least evidence that makes its required nodes and edges accurate.

| Situation | Evidence action |
|---|---|
| The active conversation already contains the required facts | Use them directly; make no discovery call |
| User supplies a workflow, architecture, hypothetical system, or concepts | Use the supplied content; make no database call |
| ERD/schema facts are absent or materially incomplete | Call `get_schema_overview(target_tables?)` once |
| Required FKs are still missing after the overview | Call `get_foreign_keys` once for only the missing scope |
| User requests an actual execution-plan diagram for SQL | Call `explain_query(query)` once |
| User explicitly requests table sizes, row counts, or cardinality comparison | Call `get_table_row_counts` with up to ten requested tables; use the minimum batches only if more are required |

Omit optional metadata when it is unavailable. Never retrieve row counts merely to decorate nodes, choose a layout, appear thorough, or complete an example field. Never call tools for colors, positioning, labels inferable from the request, or facts already verified in active context. Every call must unlock a required node, edge, label, or user-requested metric; stop when the diagram can be built.

## Choose a visual grammar

| Intent | Layout | Semantic nodes |
|---|---|---|
| Flowchart / branching workflow | `hierarchical`, usually `TB` | `input`, `process`, `decision`, `output` |
| ERD / schema | `hierarchical`; choose direction from topology and label width | `entity` with useful `columns` |
| Query plan | `hierarchical`, usually `TB` | `scan`, `filter`, `join`, `aggregate`, `sort` |
| Architecture / data flow | `manual` or `hierarchical` | `actor`, `group`, `process`, `data`, `input`, `output` |
| Mind map / hub relationships | `radial` | `event`, `process`, `note`, `data` as meaning requires |
| State machine | `radial` or `manual` | `event`, `process`, `decision` |
| Dependency graph | `hierarchical` for ordered dependencies; `radial` for a hub | types that express each component's role |

Use shape, topology, edge routing, labels, and grouping to communicate meaning. Direction supports `LR`, `RL`, `TB`, and `BT`. Layout supports `hierarchical`, `radial`, and `manual`. For `manual`, give every node a numeric `position: {"x": ..., "y": ...}`. Prefer theme defaults; add `style` only for semantic emphasis.

For an ERD, direct each edge from the table containing the FK to the referenced table; label it `local_column → referenced_table.column`.

## JSON contract

```diagram-flow
{
  "layout": "manual",
  "direction": "LR",
  "nodes": [
    {
      "id": "client",
      "type": "actor",
      "label": "Client",
      "subtitle": "Starts request",
      "position": {"x": 0, "y": 120},
      "status": "ready",
      "tags": ["external"]
    },
    {
      "id": "api",
      "type": "process",
      "label": "API",
      "position": {"x": 300, "y": 40}
    }
  ],
  "edges": [
    {
      "id": "client-api",
      "source": "client",
      "target": "api",
      "label": "HTTPS",
      "type": "smoothstep",
      "markerEnd": "arrow-closed",
      "animated": false,
      "dashed": false
    }
  ]
}
```

Node fields: `id`, `type`, `label`, and optional `subtitle`, `position`, `status`, `tags`, `columns`, `count`, `style`. Supported types are `actor`, `entity`, `process`, `decision`, `data`, `input`, `output`, `event`, `note`, `group`, `scan`, `filter`, `join`, `aggregate`, and `sort`. Entity columns accept `name` plus optional `type`, `key`, and `nullable`; show only the detail useful for the request. `count` is optional and must come from requested verified evidence.

Edge types are `floating`, `default`, `simplebezier`, `smoothstep`, `step`, and `straight`. `markerStart`/`markerEnd` accept `none`, `arrow`, or `arrow-closed`. Use dashed edges for optional or inferred conceptual relationships; use animation only when motion or active flow is meaningful.

## Output check

- IDs are semantic and unique; every edge endpoint exists.
- Required facts are verified, while hypothetical content is clearly based on the user's model.
- Layout and node types match the diagram's meaning rather than a fixed template.
- Manual nodes all have positions; entity columns contain no invented metadata.
- Keep one view readable (normally at most 30 nodes); focus or split only when needed.
- Output the `diagram-flow` block first. Add at most three useful sentences afterward, unless the user asked for the diagram only.
