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

type DevToolsState = {
  showDevTools: boolean;
  setShowDevTools: (value: boolean) => void;
};

const DevToolsContext = createContext<DevToolsState>({
  showDevTools: false,
  setShowDevTools: () => {},
});

export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [showDevTools, setShowState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'true') setShowState(true);
      })
      .catch(() => {});
  }, []);

  const setShowDevTools = useCallback((value: boolean) => {
    setShowState(value);
    AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false').catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ showDevTools, setShowDevTools }),
    [showDevTools, setShowDevTools]
  );

  return createElement(DevToolsContext.Provider, { value }, children);
}

export function useDevTools(): DevToolsState {
  return useContext(DevToolsContext);
}
