import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

export type DialogButton = {
  text: string;
  /** `cancel` is drawn as the quiet option, and is what tapping outside or Back does. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type DialogOptions = {
  title: string;
  message?: string;
  /** Defaults to a single "OK". */
  buttons?: DialogButton[];
};

let present: ((dialog: DialogOptions) => void) | null = null;

/** The app's themed version of `Alert.alert`. Needs `DialogProvider` near the root. */
export function showDialog(title: string, message?: string, buttons?: DialogButton[]) {
  present?.({ title, message, buttons });
}

function withDefaultButton(dialog: DialogOptions): DialogButton[] {
  return dialog.buttons && dialog.buttons.length > 0 ? dialog.buttons : [{ text: 'OK' }];
}

/** The button that tapping outside or Back presses, if any. */
function dismissButton(buttons: DialogButton[]): DialogButton | undefined {
  return buttons.find((button) => button.style === 'cancel') ?? (buttons.length === 1 ? buttons[0] : undefined);
}

/** Shows dialogs from `showDialog` one at a time, over everything except other modals. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogOptions[]>([]);

  useEffect(() => {
    present = (dialog) => setQueue((current) => [...current, dialog]);
    return () => {
      present = null;
    };
  }, []);

  const dialog = queue[0] ?? null;
  const close = () => setQueue((current) => current.slice(1));

  function handleBack() {
    if (!dialog) return;
    const button = dismissButton(withDefaultButton(dialog));
    if (!button) return;
    close();
    button.onPress?.();
  }

  return (
    <>
      {children}
      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleBack}>
        {dialog && <DialogCard dialog={dialog} onClose={close} />}
      </Modal>
    </>
  );
}

/**
 * A dialog drawn over its parent. `DialogProvider` uses it; render it directly inside
 * another `Modal` (such as a bottom sheet), where provider dialogs can't appear on top.
 */
export function DialogCard({ dialog, onClose }: { dialog: DialogOptions; onClose: () => void }) {
  const { colours } = useTheme();
  const buttons = withDefaultButton(dialog);
  const actions = buttons.filter((button) => button.style !== 'cancel');
  const cancel = buttons.find((button) => button.style === 'cancel');
  const dismiss = dismissButton(buttons);

  function press(button: DialogButton) {
    onClose();
    button.onPress?.();
  }

  return (
    <View style={[styles.overlay, { backgroundColor: colours.overlay }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={dismiss ? () => press(dismiss) : undefined}
        accessibilityLabel="Close"
      />
      <View style={[styles.card, { backgroundColor: colours.surface }]} accessibilityRole="alert">
        <AppText variant="title2" style={{ color: colours.ink }}>
          {dialog.title}
        </AppText>
        {dialog.message ? (
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 8 }}>
            {dialog.message}
          </AppText>
        ) : null}
        <View style={styles.buttons}>
          {actions.map((button) => (
            <Pressable
              key={button.text}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: button.style === 'destructive' ? colours.danger : colours.brand,
                },
                pressed && styles.pressed,
              ]}
              onPress={() => press(button)}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={{ color: colours.onBrand }}>
                {button.text}
              </AppText>
            </Pressable>
          ))}
          {cancel && (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { borderWidth: 1.5, borderColor: colours.brand, backgroundColor: colours.surface },
                pressed && styles.pressed,
              ]}
              onPress={() => press(cancel)}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={{ color: colours.brand }}>
                {cancel.text}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 28,
  },
  buttons: {
    gap: 10,
    marginTop: 24,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
