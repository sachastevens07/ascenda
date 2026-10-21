import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';

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
  const buttons = withDefaultButton(dialog);
  const actions = buttons.filter((button) => button.style !== 'cancel');
  const cancel = buttons.find((button) => button.style === 'cancel');
  const dismiss = dismissButton(buttons);

  function press(button: DialogButton) {
    onClose();
    button.onPress?.();
  }

  return (
    <View style={styles.overlay}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={dismiss ? () => press(dismiss) : undefined}
        accessibilityLabel="Close"
      />
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.title}>{dialog.title}</Text>
        {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
        <View style={styles.buttons}>
          {actions.map((button) => (
            <Pressable
              key={button.text}
              style={({ pressed }) => [
                styles.button,
                button.style === 'destructive' ? styles.destructiveButton : styles.primaryButton,
                pressed && styles.pressed,
              ]}
              onPress={() => press(button)}
              accessibilityRole="button">
              <Text style={styles.primaryButtonText}>{button.text}</Text>
            </Pressable>
          ))}
          {cancel && (
            <Pressable
              style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.pressed]}
              onPress={() => press(cancel)}
              accessibilityRole="button">
              <Text style={styles.cancelButtonText}>{cancel.text}</Text>
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
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 28,
    backgroundColor: colours.surface,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: colours.text,
  },
  message: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.textMuted,
    marginTop: 8,
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
  primaryButton: {
    backgroundColor: colours.accent,
  },
  destructiveButton: {
    backgroundColor: colours.danger,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
