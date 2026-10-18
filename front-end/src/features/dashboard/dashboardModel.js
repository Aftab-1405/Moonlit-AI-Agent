export const DASHBOARD_SECTIONS = Object.freeze(['overview', 'usage', 'account']);

export function normalizeDashboardSection(section) {
  return DASHBOARD_SECTIONS.includes(section) ? section : 'overview';
}

export function getDashboardNavigationPlan({ isStreaming }) {
  return {
    requiresConfirmation: Boolean(isStreaming),
    destination: '/dashboard/overview',
  };
}

export function requestDashboardNavigation({
  isStreaming,
  navigate,
  stopStreaming,
  openConfirmation,
}) {
  const plan = getDashboardNavigationPlan({ isStreaming });
  if (!plan.requiresConfirmation) {
    navigate(plan.destination);
    return;
  }

  openConfirmation({
    open: true,
    title: 'Stop active responses?',
    message: 'Moonlit is still generating responses. Leaving will stop all active responses, including other chats.',
    confirmText: 'Stop and open dashboard',
    cancelText: 'Stay in chat',
    onConfirm: async () => {
      await stopStreaming();
      navigate(plan.destination);
    },
  });
}
