import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, Chip, PrimaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { trackAi } from '@/lib/analytics';
import {
  ASK_FEATURE,
  ASK_UI,
  buildAskContext,
  chipsForScreen,
  findPlannedName,
  historyTurns,
  loadAskThread,
  openAskLink,
  parseAskScreen,
  saveAskFeedback,
  type AskLink,
  type AskMessage,
  type AskMoveAction,
  type AskSafetyFlag,
} from '@/lib/askAscenda';
import { requestAskAnswer } from '@/lib/askAscendaAi';
import { aiCopy, fillCopy } from '@/lib/copy';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { movePlannedSession } from '@/lib/planner';

function safetyCard(flag: AskSafetyFlag | null): { title: string; body: string; emergency: boolean } | null {
  if (!flag || flag === 'none') return null;
  if (flag === 'emergency') return { title: 'Stop and get help', body: ASK_UI.emergency_card, emergency: true };
  if (flag === 'medical') return { title: 'Not medical advice', body: aiCopy.ask_card_medical, emergency: false };
  if (flag === 'pregnancy') return { title: 'Not pregnancy advice', body: aiCopy.ask_card_pregnancy, emergency: false };
  if (flag === 'body_or_diet') return { title: 'Strength, not body talk', body: aiCopy.ask_card_body, emergency: false };
  if (flag === 'off_topic') return { title: 'Training only', body: aiCopy.ask_card_off_topic, emergency: false };
  if (flag === 'wellbeing') return { title: 'You are not alone', body: aiCopy.ask_card_wellbeing, emergency: false };
  return null;
}

function formatMoveDate(iso: string): string {
  const stamp = Date.parse(`${iso}T12:00:00`);
  if (!Number.isFinite(stamp)) return iso;
  return new Date(stamp).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AskAscendaScreen() {
  useSubscriptionGate();
  const insets = useSafeAreaInsets();
  const { colours, radius, shadow } = useTheme();
  const params = useLocalSearchParams<{ screen?: string; id?: string; question?: string }>();
  const screen = parseAskScreen(params.screen);
  const entityId = Array.isArray(params.id) ? params.id[0] : params.id;
  const preset = (Array.isArray(params.question) ? params.question[0] : params.question)?.trim() ?? '';

  const [draft, setDraft] = useState(preset);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [contextForMove, setContextForMove] = useState<Awaited<ReturnType<typeof buildAskContext>> | null>(null);
  const [ready, setReady] = useState(false);
  const sentPreset = useRef(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    let current = true;
    loadAskThread()
      .then((thread) => {
        if (!current) return;
        setConversationId(thread.conversationId);
        setMessages(thread.messages);
      })
      .catch(() => {
        if (current) setNotice(aiCopy.ask_empty);
      })
      .finally(() => {
        if (current) setReady(true);
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !preset || sentPreset.current) return;
    sentPreset.current = true;
    void send(preset);
  }, [ready, preset]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !ensureSubscribed()) return;
    setBusy(true);
    setNotice(null);
    setDraft('');
    const userMessage: AskMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: question,
      safety_flag: null,
      links: [],
      action: null,
      feedback: null,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    try {
      const context = await buildAskContext({ question, screen, screenId: entityId });
      setContextForMove(context);
      const outcome = await requestAskAnswer({
        context,
        history: historyTurns(messages),
        conversationId,
      });
      if (outcome.kind === 'limit') {
        setNotice(aiCopy.ask_limit);
        return;
      }
      if (outcome.kind === 'error') {
        setNotice(ASK_UI.error);
        return;
      }
      if (outcome.conversationId) setConversationId(outcome.conversationId);
      const assistant: AskMessage = {
        id: outcome.messageId || `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: outcome.answer.reply,
        safety_flag: outcome.answer.safety_flag,
        links: outcome.answer.links,
        action: outcome.answer.action,
        feedback: null,
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, assistant]);
      if (outcome.answer.fallback) setNotice(aiCopy.ask_fallback);
      if (outcome.answer.action) confirmMove(outcome.answer.action, context);
    } catch {
      setNotice(ASK_UI.error);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  function confirmMove(
    action: AskMoveAction,
    context: NonNullable<typeof contextForMove>
  ) {
    const name = findPlannedName(context, action);
    showDialog(
      aiCopy.ask_move_title,
      fillCopy(aiCopy.ask_move_body, { name, date: formatMoveDate(action.to_date) }),
      [
        {
          text: aiCopy.ask_move_confirm,
          onPress: () => {
            void movePlannedSession(action.planned_session_id, action.to_date)
              .then(() => showDialog(aiCopy.ask_title, aiCopy.ask_moved))
              .catch((error) =>
                showDialog(
                  aiCopy.ask_title,
                  error instanceof Error ? error.message : ASK_UI.error
                )
              );
          },
        },
        { text: aiCopy.ask_move_cancel, style: 'cancel' },
      ]
    );
  }

  async function feedback(message: AskMessage, value: 'up' | 'down') {
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, feedback: value } : item))
    );
    trackAi(value === 'up' ? 'ai_result_accepted' : 'ai_result_rejected', ASK_FEATURE);
    if (!message.id.startsWith('local-')) {
      await saveAskFeedback(message.id, value).catch(() => {});
    }
  }

  const chips = chipsForScreen(screen);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: aiCopy.ask_title }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {aiCopy.ask_empty}
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
                        label={linkLabel(link)}
                        onPress={() => openAskLink(link)}
                      />
                    ))}
                  </View>
                ) : null}
                {item.role === 'assistant' ? (
                  <View style={styles.feedback}>
                    <Pressable
                      onPress={() => void feedback(item, 'up')}
                      accessibilityRole="button"
                      accessibilityLabel={ASK_UI.feedback_up}>
                      <Ionicons
                        name={item.feedback === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                        size={18}
                        color={item.feedback === 'up' ? colours.brand : colours.inkMuted}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => void feedback(item, 'down')}
                      accessibilityRole="button"
                      accessibilityLabel={ASK_UI.feedback_down}>
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
        {notice ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 8 }}>
            {notice}
          </AppText>
        ) : null}
        <Pressable onPress={() => router.push('/safety' as Href)} accessibilityRole="link">
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 12 }}>
            {ASK_UI.label} {ASK_UI.safety_link}
          </AppText>
        </Pressable>
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colours.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={aiCopy.ask_placeholder}
          placeholderTextColor={colours.inkSubtle}
          multiline
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
    </KeyboardAvoidingView>
  );
}

function linkLabel(link: AskLink): string {
  if (link.type === 'exercise') return 'Exercise guide';
  if (link.type === 'machine') return 'Machine guide';
  if (link.type === 'article') return 'Learn article';
  if (link.type === 'routine') return 'Routine';
  return 'Recipe';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bubbleWrap: {
    maxWidth: '92%',
  },
  mineWrap: {
    alignSelf: 'flex-end',
  },
  theirsWrap: {
    alignSelf: 'flex-start',
  },
  bubble: {
    padding: 12,
    gap: 8,
  },
  card: {
    padding: 12,
    marginBottom: 8,
  },
  innerCard: {
    padding: 8,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  feedback: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: {
    alignSelf: 'flex-end',
  },
});
