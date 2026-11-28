import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DialogHost, showDialog } from '@/components/Dialog';
import { AppText, PhotoFill, PrimaryButton } from '@/components/ui';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { fillCopy, referCopy } from '@/lib/copy';
import { formatShortDate } from '@/lib/progress';
import {
  ensureMyReferralCode,
  fetchMyInvites,
  referralOfferVars,
  shareInvite,
  type ReferralInvite,
  type ReferralStatus,
} from '@/lib/referrals';

const STATUS_LABEL: Record<ReferralStatus, string> = {
  invited: referCopy.status.invited,
  trial: referCopy.status.trial,
  subscribed: referCopy.status.subscribed,
  rewarded: referCopy.status.rewarded,
};

/** Wrapped so its dialogs (How to cancel, Restore, errors) show on top of this full-screen layer. */
export default function ReferScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ReferScreenContent />
      <DialogHost />
    </View>
  );
}

function ReferScreenContent() {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing } = useTheme();
  const { session, isLoading: authLoading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [invites, setInvites] = useState<ReferralInvite[]>([]);
  const [sharing, setSharing] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready'>('loading');

  const reload = useCallback(async () => {
    const nextCode = await ensureMyReferralCode();
    const nextInvites = await fetchMyInvites().catch(() => []);
    setCode(nextCode);
    setInvites(nextInvites);
    setLoadState('ready');
  }, []);

  useEffect(() => {
    if (!authLoading && !session) router.replace('/sign-in' as Href);
  }, [authLoading, session]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let isCurrent = true;
      reload().catch(() => {
        if (isCurrent) setLoadState('ready');
      });
      return () => {
        isCurrent = false;
      };
    }, [reload, session])
  );

  const vars = {
    ...referralOfferVars(),
    code: code ?? '',
  };

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function showTerms() {
    showDialog(
      referCopy.how_it_works_title,
      [
        ...referCopy.how_it_works.map((step) => fillCopy(step, vars)),
        ...referCopy.terms.map((line) => fillCopy(line, vars)),
      ].join('\n\n')
    );
  }

  async function handleShare() {
    if (!code) return;
    setSharing(true);
    try {
      await shareInvite(code);
    } catch {
      showDialog('Could not share', 'You can still screenshot your code.');
    } finally {
      setSharing(false);
    }
  }

  const steps = referCopy.steps.map((step) => fillCopy(step, vars));

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={[styles.photo, { height: 260 + insets.top }]}>
          <PhotoFill slug="hero-refer" kind="people" label={referCopy.hero_title} align="center" />
        </View>

        <View style={styles.content}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {referCopy.screen_title}
          </AppText>
          <AppText variant="display" style={{ color: colours.ink, marginTop: spacing.xs }}>
            {fillCopy(referCopy.screen_headline_short, vars)}
          </AppText>

          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            {steps.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={[styles.stepNumber, { backgroundColor: colours.brand }]}>
                  <AppText variant="bodyStrong" style={{ color: colours.onBrand }}>
                    {index + 1}
                  </AppText>
                </View>
                <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                  {step}
                </AppText>
              </View>
            ))}
          </View>

          <View
            style={[
              styles.codeCard,
              { backgroundColor: colours.surface, borderRadius: radius.xl, borderColor: colours.border, marginTop: spacing.xl },
            ]}>
            <View style={styles.flex}>
              <AppText variant="caption" style={{ color: colours.inkMuted }}>
                {referCopy.code_label}
              </AppText>
              {code ? (
                <AppText variant="title2" selectable style={{ color: colours.ink, letterSpacing: 1.5, marginTop: 2 }}>
                  {code}
                </AppText>
              ) : (
                <ActivityIndicator color={colours.brand} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
              )}
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 4 }}>
                {referCopy.code_hint}
              </AppText>
            </View>
            <Pressable
              onPress={() => void handleShare()}
              disabled={!code}
              accessibilityRole="button"
              accessibilityLabel={referCopy.share}
              hitSlop={8}
              style={({ pressed }) => [
                styles.codeButton,
                { backgroundColor: colours.brandSoft, borderRadius: radius.full },
                pressed && { opacity: 0.7 },
              ]}>
              <Ionicons name="share-outline" size={20} color={colours.brand} />
            </Pressable>
          </View>

          {loadState === 'ready' && invites.length > 0 ? (
            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
              <AppText variant="title3" style={{ color: colours.ink }}>
                {referCopy.progress_title}
              </AppText>
              {invites.map((invite, index) => (
                <View
                  key={invite.id}
                  style={[
                    styles.invite,
                    { backgroundColor: colours.surface, borderRadius: radius.lg, borderColor: colours.border },
                  ]}>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                      Invite {index + 1}
                    </AppText>
                    <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
                      {formatShortDate(new Date(invite.createdAt))}
                    </AppText>
                  </View>
                  <View style={[styles.status, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
                    <AppText variant="caption" style={{ color: colours.brand }}>
                      {STATUS_LABEL[invite.status]}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="close" variant="overlay" accessibilityLabel={referCopy.close_a11y} onPress={close} />
        <IconButton icon="information-circle-outline" variant="overlay" accessibilityLabel={referCopy.info_a11y} onPress={showTerms} />
      </View>

      <View style={[styles.sticky, { backgroundColor: colours.bg, paddingBottom: insets.bottom + 12, borderTopColor: colours.border }]}>
        <PrimaryButton
          label={sharing ? 'Sharing…' : referCopy.share_link}
          onPress={() => void handleShare()}
          disabled={!code || sharing}
          loading={sharing}
        />
        <Pressable onPress={showTerms} accessibilityRole="link" style={styles.terms}>
          <AppText variant="caption" style={{ color: colours.inkMuted, textDecorationLine: 'underline' }}>
            {referCopy.terms_link}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  scroll: {
    flex: 1,
  },
  photo: {
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  codeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flex: {
    flex: 1,
  },
  sticky: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  terms: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
});
