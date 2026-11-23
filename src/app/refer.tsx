import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, ListRow, PhotoFill, PrimaryButton } from '@/components/ui';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { fillCopy, referCopy } from '@/lib/copy';
import { formatShortDate } from '@/lib/progress';
import {
  ensureMyReferralCode,
  fetchMyInvites,
  inviteLinkForCode,
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

export default function ReferScreen() {
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

  async function handleCopyLink() {
    if (!code) return;
    try {
      await Share.share({ message: inviteLinkForCode(code), title: referCopy.copy_row });
    } catch {
      showDialog(referCopy.code_label, code);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="close" accessibilityLabel={referCopy.close_a11y} onPress={close} />
        <AppText variant="title3" style={{ color: colours.accent, flex: 1, textAlign: 'center' }}>
          {referCopy.screen_title}
        </AppText>
        <IconButton icon="information-circle-outline" accessibilityLabel={referCopy.info_a11y} onPress={showTerms} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.photo}>
          <PhotoFill slug="hero-refer" kind="people" label={referCopy.hero_title} />
        </View>

        <View style={styles.content}>
          <AppText variant="display" style={{ color: colours.accent }}>
            {fillCopy(referCopy.screen_headline, vars)}
          </AppText>
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
            {fillCopy(referCopy.screen_body, vars)}
          </AppText>

          {loadState === 'loading' ? (
            <ActivityIndicator color={colours.brand} style={{ marginTop: spacing.xl }} />
          ) : invites.length === 0 ? (
            <View
              style={[
                styles.empty,
                { backgroundColor: colours.surfaceMuted, borderRadius: radius.full, marginTop: spacing.xl },
              ]}>
              <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
                {referCopy.empty_invites}
              </AppText>
            </View>
          ) : (
            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
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
                  <AppText variant="bodySm" style={{ color: colours.brand }}>
                    {STATUS_LABEL[invite.status]}
                  </AppText>
                </View>
              ))}
            </View>
          )}

          <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.xl }}>
            {referCopy.invite_via}
          </AppText>
          <View
            style={[
              styles.methods,
              { borderColor: colours.border, borderRadius: radius.lg, marginTop: spacing.sm },
            ]}>
            <ListRow
              title={referCopy.share_row}
              left={<Ionicons name="share-outline" size={22} color={colours.brand} style={styles.methodIcon} />}
              onPress={() => void handleShare()}
            />
            <ListRow
              title={referCopy.copy_row}
              left={<Ionicons name="link-outline" size={22} color={colours.brand} style={styles.methodIcon} />}
              onPress={() => void handleCopyLink()}
              style={styles.methodLast}
            />
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.sticky,
          { backgroundColor: colours.bg, paddingBottom: insets.bottom + 12, borderTopColor: colours.border },
        ]}>
        <PrimaryButton
          label={sharing ? 'Sharing…' : referCopy.share_link}
          onPress={() => void handleShare()}
          disabled={!code || sharing}
          loading={sharing}
        />
        <Pressable onPress={showTerms} accessibilityRole="button" style={styles.terms}>
          <Ionicons name="information-circle-outline" size={16} color={colours.inkMuted} />
          <AppText variant="caption" style={{ color: colours.inkMuted, flex: 1 }}>
            {referCopy.terms_footer}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: 52,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  empty: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: {
    flex: 1,
  },
  photo: {
    height: 220,
    overflow: 'hidden',
  },
  methods: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  methodIcon: {
    marginRight: 12,
  },
  methodLast: {
    borderBottomWidth: 0,
  },
  sticky: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  terms: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
});
