# Moonlit design system

This guide describes Moonlit's appearance and reusable interaction rules. Values come from theme and interface code. The composer baseline is 26px.

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
| [appearance.js](../front-end/src/theme/appearance.js) | Appearance defaults, presets, profile validation, and import/export |

Use semantic roles and shared helpers from application components. Raw colors belong in primitive tokens or intentionally independent third-party syntax palettes. Appearance supports System, Light, and Dark. System follows the OS color scheme. Users can customize colors, contrast, and typography, and can edit light and dark profiles separately. The signed-in account's appearance persists in the current browser. See [Settings context](../front-end/src/contexts/SettingsContext.jsx) and [Theme context](../front-end/src/contexts/ThemeContext.jsx).

## Surfaces, fonts, and geometry

The shell, paper, input, composer, and context surfaces follow semantic colors for the active appearance profile. Surfaces use flat fills and hairline boundaries. Read semantic mappings when adding components so they respond to changes in mode or profile.

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

Appearance controls set the accent at runtime. The Moonlit preset's Default accent resolves to white in dark mode and near-black in light mode. Semantic tokens derive the appropriate foreground, hover, pressed, and selection colors from the active profile.

- Use `color="accent"` explicitly for Send, Run query, and the main non-destructive dialog action. `palette.primary` remains neutral emphasis.
- Checked controls, reasoning progress, selected-option checkmarks, and active drag indicators use accent.
- Tabs, segmented controls, sidebar navigation, ordinary hover, loaders, headings, and panel surfaces remain neutral.
- Keyboard focus uses visible semantic indicators. Pointer activation suppresses keyboard-style outlines on shared controls while focused fields and editors retain their own interaction styles.
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

Text-button small/medium/large desktop minimum heights are 32/36/40px, horizontal padding is 12/16/20px, and icon sizes are 18/20/22px. Medium is the default. Icon buttons use 32/36/44px. Labels use sentence case, weight 400, a 20px line height, and content-driven width; allow long labels to wrap. Mobile/coarse-pointer targets expand to at least 44px.

Use MUI `loading`. Centered loading preserves the label's layout/accessibility while hiding its paint; start-position loading replaces an existing icon. Reserve changing busy labels in the same grid cell when needed to prevent width jumps.

Navigation rows, query tabs, preference sections, model-picker rows, segmented controls, and wordmark links retain their navigation/list geometry. Dense message/schema/tab utilities can use 28–32px desktop controls with shared touch-target expansion. Composer controls retain their compact send/stop treatment. The connected-database control has an intentional disabled-success presentation.

## Layout and accessibility

The app root prevents document-level scrolling; panels own overflow. Keep the composer mounted at a stable tree position across welcome/active transitions, and preserve drafts when opening artifacts or changing sessions. History prepends must preserve the visible message anchor; streaming follows the bottom only while the reader is near it.

Sidebar sections share an inline panel. Fine-pointer hover can preview a section without changing persisted sidebar width; selection or interaction docks the preview. Close and Escape restore focus to the invoking control. Expanded desktop artifacts remain beside navigation rather than covering it.

MUI owns modal/drawer focus and Escape behavior. Finish a mobile drawer's exit before opening another overlay. Artifact fullscreen owns Escape within its focusable region and restores the invoking control; do not add competing document-level handlers. Omit desktop resize separators in narrow fullscreen overlays.

Use semantic buttons/links, accessible names, visible focus, and keyboard/pointer resize controls. Keep sidebar selection/menu actions and tab selection/close actions as sibling controls. Never hide an essential action exclusively behind hover. Test reduced motion, long labels, zoom, narrow heights, loading/empty/error/disabled states, and mobile targets. The schema mindmap modal owns focus and fullscreen layout while React Flow owns graph interaction.

## Authentication entry

The root and `/login` share the authentication screen and use the shared theme. Desktop uses a quiet brand panel with an illustrative question-to-insight workflow beside the form. Below 768px the form takes priority. The page owns vertical scrolling for short screens and registration.

Provider buttons use their identity colors and outlined surfaces. The main sign-in/create-account action uses the workspace accent; labels and focus states retain shared semantics. Authentication controls have 48px minimum heights and explicit autofill hints. The product illustration uses a single reduced-motion-aware entrance, with no live data requests or workspace component imports. The shared logo and theme remain application assets after removing the marketing page.

## Floating menus and popovers

Native MUI Menu/Select popups and AppPopover share the same paper and row helpers from `styles/shared.js`; theme overrides consume those helpers rather than maintaining separate copies. The reference is the inspected ChatGPT settings dropdown and profile menu (2026-11-02).

Floating surfaces have 16px corners, 10px content padding, the elevated-2 neutral at 90% opacity, 8px backdrop blur, a subtle inset highlight, and a soft shadow. An opaque elevated-2 fallback covers browsers without backdrop filters. Rows have 12px corners, 6px vertical/10px horizontal padding, 14px text with a 20px line height, and a 36px desktop minimum. Multiline content grows naturally; touch targets remain at least 44px. Hover and keyboard focus use the same neutral fill, with an explicit outline in forced-color mode. Selection remains semantic and destructive/disabled actions retain their own states.

Each caller owns placement, width, search, descriptions, and controls. It should not override the shared surface radius, background, or padding to create a separate popup style. Full-size dialogs remain opaque and do not inherit popup blur/shadow. Opening transitions must not reclaim focus after a user has begun navigating inside the popup.

## Settings overlay

Settings is a pane beside the existing 52px application rail. Chat and artifact surfaces stay mounted behind it while hidden and inert. Section selection updates the `/settings/<section>` URL. Closing settings restores the background chat location. See the [route behavior](architecture.md#frontend).

The pane and mobile navigation use the active theme's `background.default`. Desktop has a 288px settings sidebar and an independently scrolling content area with a 768px maximum content width. Navigation groups General and Appearance under Personal, and Database and AI context under Workspace. [Settings search](../front-end/src/features/overlays/settings/settingsRegistry.js) matches individual settings by label and description and can reveal and focus a selected control.

The explicit `settings` preference variant uses uniform groups, inset separators, 14px/20px labels, 12px/16px descriptions, 62px minimum rows, and pill selectors. Selectors are 36px on desktop and at least 44px on touch devices. Switches keep their compact visual shape with a 44px touch target. Shared components retain the database connection dialog's existing presentation by default.

General and Database offer Reset all settings, which restores AI, database, and appearance preferences, including model selection. Desktop users can leave through the application rail or Escape. Mobile users can choose Home in the navigation drawer. Select menus and drawers consume Escape before the containing pane. The chat controller owns focus restoration.

## Maintenance

Update this guide and the owning tokens together when design intent changes. Keep durable design decisions here; do not retain interface-inspection dumps or separate research logs in the repository.
