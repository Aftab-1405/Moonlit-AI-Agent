import SvgIcon from '@mui/material/SvgIcon';

/** Shared geometry for the product's compact, theme-aware outline icons. */
function IconBase({ children, ...props }) {
  return (
    <SvgIcon
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <g fill="none">{children}</g>
    </SvgIcon>
  );
}

export default IconBase;
