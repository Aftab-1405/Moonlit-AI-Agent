import { Box, Stack, Typography } from '@mui/material';

const WORKFLOW = [
  ['01', 'Understand the schema', 'Find the context behind your question.'],
  ['02', 'Build the query', 'Turn intent into readable SQL.'],
  ['03', 'Explore the answer', 'See the data. Follow the next question.'],
];

function AuthBrandPanel({ layoutSx }) {
  return (
    <Box component="aside" aria-label="About Moonlit" sx={layoutSx.brandPanel}>
      <Box component="span" aria-hidden="true" sx={layoutSx.orbit} />
      <Box sx={layoutSx.brandContent}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box component="img" src="/moonlit.svg" alt="" sx={{ width: 28, height: 28 }} />
          <Typography sx={(theme) => theme.typography.uiBrandWordmark}>Moonlit</Typography>
        </Stack>

        <Box sx={layoutSx.productBlock}>
          <Typography
            sx={(theme) => ({ ...theme.typography.captionMonoSm, color: 'text.secondary' })}
          >
            A LITTLE CURIOSITY. A CLEARER PICTURE.
          </Typography>
          <Typography
            component="h2"
            sx={(theme) => ({
              ...theme.typography.displayMd,
              fontSize: { md: '2.5rem', lg: '3.5rem' },
              lineHeight: 1.08,
              letterSpacing: '-0.04em',
              mt: 2.5,
              textWrap: 'balance',
            })}
          >
            Your data.
            <br />A clearer answer.
          </Typography>
          <Typography sx={{ maxWidth: 380, mt: 2.5, color: 'text.secondary', textWrap: 'pretty' }}>
            Ask in your own words. Explore your databases with an AI that helps connect the dots.
          </Typography>

          <Box sx={layoutSx.illustration}>
            <Typography
              sx={(theme) => ({ ...theme.typography.captionMonoSm, color: 'text.secondary' })}
            >
              AN EXAMPLE WORKFLOW
            </Typography>
            <Typography sx={{ mt: 1.5, mb: 3, textWrap: 'balance' }}>
              “Which products drive the most revenue?”
            </Typography>
            {WORKFLOW.map(([step, title, detail]) => (
              <Box key={step} sx={layoutSx.flowStep}>
                <Box component="span" aria-hidden="true" sx={layoutSx.flowMarker}>
                  {step}
                </Box>
                <Box>
                  <Typography sx={{ typography: 'bodySm' }}>{title}</Typography>
                  <Typography sx={{ mt: 0.25, typography: 'caption', color: 'text.secondary' }}>
                    {detail}
                  </Typography>
                </Box>
              </Box>
            ))}
            <Stack
              direction="row"
              spacing={0.75}
              aria-hidden="true"
              alignItems="end"
              sx={{ height: 40, mt: 1 }}
            >
              {[38, 58, 46, 74, 62, 88, 100].map((height) => (
                <Box
                  key={height}
                  sx={{
                    flex: 1,
                    height: `${height}%`,
                    bgcolor: 'accent.selectedBackground',
                    borderTop: '1px solid',
                    borderColor: 'accent.selectedBorder',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              ))}
            </Stack>
          </Box>
        </Box>

        <Typography
          sx={(theme) => ({
            ...theme.typography.captionMonoSm,
            display: { xs: 'none', md: 'block' },
            color: 'text.secondary',
          })}
        >
          NATURAL LANGUAGE · SQL · INSIGHT
        </Typography>
      </Box>
    </Box>
  );
}

export default AuthBrandPanel;
