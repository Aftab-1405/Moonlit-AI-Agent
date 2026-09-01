# Frontend UI Development Rules

## Authority

- `front-end/docs/design.md` is the immutable source of truth for this audit.
- Do not modify `DESIGN.md` during this project.
- Do not violate or extend it without explicit user approval.
- If the specification is ambiguous, technically harmful, or insufficient, stop and explain the
  rule, conflict, recommendation, and impact before changing implementation.

## Architecture Boundaries

- Keep route composition in `App.jsx` and route guards in `guards/`.
- Keep authenticated shell layout in `AppShell` and orchestration in `MainInterface`.
- Keep chat business/state behavior in existing chat hooks rather than presentation components.
- Keep API paths and request handling in `src/api/`.
- Keep raw color values in primitive tokens and application styles on semantic roles.
- Reuse shared component and interaction helpers before creating local alternatives.

## Allowed Patterns

- Existing Material UI components and Emotion `sx` styles.
- Existing semantic palette, typography, spacing, shape, and interaction roles.
- Small component-local styles when no reusable role exists and the value is directly specified by
  `DESIGN.md`.
- Focused extraction when a modified file has distinct responsibilities and extraction materially
  improves testing or reviewability.

## Discouraged Patterns

- Repeated one-off `sx` values for shared controls.
- Synchronizing state that can be derived from props, context, route state, or server data.
- Broad component rewrites during a design-compliance fix.
- New generic helpers that serve only one trivial use.

## Forbidden Patterns

- A second design system or styling framework.
- Unapproved light-mode behavior while `DESIGN.md` remains dark-only.
- Hardcoded design values when an appropriate token exists.
- Drop shadows, broad filled CTAs, non-canonical surface colors, or arbitrary gradients.
- Non-pill buttons or button-like controls unless `DESIGN.md` explicitly defines another shape.
- Font weights other than 400 for canonical product typography.
- Unrelated route, backend, database, authentication, or business-logic changes.
- New dependencies without first proving existing capabilities are insufficient.
- Unsafe casts, suppressed lint/type failures, debug logs, commented-out code, or stale temporary
  comments.

## MUI and Token Rules

- Prefer `theme.palette.*`, `theme.typography.*`, `theme.shape.*`, approved spacing roles, and
  shared interaction helpers.
- Raw hex values belong only in primitive token definitions or third-party syntax palettes.
- Cards use the documented 8px radius, hairline boundary, flat surface, and no shadow.
- Buttons use pill geometry; outline is the default and the filled primary variant is rare.
- Text inputs use the documented dark soft surface, 8px radius, body typography, hairline border,
  and visible focus treatment.
- Technical captions use uppercase Geist Mono with documented tracking.
- Inter is the approved open-source Universal Sans substitute for this implementation.

## Component Rules

- Keep rendering separate from data fetching and orchestration when complexity justifies it.
- Preserve semantic HTML and accessible names.
- Async components must intentionally handle loading, empty, success, error, disabled, and partial
  states that can occur.
- All interactive controls must be keyboard operable with a visible focus state.
- Mobile touch targets must be at least 44px where required by `DESIGN.md`.
- Do not hide essential actions exclusively behind hover.

## State and API Rules

- Do not add global state for local presentation concerns.
- Do not duplicate server or context state in components.
- Use the centralized API client and endpoint definitions.
- Preserve cookie credentials, CSRF handling, stream cancellation, and safe error boundaries.
- The backend remains authoritative for authentication, authorization, validation, and database
  safety.

## Accessibility and Responsive Expectations

- Use headings, landmarks, buttons, links, form labels, status regions, and dialogs semantically.
- Test keyboard focus, reduced motion, long content, zoom, overflow, and touch behavior.
- Treat 768px as the canonical primary mobile/desktop design transition unless the user approves a
  design deviation.
- Verify mobile, tablet, and desktop layouts; do not fix one viewport by breaking another.

## Testing Requirements

- Establish the relevant baseline before implementation.
- Add or update focused tests before implementation where the repository can express the behavior.
- Run targeted tests after each meaningful change.
- Before completing a phase, run lint, build, design audits, available tests, and browser sanity
  checks.
- Report build warnings and unverified paths; never claim unexecuted validation passed.

## Dependency Rules

- Prefer the standard platform, React, MUI, and existing libraries.
- Do not add a package for trivial behavior.
- Any proposed dependency must document maintenance, security, bundle, and architectural impact.

## AI-Agent Boundaries

- DO NOT modify `DESIGN.md`.
- DO NOT violate `DESIGN.md` without user approval.
- DO NOT modify unrelated code.
- DO NOT create a second design system.
- DO NOT hardcode design values if an appropriate token exists.
- DO NOT introduce dependencies without checking existing capabilities.
- DO NOT perform broad refactors during focused UI work.
- DO NOT assume current UI behavior is correct.
- DO NOT assume every existing implementation is bad.
- DO inspect before changing.
- DO challenge broken or inconsistent implementation with evidence.
- DO ask when requirements or design intent are genuinely unclear.
- DO update `memory.md` after meaningful work.
- Preserve user-owned staged or unstaged changes and avoid automatic commits unless requested.

## Definition of Done

A phase is done only when:

1. Its documented design gaps are resolved without unapproved deviations.
2. Every changed file has been cleaned and self-reviewed.
3. Relevant loading, empty, error, interaction, and responsive states are covered.
4. Targeted tests, lint, build, and applicable audits pass.
5. The affected user workflow has been sanity-tested in a browser when accessible.
6. Unverified paths and existing warnings are reported accurately.
7. `memory.md` and `phases.md` reflect the current state.
