import { ThemeProvider } from '@mui/material/styles';
import { createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PerspectiveDashboard from '@/features/sidebar-right/artifacts/data-visualization/PerspectiveDashboard.jsx';
import { createDarkTheme } from '@/theme';

const root = createRoot(document.getElementById('root'));
const theme = createDarkTheme();
window.fixtureState = { ready: false, notices: [], metrics: {} };
window.dashboardRef = createRef();
const onReadyChange = (ready) => {
  window.fixtureState.ready = ready;
};
const onNotices = (notices) => {
  window.fixtureState.notices = notices;
};
const onMetrics = (metrics) => {
  Object.assign(window.fixtureState.metrics, metrics);
};
window.showSnapshot = (data) =>
  root.render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <PerspectiveDashboard
          ref={window.dashboardRef}
          data={data}
          onReadyChange={onReadyChange}
          onNotices={onNotices}
          onMetrics={onMetrics}
        />
      </ThemeProvider>
    </StrictMode>,
  );
window.closeSnapshot = () => root.render(null);
window.componentFixtureReady = true;
