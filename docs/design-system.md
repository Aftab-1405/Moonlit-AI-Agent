# Moonlit design system

This guide describes the current dark UI and reusable interaction rules. Values come from theme and interface code. The composer baseline is 26px.

## Token ownership

| Source | Responsibility |
| --- | --- |
| [primitives.js](../front-end/src/theme/tokens/primitives.js) | Raw neutral, workspace accent, status, identity, and marketing colors |
| [semantic.js](../front-end/src/theme/tokens/semantic.js) | Surface/text roles, interaction states, readable accent variants |
| [component.js](../front-end/src/theme/tokens/component.js) | Component color roles |
| [tokens.js](../front-end/src/theme/tokens.js) | Fonts, shapes, breakpoints, button/switch geometry |
| [createMoonlitTheme.js](../front-end/src/theme/createMoonlitTheme.js) | MUI palette and component defaults/overrides |
| [interfaceChrome.js](../front-end/src/features/styles/interfaceChrome.js) | Shell/composer geometry, surfaces, and layout helpers |
| [typography.js](../front-end/src/theme/typography.js) | Typography roles |

Use semantic roles and shared helpers from application components. Raw colors belong in primitive tokens or intentionally independent third-party syntax palettes. The application is dark-only; stored legacy light preferences do not select a second runtime theme.

## Surfaces, fonts, and geometry

The current shell/default background is black, paper is neutral 925, inputs are neutral 900, the composer is neutral 890, and its context surface is neutral 860. Read semantic mappings instead of copying literal colors into components. Surfaces are flat with hairline boundaries; arbitrary gradients and drop shadows are not the shared workspace language.

The sans stack is `Geist, Inter, system-ui, ...`; monospace uses Geist Mono, and content typography has an Arial stack. Weight 400 is the standard product typography treatment. Technical captions use defined mono/caption roles.

| Geometry | Current value/behavior |
| --- | --- |
| Standard cards and inputs | 8px radius |
| Artifact content panels | 12px through shared artifact panel primitives |
| Outer artifact shell | 20px via `getArtifactPanelChromeSx` |
| Composer | 26px via `INTERFACE_RADIUS.composer` |
| Suggestion panel | 16px |
| Standard buttons | Pill geometry |
| Primary desktop transition | 768px (`md`); other MUI breakpoints remain available |
| Mobile/coarse-pointer controls | At least 44px hit targets through the shared media query |

The design uses 4px increments with MUI's 8px spacing function, so fractional multipliers are expected. Shared geometry belongs in tokens/helpers rather than per-component overrides.

Artifact content panels use `ArtifactCanvasPanel`/`ArtifactUtilityPanel` for clipping, border, radius, and surfaces. Renderers supply content and sizing. The composer/transcript share the established chat-width role and responsive gutters.

## Accent and focus

`primitives.workspace.accent` owns the workspace accent (currently `#f077af`). Hover, pressed, contrast text, foreground, and selection variants derive centrally. Changing it requires a rebuild/reload; it is not a runtime preference.

- Use `color="accent"` explicitly for Send, Run query, and the main non-destructive dialog action. `palette.primary` remains neutral emphasis.
- Checked controls, reasoning progress, selected-option checkmarks, and active drag indicators use accent.
- Tabs, segmented controls, sidebar navigation, ordinary hover, loaders, headings, and panel surfaces remain neutral.
- Focus rings, focused input/editor borders, and carets use visible neutral roles independent of accent.
- Status/destructive actions retain success/error/warning roles; disabled controls remain neutral.
- Provider/database identity, charts, syntax, skills, and diff colors have separate semantics. Do not recolor them when changing the workspace accent.

Verify an alternate accent, readable contrast, and disabled/error precedence when modifying this system.

## Buttons

Use MUI `Button` and `IconButton`, including `Button component={Link}` for navigation actions. A separate button wrapper is unnecessary for the current system.

| Role | Treatment |
| --- | --- |
| Main workspace action | `variant="contained" color="accent"` |
| Secondary action | `variant="outlined"` |
| Tertiary action | `variant="text"` (MUI default) |
| Destructive action | `color="error"`; contained for the final destructive confirmation when appropriate |
| Icon action | `IconButton` with a meaningful accessible name |
| Marketing emphasis | Existing neutral contained/outlined palette |

Text-button small/medium/large desktop minimum heights are 32/36/40px, horizontal padding is 12/16/20px, and icon sizes are 18/20/22px. Medium is the default. Icon buttons use 32/36/44px. Labels use sentence case, weight 400, a 20px line height, and content-driven width; allow long labels to wrap. Mobile/coarse-pointer targets expand to at least 44px.

Use MUI `loading`. Centered loading preserves the label's layout/accessibility while hiding its paint; start-position loading replaces an existing icon. Reserve changing busy labels in the same grid cell when needed to prevent width jumps.

Navigation rows, query tabs, preference sections, model-picker rows, segmented controls, and wordmark links retain their navigation/list geometry. Dense message/schema/tab utilities can use 28–32px desktop controls with shared touch-target expansion. Composer controls retain their compact send/stop treatment. The connected-database control has an intentional disabled-success presentation.

## Layout and accessibility

The app root prevents document-level scrolling; panels own overflow. Keep the composer mounted at a stable tree position across welcome/active transitions, and preserve drafts when opening artifacts or changing sessions. History prepends must preserve the visible message anchor; streaming follows the bottom only while the reader is near it.

Sidebar sections share an inline panel. Fine-pointer hover can preview a section without changing persisted sidebar width; selection or interaction docks the preview. Close and Escape restore focus to the invoking control. Expanded desktop artifacts remain beside navigation rather than covering it.

MUI owns modal/drawer focus and Escape behavior. Finish a mobile drawer's exit before opening another overlay. Artifact fullscreen owns Escape within its focusable region and restores the invoking control; do not add competing document-level handlers. Omit desktop resize separators in narrow fullscreen overlays.

Use semantic buttons/links, accessible names, visible focus, and keyboard/pointer resize controls. Keep sidebar selection/menu actions and tab selection/close actions as sibling controls. Never hide an essential action exclusively behind hover. Test reduced motion, long labels, zoom, narrow heights, loading/empty/error/disabled states, and mobile targets. The schema mindmap modal owns focus and fullscreen layout while React Flow owns graph interaction.

## Maintenance

Update this guide and the owning tokens together when design intent changes. Keep durable design decisions here; do not retain interface-inspection dumps or separate research logs in the repository.
