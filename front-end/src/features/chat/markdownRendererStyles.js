const FIRST_MARKDOWN_ELEMENT_CLASS = 'markdown-first-child';

/** Mark the first rendered element without relying on SSR-unsafe CSS selectors. */
export function markFirstMarkdownElement() {
  return (tree) => {
    const firstElement = tree?.children?.find((child) => child?.type === 'element');
    if (!firstElement) return;

    const existingClassName = firstElement.properties?.className;
    const classNames = Array.isArray(existingClassName)
      ? existingClassName
      : existingClassName
        ? [existingClassName]
        : [];

    firstElement.properties = {
      ...firstElement.properties,
      className: [...classNames, FIRST_MARKDOWN_ELEMENT_CLASS],
    };
  };
}

export function getMarkdownBoundarySx() {
  return {
    [`& > .${FIRST_MARKDOWN_ELEMENT_CLASS}`]: { mt: 0 },
    [`& > .${FIRST_MARKDOWN_ELEMENT_CLASS} > [role="group"]`]: { mt: 0 },
    '& > :last-child': { mb: 0 },
  };
}
