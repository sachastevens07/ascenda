import { useEffect, useRef, useState, type ReactNode } from 'react';

import { DisclaimerSheet } from '@/components/ui/Disclaimer';
import {
  markFirstSessionDisclaimerSeen,
  registerFirstSessionSheet,
} from '@/lib/firstSession';

/** Hosts the one-time first-session safety sheet. */
export function FirstSessionDisclaimerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerFirstSessionSheet(
      () =>
        new Promise((resolve) => {
          pending.current = resolve;
          setVisible(true);
        })
    );
    return () => {
      registerFirstSessionSheet(null);
      pending.current?.(false);
      pending.current = null;
    };
  }, []);

  function finish(ok: boolean) {
    setVisible(false);
    const resolve = pending.current;
    pending.current = null;
    resolve?.(ok);
  }

  return (
    <>
      {children}
      <DisclaimerSheet
        visible={visible}
        onUnderstand={() => {
          void markFirstSessionDisclaimerSeen().finally(() => finish(true));
        }}
        onDismiss={() => finish(false)}
      />
    </>
  );
}
