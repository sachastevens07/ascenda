import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { AppText, DetailLayout, ListRow, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { fillCopy, referCopy } from '@/lib/copy';
import { imageSourceForSlug } from '@/lib/images';
import { formatShortDate } from '@/lib/progress';
import {
  FRIEND_TRIAL_DAYS,
  MAX_REWARDS_PER_YEAR,
  ensureMyReferralCode,
  fetchMyInvites,
  shareInvite,
  shareReferralCode,
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
  const { colours, radius, spacing } = useTheme();
  const { session, isLoading: authLoading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [invites, setInvites] = useState<ReferralInvite[]>([]);
  const [copied, setCopied] = useState(false);
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

  async function handleCopy() {
    if (!code) return;
    try {
      await shareReferralCode(code);
      setCopied(true);
    } catch {
      showDialog(referCopy.code_label, code);
    }
  }

  const vars = {
    friend_trial_days: FRIEND_TRIAL_DAYS,
    max_rewards: MAX_REWARDS_PER_YEAR,
    code: code ?? '',
  };

  return (
    <DetailLayout
      cover={imageSourceForSlug('hero-refer') ?? imageSourceForSlug('hero-home')}
      letter="R"
      title={referCopy.hero_title}
      eyebrow={referCopy.screen_title}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      sticky={
        <PrimaryButton
          label={sharing ? 'Sharing…' : referCopy.share_link}
          onPress={() => void handleShare()}
          disabled={!code || sharing}
          loading={sharing}
        />
      }>
      <AppText variant="body" style={{ color: colours.ink }}>
        {fillCopy(referCopy.screen_body, vars)}
      </AppText>

      <View
        style={[
          styles.chip,
          { backgroundColor: colours.surfaceMuted, borderRadius: radius.xl, marginTop: spacing.lg },
        ]}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {referCopy.code_label}
        </AppText>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} style={{ marginTop: spacing.sm }} />
        ) : (
          <AppText variant="displaySm" style={{ color: colours.ink, marginTop: spacing.sm }}>
            {code ?? '------'}
          </AppText>
        )}
        <TextButton
          label={copied ? referCopy.copied : referCopy.copy}
          onPress={() => void handleCopy()}
          disabled={!code}
          style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
        />
      </View>

      <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.lg }}>
        {referCopy.how_it_works_title}
      </AppText>
      {referCopy.how_it_works.map((step, index) => (
        <AppText
          key={step}
          variant="body"
          style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
          {`${index + 1}. ${fillCopy(step, vars)}`}
        </AppText>
      ))}

      <Pressable
        onPress={() =>
          showDialog(
            referCopy.terms_link,
            referCopy.terms.map((line) => fillCopy(line, vars)).join('\n\n')
          )
        }
        accessibilityRole="button"
        style={{ marginTop: spacing.md }}>
        <AppText variant="bodyStrong" style={{ color: colours.brand }}>
          {referCopy.terms_link}
        </AppText>
      </Pressable>

      <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.lg }}>
        {referCopy.progress_title}
      </AppText>
      {invites.length === 0 ? (
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
          {referCopy.empty_invites}
        </AppText>
      ) : (
        <View style={{ marginTop: spacing.sm }}>
          {invites.map((invite, index) => (
            <ListRow
              key={invite.id}
              title={`Invite ${index + 1}`}
              subtitle={STATUS_LABEL[invite.status]}
              eyebrow={formatShortDate(new Date(invite.createdAt))}
              showChevron={false}
            />
          ))}
        </View>
      )}
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  chip: {
    padding: 20,
  },
});
