import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { useTheme } from '@/constants/theme';
import { isSessionStartCancelled } from '@/lib/firstSession';
import { describeRoutineError, fetchRoutineDay } from '@/lib/routines';
import { openLogger, startRoutineLogger } from '@/lib/startLogger';

/** Old pre-workout route: start the session and open the logger. */
export default function SessionLaunchScreen() {
  const { dayId, enrolmentId } = useLocalSearchParams<{
    routineId?: string;
    dayId?: string;
    enrolmentId?: string;
  }>();
  const { colours, type } = useTheme();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!dayId || !enrolmentId) {
        showDialog('Couldn’t start the session', 'Go back and try again.');
        router.back();
        return;
      }
      try {
        const day = await fetchRoutineDay(dayId);
        const result = await startRoutineLogger({
          enrolmentId,
          routineDayId: dayId,
          sourceProgrammeDayId: day?.source_programme_day_id,
        });
        if (result.alreadyActive) {
          showDialog(
            'You already have a session going',
            'Finish or discard it first, then start this one.',
            [
              { text: 'Open it', onPress: () => openLogger(result.sessionId, true) },
              { text: 'OK', style: 'cancel', onPress: () => router.back() },
            ]
          );
          return;
        }
        openLogger(result.sessionId, true);
      } catch (error) {
        if (isSessionStartCancelled(error)) {
          router.back();
          return;
        }
        showDialog('Couldn’t start the session', describeRoutineError(error));
        router.back();
      }
    })();
  }, [dayId, enrolmentId]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colours.bg }}>
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: 'Home',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colours.bg },
          headerTintColor: colours.brand,
        }}
      />
      <ActivityIndicator color={colours.brand} />
      <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 12 }]}>Opening your session…</Text>
    </View>
  );
}
