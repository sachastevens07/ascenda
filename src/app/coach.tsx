import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, Chip, PrimaryButton, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { trackAi } from '@/lib/analytics';
import {
  COACH_FEATURE,
  COACH_UI,
  applyCoachCard,
  chipsForContext,
  contextChipLabel,
  deleteCoachThread,
  loadCoachMessages,
  loadCoachThreads,
  openCoachLink,
  parseCoachContextType,
  saveCoachFeedback,
  type CoachCard,
  type CoachContext,
  type CoachMessage,
  type CoachSafetyFlag,
  type SessionTodayExercise,
} from '@/lib/coach';
import { historyFromMessages, requestCoachAnswer } from '@/lib/coachAi';
import { aiCopy } from '@/lib/copy';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { callEmergencyPhrase } from '@/lib/region';

function safetyCard(flag: CoachSafetyFlag | null): { title: string; body: string; emergency: boolean } | null {
  if (!flag || flag === 'none') return null;
  if (flag === 'emergency') return { title: 'Stop and get help', body: COACH_UI.emergency_card.replace('{call_emergency}', callEmergencyPhrase()), emergency: true };
  if (flag === 'medical') return { title: 'Not medical advice', body: aiCopy.ask_card_medical, emergency: false };
  if (flag === 'pregnancy') return { title: 'Not pregnancy advice', body: aiCopy.ask_card_pregnancy, emergency: false };
  if (flag === 'body_or_diet') return { title: 'Strength, not body talk', body: aiCopy.ask_card_body, emergency: false };
  if (flag === 'off_topic') return { title: 'Training only', body: aiCopy.ask_card_off_topic, emergency: false };
  if (flag === 'wellbeing') return { title: 'You are not alone', body: aiCopy.ask_card_wellbeing, emergency: false };
  return null;
}

function keyboardOverlap(event: KeyboardEvent) {
  const windowHeight = Dimensions.get('window').height;
  const height = event.endCoordinates.height;
  const byFrame = windowHeight - event.endCoordinates.screenY;
  const pick =
    height > 80 && height < windowHeight * 0.7
      ? height
      : byFrame > 80 && byFrame < windowHeight * 0.7
        ? byFrame
        : Math.max(0, height);
  return Number.isFinite(pick) ? pick : 0;
}

function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const show = (event: KeyboardEvent) => setInset(keyboardOverlap(event));
    const hide = () => setInset(0);
    const subs = [
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    if (Platform.OS === 'ios') {
      subs.push(Keyboard.addListener('keyboardWillChangeFrame', show));
      subs.push(Keyboard.addListener('keyboardWillHide', hide));
    }
    return () => {
      for (const sub of subs) sub.remove();
    };
  }, []);
  return inset;
}

function parseSessionParam(raw: string | undefined): SessionTodayExercise[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SessionTodayExercise[]) : [];
  } catch {
    return [];
  }
}

function cardSummary(card: CoachCard): string {
  if (card.type === 'session_change') return String(card.summary ?? 'Updated session');
  if (card.type === 'session') return String(card.name ?? 'Session');
  if (card.type === 'routine_options') return 'Routine options';
  if (card.type === 'recipes') return 'Recipes from what you have';
  if (card.type === 'confirm') return String(card.label ?? card.name ?? 'Confirm');
  return card.type;
}

