import { useEffect, useLayoutEffect } from 'react';
import { sessionActive, USER } from '../../api';

const readSessionInstanceId = () => {
  try {
    return sessionStorage.getItem('moonlit-session-instance-id');
  } catch {
    return null;
  }
};

export function useChatPageSessionLifecycle({ isDbConnected, connectionPersistenceMinutes }) {
  useEffect(() => {
    document.title = 'Moonlit - Chat';
  }, []);

  useLayoutEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const rootEl = document.getElementById('root');
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevRootOverflow = rootEl?.style.overflow;

    htmlEl.style.overflow = 'hidden';
    bodyEl.style.overflow = 'hidden';
    if (rootEl) rootEl.style.overflow = 'hidden';

    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      if (rootEl) rootEl.style.overflow = prevRootOverflow || '';
    };
  }, []);

  useEffect(() => {
    const handleTabClose = () => {
      if (!isDbConnected) return;
      const sessionInstanceId = readSessionInstanceId();
      const payload = { connectionPersistenceMinutes, sessionInstanceId };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const closeUrl = `${window.location.origin}${USER.SESSION_CLOSE}`;
      navigator.sendBeacon(closeUrl, blob);
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);

    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
    };
  }, [isDbConnected, connectionPersistenceMinutes]);

  useEffect(() => {
    if (!isDbConnected) return;

    const ping = () => {
      const sessionInstanceId = readSessionInstanceId();
      sessionActive(sessionInstanceId).catch(() => { });
    };

    ping();
    const timerId = setInterval(ping, 5000);
    return () => {
      clearInterval(timerId);
    };
  }, [isDbConnected]);
}
