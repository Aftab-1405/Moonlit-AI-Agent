export const CHAT_MOTION = Object.freeze({
  ease: Object.freeze([0.22, 1, 0.36, 1]),
  turn: Object.freeze({ duration: 0.18, distance: 6 }),
  content: Object.freeze({ duration: 0.16, distance: 4 }),
  status: Object.freeze({ enterDuration: 0.14, exitDuration: 0.1, distance: 2 }),
  structured: Object.freeze({ duration: 0.18, distance: 4 }),
  controlDuration: 0.12,
});

function createEntryVariant({ duration, distance }, reduceMotion) {
  return {
    initial: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : distance },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0 : duration,
        ease: CHAT_MOTION.ease,
      },
    },
  };
}

export function getChatMotionVariants(reduceMotion = false) {
  const turn = createEntryVariant(CHAT_MOTION.turn, reduceMotion);
  const content = createEntryVariant(CHAT_MOTION.content, reduceMotion);
  const structured = createEntryVariant(CHAT_MOTION.structured, reduceMotion);
  const status = createEntryVariant(
    { duration: CHAT_MOTION.status.enterDuration, distance: CHAT_MOTION.status.distance },
    reduceMotion,
  );

  status.exit = {
    opacity: 0,
    y: reduceMotion ? 0 : -CHAT_MOTION.status.distance,
    transition: {
      duration: reduceMotion ? 0 : CHAT_MOTION.status.exitDuration,
      ease: CHAT_MOTION.ease,
    },
  };

  return { turn, content, status, structured };
}

export function getNewMessageEntryIds({
  previousSessionKey,
  sessionKey,
  wasLoading,
  isLoading,
  seenIds,
  messageIds,
}) {
  if (!sessionKey || previousSessionKey !== sessionKey || wasLoading || isLoading) {
    return new Set();
  }

  return new Set(messageIds.filter((id) => id && !seenIds.has(id)));
}