export default function CoachScreen() {
  useSubscriptionGate();
  const insets = useSafeAreaInsets();
  const { colours, radius, shadow } = useTheme();
  const params = useLocalSearchParams<{
    type?: string;
    id?: string;
    label?: string;
    question?: string;
    conversation?: string;
    newChat?: string;
    session?: string;
  }>();
  const context: CoachContext = {
    type: parseCoachContextType(params.type),
    id: Array.isArray(params.id) ? params.id[0] : params.id ?? '',
    label: Array.isArray(params.label) ? params.label[0] : params.label ?? '',
  };
  const preset = (Array.isArray(params.question) ? params.question[0] : params.question)?.trim() ?? '';
  const startNew = params.newChat !== '0';
  const sessionToday = parseSessionParam(Array.isArray(params.session) ? params.session[0] : params.session);
  const sessionId = context.type === 'session_today' ? context.id : undefined;

  const [draft, setDraft] = useState(preset);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    startNew ? null : (Array.isArray(params.conversation) ? params.conversation[0] : params.conversation) || null
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cardState, setCardState] = useState<Record<string, 'applied' | 'dismissed'>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<{ id: string; title: string }[]>([]);
  const sentPreset = useRef(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const chipLabel = contextChipLabel(context);
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 0;
  const bottomGap = keyboardOpen ? keyboardInset : Math.max(insets.bottom, 12);

  useEffect(() => {
    if (startNew || !conversationId) return;
    loadCoachMessages(conversationId)
      .then(setMessages)
      .catch(() => {});
  }, [conversationId, startNew]);

  useEffect(() => {
    if (!preset || sentPreset.current) return;
    sentPreset.current = true;
    void send(preset);
  }, [preset]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !ensureSubscribed()) return;
    Keyboard.dismiss();
    setBusy(true);
    setNotice(null);
    setDraft('');
    const userMessage: CoachMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: question,
      safety_flag: null,
      links: [],
      cards: [],
      retrieved_ids: [],
      feedback: null,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    try {
      const outcome = await requestCoachAnswer({
        message: question,
        context,
        conversationId,
        newChat: !conversationId,
        history: historyFromMessages(messages),
        sessionToday,
      });
      if (outcome.kind === 'limit') {
        setNotice(COACH_UI.limit_reached);
        return;
      }
      if (outcome.kind === 'error') {
        setNotice(COACH_UI.error);
        return;
      }
      if (outcome.conversationId) setConversationId(outcome.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: outcome.messageId || `local-assistant-${Date.now()}`,
          role: 'assistant',
          content: outcome.reply,
          safety_flag: outcome.safety_flag,
          links: outcome.links,
          cards: outcome.cards,
          retrieved_ids: [],
          feedback: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      setNotice(COACH_UI.error);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  useEffect(() => {
    if (keyboardInset <= 0) return;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [keyboardInset]);

  async function onCard(card: CoachCard, button: string) {
    try {
      if (button === 'Not now' || button === 'Cancel') {
        setCardState((current) => ({ ...current, [card.id]: 'dismissed' }));
        return;
      }
      const result = await applyCoachCard(card, button, sessionId);
      if (card.type === 'session_change' && button === 'Use this') {
        Keyboard.dismiss();
        setCardState((current) => ({ ...current, [card.id]: 'applied' }));
        if (sessionId && router.canGoBack()) {
          router.back();
          return;
        }
      }
      if (result) setNotice(result);
    } catch (error) {
      showDialog(COACH_UI.title, error instanceof Error ? error.message : COACH_UI.error);
    }
  }

  async function feedback(message: CoachMessage, value: 'up' | 'down') {
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, feedback: value } : item))
    );
    trackAi(value === 'up' ? 'ai_result_accepted' : 'ai_result_rejected', COACH_FEATURE);
    if (!message.id.startsWith('local-')) {
      await saveCoachFeedback(message.id, value).catch(() => {});
    }
  }

  const chips = chipsForContext(context.type);

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen
        options={{
          title: COACH_UI.title,
          keyboardHandlingEnabled: false,
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => {
                  setMessages([]);
                  setConversationId(null);
                  sentPreset.current = true;
                }}
                accessibilityRole="button"
                accessibilityLabel={COACH_UI.new_chat}>
                <AppText variant="caption" style={{ color: colours.brand }}>
                  {COACH_UI.new_chat}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setHistoryOpen((open) => !open);
                  if (!historyOpen) {
                    void loadCoachThreads()
                      .then((list) => setThreads(list.map((item) => ({ id: item.id, title: item.title }))))
                      .catch(() => {});
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={COACH_UI.history}>
                <Ionicons name="time-outline" size={22} color={colours.brand} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {chipLabel ? (
          <Chip label={chipLabel} size="lg" />
        ) : null}
        {historyOpen ? (
          <View style={[styles.history, { backgroundColor: colours.surface, borderRadius: radius.md }]}>
            <AppText variant="bodyStrong">{COACH_UI.history}</AppText>
            {threads.map((thread) => (
              <Pressable
                key={thread.id}
                onPress={() => {
                  setConversationId(thread.id);
                  setHistoryOpen(false);
                  void loadCoachMessages(thread.id).then(setMessages);
                }}
                onLongPress={() => {
                  showDialog(thread.title, 'Delete this chat?', [
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        void deleteCoachThread(thread.id).then(() => {
                          setThreads((current) => current.filter((item) => item.id !== thread.id));
                          if (conversationId === thread.id) {
                            setConversationId(null);
                            setMessages([]);
                          }
                        });
                      },
                    },
                    { text: 'Keep it', style: 'cancel' },
                  ]);
                }}>
                <AppText variant="body" style={{ color: colours.ink, marginTop: 8 }}>
                  {thread.title}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {messages.length === 0 ? (
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {COACH_UI.empty}
          </AppText>
        ) : null}
        {messages.length === 0 ? (
          <View style={styles.chips}>
            {chips.map((label) => (
              <Chip key={label} label={label} size="lg" onPress={() => void send(label)} />
            ))}
          </View>
        ) : null}
        {messages.map((item) => {
          const card = item.role === 'assistant' ? safetyCard(item.safety_flag) : null;
          const mine = item.role === 'user';
          return (
            <View key={item.id} style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
              {card?.emergency ? (
                <View style={[styles.card, { backgroundColor: colours.danger, borderRadius: radius.md }]}>
                  <AppText variant="bodyStrong" style={{ color: colours.onBrand }}>
                    {card.title}
                  </AppText>
                  <AppText variant="bodySm" style={{ color: colours.onBrand, marginTop: 4 }}>
                    {card.body}
                  </AppText>
                </View>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: mine ? colours.brandSoft : colours.surface,
                    borderRadius: radius.lg,
                  },
                  !mine ? shadow : null,
                ]}>
                {card && !card.emergency ? (
                  <View style={[styles.innerCard, { backgroundColor: colours.accentSoft, borderRadius: radius.md }]}>
                    <AppText variant="bodySm" style={{ color: colours.ink }}>
                      {card.body}
                    </AppText>
                  </View>
                ) : null}
                <AppText variant="body" style={{ color: colours.ink }}>
                  {item.content}
                </AppText>
                {item.links.length > 0 ? (
                  <View style={styles.links}>
                    {item.links.map((link) => (
                      <Chip
                        key={`${link.type}:${link.id}`}
                        label={link.type}
                        onPress={() => openCoachLink(link)}
                      />
                    ))}
                  </View>
                ) : null}
                {item.cards.map((toolCard) => (
                  <View
                    key={toolCard.id}
                    style={[styles.toolCard, { backgroundColor: colours.brandSoft, borderRadius: radius.md }]}>
                    <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                      {cardSummary(toolCard)}
                    </AppText>
                    {cardState[toolCard.id] === 'applied' ? (
                      <AppText variant="bodySm" style={{ color: colours.brand }}>
                        {toolCard.lighter === true || toolCard.energy === 'low'
                          ? COACH_UI.card_applied_lighter
                          : COACH_UI.card_applied_look}
                      </AppText>
                    ) : cardState[toolCard.id] === 'dismissed' ? null : (
                    <View style={styles.cardButtons}>
                      {(toolCard.buttons ?? []).map((button) =>
                        button === 'Not now' || button === 'Cancel' ? (
                          <SecondaryButton
                            key={button}
                            label={button}
                            appearance="outline"
                            size="compact"
                            onPress={() => void onCard(toolCard, button)}
                          />
                        ) : (
                          <PrimaryButton
                            key={button}
                            label={button}
                            size="compact"
                            onPress={() => void onCard(toolCard, button)}
                          />
                        )
                      )}
                    </View>
                    )}
                  </View>
                ))}
                {item.role === 'assistant' ? (
                  <View style={styles.feedback}>
                    <Pressable
                      onPress={() => void feedback(item, 'up')}
                      accessibilityRole="button"
                      accessibilityLabel={COACH_UI.feedback_up}>
                      <Ionicons
                        name={item.feedback === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                        size={18}
                        color={item.feedback === 'up' ? colours.brand : colours.inkMuted}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => void feedback(item, 'down')}
                      accessibilityRole="button"
                      accessibilityLabel={COACH_UI.feedback_down}>
                      <Ionicons
                        name={item.feedback === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                        size={18}
                        color={item.feedback === 'down' ? colours.brand : colours.inkMuted}
                      />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
        {busy ? <ActivityIndicator color={colours.brand} style={{ marginTop: 8 }} /> : null}
        <Pressable onPress={() => router.push('/safety' as Href)} accessibilityRole="link">
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 12 }}>
            {COACH_UI.label} {COACH_UI.safety_link}
          </AppText>
        </Pressable>
      </ScrollView>
      {notice ? (
        <View style={[styles.notice, { backgroundColor: colours.accentSoft }]}>
          <AppText variant="bodySm" style={{ color: colours.ink }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      <View style={[styles.composer, { borderTopColor: colours.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={COACH_UI.input_placeholder}
          placeholderTextColor={colours.inkSubtle}
          multiline
          onFocus={() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))}
          style={[
            styles.input,
            {
              color: colours.ink,
              backgroundColor: colours.surfaceMuted,
              borderRadius: radius.md,
            },
          ]}
        />
        <PrimaryButton
          label={busy ? '…' : aiCopy.ask_send}
          onPress={() => void send(draft)}
          disabled={busy || !draft.trim()}
          size="compact"
          style={styles.send}
        />
      </View>
      <View style={{ height: bottomGap, backgroundColor: colours.bg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 8 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  history: { padding: 12 },
  bubbleWrap: { maxWidth: '92%' },
  mineWrap: { alignSelf: 'flex-end' },
  theirsWrap: { alignSelf: 'flex-start' },
  bubble: { padding: 12, gap: 8 },
  card: { padding: 12, marginBottom: 8 },
  innerCard: { padding: 8 },
  toolCard: { padding: 10, gap: 8 },
  cardButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  feedback: { flexDirection: 'row', gap: 16, marginTop: 4 },
  notice: { paddingHorizontal: 16, paddingVertical: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10 },
  send: { alignSelf: 'flex-end' },
});
