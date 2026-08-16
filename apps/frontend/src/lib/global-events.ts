import { useEffect, useRef } from 'react';

/**
 * The single pattern for "global signal triggered from the API layer":
 * lib/api-client.ts dispatches a window CustomEvent (React Context is not
 * reachable outside the tree), and components subscribe with useGlobalEvent.
 * The names live here so dispatch and subscription can never drift.
 */
export const GLOBAL_EVENTS = {
  PLAN_LIMIT: 'casso:plan-limit',
  MEMBER_BLOCKED: 'casso:member-blocked',
} as const;

export type GlobalEventName =
  (typeof GLOBAL_EVENTS)[keyof typeof GLOBAL_EVENTS];

export function dispatchGlobalEvent(eventName: GlobalEventName): void {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function useGlobalEvent(
  eventName: GlobalEventName,
  handler: () => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = () => handlerRef.current();
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName]);
}
