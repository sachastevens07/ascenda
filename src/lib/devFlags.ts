import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'showDevTools';
const BYPASS_AI_LIMITS_KEY = 'bypassAiLimits';

let showDevToolsFlag = false;
let bypassAiLimitsFlag = false;

type DevToolsState = {
  showDevTools: boolean;
  bypassAiLimits: boolean;
  setShowDevTools: (value: boolean) => void;
  setBypassAiLimits: (value: boolean) => void;
};

const DevToolsContext = createContext<DevToolsState>({
  showDevTools: false,
  bypassAiLimits: false,
  setShowDevTools: () => {},
  setBypassAiLimits: () => {},
});

export function shouldBypassAiLimits(): boolean {
  return showDevToolsFlag && bypassAiLimitsFlag;
}

export function aiLimitBypassPayload(): { dev_bypass?: true } {
  return shouldBypassAiLimits() ? { dev_bypass: true } : {};
}

export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [showDevTools, setShowState] = useState(false);
  const [bypassAiLimits, setBypassState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'true') {
          showDevToolsFlag = true;
          setShowState(true);
        }
      })
      .catch(() => {});
    AsyncStorage.getItem(BYPASS_AI_LIMITS_KEY)
      .then((value) => {
        if (value === 'true') {
          bypassAiLimitsFlag = true;
          setBypassState(true);
        }
      })
      .catch(() => {});
  }, []);

  const setShowDevTools = useCallback((value: boolean) => {
    showDevToolsFlag = value;
    setShowState(value);
    AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false').catch(() => {});
  }, []);

  const setBypassAiLimits = useCallback((value: boolean) => {
    bypassAiLimitsFlag = value;
    setBypassState(value);
    AsyncStorage.setItem(BYPASS_AI_LIMITS_KEY, value ? 'true' : 'false').catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ showDevTools, bypassAiLimits, setShowDevTools, setBypassAiLimits }),
    [showDevTools, bypassAiLimits, setShowDevTools, setBypassAiLimits]
  );

  return createElement(DevToolsContext.Provider, { value }, children);
}

export function useDevTools(): DevToolsState {
  return useContext(DevToolsContext);
}
