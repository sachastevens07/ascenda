import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, HeroImage, IconButton, PrimaryButton } from '@/components/ui';
import { fonts } from '@/constants/fonts';
import { useTheme } from '@/constants/theme';
import { fillCopy, paywallScreenCopy, purchaseWelcomeCopy, referCopy, restoreCopy, subscriptionStatusCopy } from '@/lib/copy';
import { draftFromSaved, emptyOnboardingDraft } from '@/lib/onboardingAnswers';
import { recommendPlan } from '@/lib/onboardingPlan';
import { successTap } from '@/lib/haptics';
import { defaultPackageId } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatBillingDate } from '@/lib/progress';
import { fetchActiveEnrolment } from '@/lib/routines';
import {
  APPLE_OFFER_CODE,
  FRIEND_TRIAL_DAYS,
  hasReferralOffer,
  redeemFriendOffer,
} from '@/lib/referrals';
import {
  STORE_NAME,
  fetchCustomerInfo,
  fetchProPackages,
  fetchIneligibleTrialProducts,
  getFreeTrialDays,
  hasProEntitlement,
  openManageSubscription,
  proEntitlementSummary,
  purchasePackage,
  restorePurchases,
  useSubscription,
} from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'unavailable' | 'ready';

function getAnnualSaving(packages: PurchasesPackage[]): number | null {
  const annual = packages.find((item) => item.packageType === 'ANNUAL');
  const monthly = packages.find((item) => item.packageType === 'MONTHLY');
  if (!annual || !monthly || monthly.product.price <= 0) return null;
  const saving = Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100);
  return saving > 0 ? saving : null;
}

function chargeDateLabel(trialDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + trialDays);
  return formatBillingDate(date);
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const { isAvailable, applyCustomerInfo, managementUrl } = useSubscription();
  const [loadState, setLoadState] = useState<LoadState>(isAvailable ? 'loading' : 'unavailable');
  const [attempt, setAttempt] = useState(0);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);
  const [referred, setReferred] = useState(false);
  const [scrolledPastPhoto, setScrolledPastPhoto] = useState(false);
  const [welcome, setWelcome] = useState<WelcomeInfo | null>(null);
  /** Products whose free trial this Apple ID has already used. */
  const [noTrial, setNoTrial] = useState<Set<string>>(() => new Set());
  // From onboarding: her plan, first name and what she told us she worries about.
  const params = useLocalSearchParams<{ plan?: string; name?: string; focus?: string }>();
  const paramPlan = typeof params.plan === 'string' ? params.plan.trim() : '';
  const firstName = typeof params.name === 'string' ? params.name.trim() : '';
  const focus = typeof params.focus === 'string' ? params.focus.split(',').filter(Boolean) : [];
  const benefitRows = pickBenefits(focus);

  function dismiss() {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const onboarded =
      getQuizAnswers(profile) !== null && Boolean(profile?.age_confirmed_at);
    router.replace((onboarded ? '/' : '/onboarding') as Href);
  }

  const closeTop = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 12) : 54,
    12
  );

  useEffect(() => {
    if (paramPlan) {
      setRoutineName(paramPlan);
      return;
    }
    let isCurrent = true;
    const draft = answers
      ? draftFromSaved({
          answers,
          extras: profile?.onboarding_answers,
          age_band: profile?.age_band,
          cardio_preference: profile?.cardio_preference,
          bodyweight_kg: profile?.bodyweight_kg,
        })
      : emptyOnboardingDraft();
    fetchActiveEnrolment()
      .then((enrolment) => {
        if (!isCurrent) return;
        if (enrolment?.routine.name) {
          setRoutineName(enrolment.routine.name);
          return;
        }
        const plan = recommendPlan(draft, undefined);
        setRoutineName(plan?.recommended.name ?? null);
      })
      .catch(() => {
        if (!isCurrent) return;
        setRoutineName(recommendPlan(draft)?.recommended.name ?? null);
      });
    return () => {
      isCurrent = false;
    };
  }, [paramPlan, answers, profile?.age_band, profile?.bodyweight_kg, profile?.cardio_preference, profile?.onboarding_answers]);

  useEffect(() => {
    let isCurrent = true;
    hasReferralOffer()
      .then((value) => {
        if (isCurrent) setReferred(value);
      })
      .catch(() => {
        if (isCurrent) setReferred(false);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isAvailable) return;
    let isCurrent = true;
    setLoadState('loading');
    fetchProPackages()
      .then((result) => {
        if (!isCurrent) return;
        setPackages(result);
        setSelectedId(defaultPackageId(result));
        setLoadState(result.length > 0 ? 'ready' : 'unavailable');
        void fetchIneligibleTrialProducts(result.map((item) => item.product.identifier)).then((ids) => {
          if (isCurrent) setNoTrial(ids);
        });
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [isAvailable, attempt]);

  const selected = packages.find((item) => item.identifier === selectedId) ?? null;
  /** The store's trial length, unless this Apple ID has already had the trial. */
  const trialDaysFor = (product: PurchasesPackage['product']) =>
    noTrial.has(product.identifier) ? null : getFreeTrialDays(product);
  const showFriendTrial = referred && Platform.OS === 'ios';
  const trialDays = selected
    ? showFriendTrial && selected.packageType === 'ANNUAL'
      ? FRIEND_TRIAL_DAYS
      : trialDaysFor(selected.product)
    : null;
  const annualSaving = getAnnualSaving(packages);
  const showTrialCta = Boolean(trialDays && selected?.packageType === 'ANNUAL');

  async function handleSubscribe() {
    if (!selected) return;
    setBusy('buy');
    try {
      if (showFriendTrial && selected.packageType === 'ANNUAL') {
        const result = await redeemFriendOffer();
        if (result === 'opened') {
          const info = await fetchCustomerInfo();
          if (info) applyCustomerInfo(info);
          if (info && hasProEntitlement(info)) showWelcome(info, FRIEND_TRIAL_DAYS);
          return;
        }
        if (result === 'unavailable') {
          showDialog(
            fillCopy(referCopy.redeem_title, { friend_trial_days: FRIEND_TRIAL_DAYS }),
            fillCopy(referCopy.redeem_unavailable, { apple_offer_code: APPLE_OFFER_CODE })
          );
          return;
        }
      }
      const info = await purchasePackage(selected);
      if (!info) return;
      applyCustomerInfo(info);
      if (hasProEntitlement(info)) {
        showWelcome(info, trialDays);
      } else {
        showDialog(
          'Almost there',
          `Your subscription will unlock as soon as ${STORE_NAME} confirms your payment.`
        );
      }
    } catch {
      showDialog('Please try again', paywallScreenCopy.error);
    } finally {
      setBusy(null);
    }
  }

  /** Swap the paywall for a welcome with her billing dates, what's included and how to cancel. */
  function showWelcome(info: CustomerInfo, trialLength: number | null) {
    const summary = proEntitlementSummary(info);
    const isAnnual = selected?.packageType !== 'MONTHLY';
    const days = summary.isTrial ? (trialLength ?? 7) : null;
    const fallbackEnd = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    successTap();
    setWelcome({
      isTrial: summary.isTrial,
      trialDays: days,
      endsAt: summary.expiresAt ?? fallbackEnd,
      price: selected?.product.priceString ?? '',
      isAnnual,
    });
  }

  async function handleRestore() {
    setBusy('restore');
    try {
      const info = await restorePurchases();
      applyCustomerInfo(info);
      if (hasProEntitlement(info)) {
        dismiss();
        showDialog(restoreCopy.restore, restoreCopy.success);
      } else {
        showDialog(restoreCopy.restore, restoreCopy.none);
      }
    } catch {
      showDialog(restoreCopy.restore, restoreCopy.error);
    } finally {
      setBusy(null);
    }
  }

  if (welcome) {
    const onboarded = getQuizAnswers(profile) !== null && Boolean(profile?.onboarding_completed_at);
    return (
      <PurchaseWelcome
        info={welcome}
        name={firstName}
        routineName={routineName ?? (paramPlan || null)}
        ctaLabel={onboarded ? purchaseWelcomeCopy.cta : purchaseWelcomeCopy.cta_onboarding}
        onDone={dismiss}
      />
    );
  }

  const heroHeight = Math.round(Math.min(Math.max(windowHeight * 0.58, 380), 560));
  const eyebrow = routineName
    ? fillCopy(paywallScreenCopy.eyebrow_with_plan, { routine_name: routineName })
    : paywallScreenCopy.eyebrow_fallback;
  const ordered = [...packages].sort(
    (a, b) => (a.packageType === 'ANNUAL' ? 0 : 1) - (b.packageType === 'ANNUAL' ? 0 : 1)
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={32}
        onScroll={(event) => setScrolledPastPhoto(event.nativeEvent.contentOffset.y > heroHeight * 0.55)}>
        {/* Full-bleed photo that fades into the page, with the headline sitting on the fade. */}
        <View style={{ height: heroHeight }}>
          <HeroImage imageSlug="hero-paywall" height={heroHeight} imageFocus="top" style={StyleSheet.absoluteFill} />
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id="paywallFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colours.bg} stopOpacity={0} />
                <Stop offset="0.38" stopColor={colours.bg} stopOpacity={0} />
                <Stop offset="0.62" stopColor={colours.bg} stopOpacity={0.82} />
                <Stop offset="0.74" stopColor={colours.bg} stopOpacity={0.96} />
                <Stop offset="1" stopColor={colours.bg} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#paywallFade)" />
          </Svg>
          <View style={[styles.headline, { paddingHorizontal: spacing.lg }]}>
            <AppText variant="eyebrow" style={{ color: colours.brand }} numberOfLines={2}>
              {eyebrow}
            </AppText>
            <AppText style={[styles.headlineLead, { color: colours.ink, fontFamily: fonts.bold }]}>
              {firstName
                ? fillCopy(paywallScreenCopy.headline_personal_lead, { name: firstName })
                : paywallScreenCopy.headline_lead}
            </AppText>
            <AppText style={[styles.headlineAccent, { color: colours.brand, fontFamily: fonts.displayItalic }]}>
              {firstName ? paywallScreenCopy.headline_personal_accent : paywallScreenCopy.headline_accent}
            </AppText>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, paddingTop: spacing.md }}>
          <View style={styles.benefits}>
            {benefitRows.map((row) => (
              <View key={row.title} style={styles.benefit}>
                <View style={[styles.benefitIcon, { backgroundColor: colours.brandSoft }]}>
                  <Ionicons name={row.icon as BenefitIconName} size={20} color={colours.brand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="eyebrow" style={{ color: colours.accent }}>
                    {row.title}
                  </AppText>
                  <AppText variant="body" style={{ color: colours.ink }}>
                    {row.body}
                  </AppText>
                </View>
              </View>
            ))}
          </View>

          {loadState === 'loading' ? (
            <ActivityIndicator color={colours.brand} style={styles.loading} />
          ) : loadState !== 'ready' ? (
            <View style={[styles.notice, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
              <AppText variant="body" style={{ color: colours.ink }}>
                {loadState === 'error'
                  ? 'We couldn’t load the plans. Check your connection and try again.'
                  : 'Subscriptions aren’t available to buy yet. Check back soon.'}
              </AppText>
              {loadState === 'error' ? (
                <PrimaryButton label="Try again" onPress={() => setAttempt((count) => count + 1)} />
              ) : null}
            </View>
          ) : (
            <>
              {showTrialCta && trialDays ? <TrialTimeline trialDays={trialDays} /> : null}
              <View style={styles.plans}>
                {ordered.map((item) => {
                  const isSelected = item.identifier === selectedId;
                  const isAnnual = item.packageType === 'ANNUAL';
                  const itemTrial =
                    showFriendTrial && isAnnual ? FRIEND_TRIAL_DAYS : trialDaysFor(item.product);
                  const ink = isSelected ? colours.onBrand : colours.ink;
                  const muted = isSelected ? colours.onBrand : colours.inkMuted;
                  const perMonth = isAnnual ? item.product.pricePerMonthString : item.product.priceString;
                  return (
                    <Pressable
                      key={item.identifier}
                      onPress={() => setSelectedId(item.identifier)}
                      style={({ pressed }) => [
                        styles.plan,
                        {
                          borderRadius: radius.xl,
                          borderColor: isSelected ? colours.brand : colours.border,
                          backgroundColor: isSelected ? colours.brand : colours.surface,
                        },
                        isSelected ? shadow : null,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}>
                      {isAnnual && annualSaving !== null ? (
                        <View style={[styles.saveTag, { backgroundColor: colours.accent, borderRadius: radius.full }]}>
                          <AppText variant="caption" style={{ color: colours.onAccent, fontFamily: fonts.bold }}>
                            {fillCopy(paywallScreenCopy.save_tag, { percent: annualSaving })}
                          </AppText>
                        </View>
                      ) : null}
                      <View style={styles.planRow}>
                        <AppText variant="title3" style={{ color: ink, flex: 1 }}>
                          {isAnnual ? paywallScreenCopy.annual_title : paywallScreenCopy.monthly_title}
                        </AppText>
                        {perMonth ? (
                          <AppText variant="title3" style={{ color: ink }}>
                            {fillCopy(paywallScreenCopy.per_month, { price: perMonth })}
                          </AppText>
                        ) : null}
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={isSelected ? colours.onBrand : colours.border}
                        />
                      </View>
                      <AppText variant="bodySm" style={{ color: muted, marginTop: 4 }}>
                        {isAnnual
                          ? fillCopy(paywallScreenCopy.annual_billed, { annual_price: item.product.priceString })
                          : paywallScreenCopy.monthly_billed}
                        {isAnnual && itemTrial
                          ? ` · ${fillCopy(paywallScreenCopy.trial_line_short, { trial_days: itemTrial })}`
                          : ''}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <PrimaryButton
                label={
                  busy === 'buy'
                    ? paywallScreenCopy.purchasing
                    : showTrialCta
                      ? paywallScreenCopy.cta_trial
                      : paywallScreenCopy.cta_subscribe
                }
                onPress={() => void handleSubscribe()}
                disabled={busy !== null || !selected}
                loading={busy === 'buy'}
                style={styles.cta}
              />

              {selected ? (
                <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center' }}>
                  {trialDays && selected.packageType === 'ANNUAL'
                    ? fillCopy(paywallScreenCopy.small_print_trial, {
                        trial_days: trialDays,
                        annual_price: selected.product.priceString,
                        charge_date: chargeDateLabel(trialDays),
                      })
                    : fillCopy(paywallScreenCopy.small_print_monthly, {
                        monthly_price: selected.product.priceString,
                      })}
                </AppText>
              ) : null}
            </>
          )}

          <View style={styles.footer}>
            {isAvailable ? (
              <FooterLink
                label={busy === 'restore' ? 'Restoring…' : paywallScreenCopy.restore}
                onPress={() => void handleRestore()}
                disabled={busy !== null}
              />
            ) : null}
            <FooterLink label={paywallScreenCopy.terms} onPress={() => router.push('/terms' as Href)} />
            <FooterLink label={paywallScreenCopy.privacy} onPress={() => router.push('/privacy' as Href)} />
            <FooterLink
              label={subscriptionStatusCopy.how_to_cancel_title}
              onPress={() =>
                showDialog(subscriptionStatusCopy.how_to_cancel_title, subscriptionStatusCopy.how_to_cancel_body, [
                  {
                    text: subscriptionStatusCopy.manage,
                    onPress: () =>
                      openManageSubscription(managementUrl).catch(() =>
                        showDialog(
                          'Couldn’t open your subscription',
                          `Open ${STORE_NAME} and go to Subscriptions.`
                        )
                      ),
                  },
                  { text: 'Close', style: 'cancel' },
                ])
              }
            />
          </View>
        </View>
      </ScrollView>
      {scrolledPastPhoto ? (
        <View pointerEvents="none" style={[styles.statusStrip, { height: insets.top, backgroundColor: colours.bg }]} />
      ) : null}
      <View
        pointerEvents="box-none"
        collapsable={false}
        style={[styles.closeLayer, { paddingTop: closeTop }]}>
        <IconButton
          icon="close"
          accessibilityLabel={paywallScreenCopy.close_a11y}
          onPress={dismiss}
          variant="overlay"
          style={styles.close}
        />
      </View>
    </View>
  );
}

type BenefitIconName = ComponentProps<typeof Ionicons>['name'];

/** Four benefit rows: the ones that answer her worries first, then the defaults. */
function pickBenefits(focus: string[]): { icon: string; title: string; body: string }[] {
  const pool = paywallScreenCopy.benefit_pool ?? {};
  const keys = [...focus, 'plan', ...paywallScreenCopy.benefit_default_order];
  const seen = new Set<string>();
  const rows: { icon: string; title: string; body: string }[] = [];
  for (const key of keys) {
    if (seen.has(key) || !pool[key]) continue;
    seen.add(key);
    rows.push(pool[key]);
    if (rows.length === 4) break;
  }
  return rows.length > 0 ? rows : paywallScreenCopy.benefit_rows;
}

/** Honest trial timeline: today, the reminder, the day billing starts. */
function TrialTimeline({ trialDays }: { trialDays: number }) {
  const { colours, radius } = useTheme();
  const reminderDay = Math.max(1, trialDays - 2);
  const steps: { icon: BenefitIconName; title: string; body: string; strong?: boolean }[] = [
    { icon: 'lock-open', title: paywallScreenCopy.timeline_today_title, body: paywallScreenCopy.timeline_today_body, strong: true },
    {
      icon: 'notifications',
      title: fillCopy(paywallScreenCopy.timeline_reminder_title, { reminder_day: reminderDay }),
      body: paywallScreenCopy.timeline_reminder_body,
    },
    {
      icon: 'star',
      title: fillCopy(paywallScreenCopy.timeline_charge_title, { trial_days: trialDays }),
      body: fillCopy(paywallScreenCopy.timeline_charge_body, { charge_date: chargeDateLabel(trialDays) }),
    },
  ];
  return (
    <View style={{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: 16 }}>
      <AppText variant="title3" style={{ color: colours.ink, marginBottom: 12 }}>
        {paywallScreenCopy.timeline_title}
      </AppText>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <View key={step.title} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 32 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: step.strong ? colours.brand : colours.brandSoft,
                }}>
                <Ionicons name={step.icon} size={16} color={step.strong ? colours.onBrand : colours.brand} />
              </View>
              {!last ? <View style={{ width: 2, flex: 1, backgroundColor: colours.brandSoft, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {step.title}
              </AppText>
              <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                {step.body}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

type WelcomeInfo = {
  isTrial: boolean;
  trialDays: number | null;
  /** Trial end (first charge) or next renewal. */
  endsAt: Date | null;
  price: string;
  isAnnual: boolean;
};

/** After she subscribes: a warm welcome, her billing dates, what's included and how to cancel. */
function PurchaseWelcome({
  info,
  name,
  routineName,
  ctaLabel,
  onDone,
}: {
  info: WelcomeInfo;
  name: string;
  routineName: string | null;
  ctaLabel: string;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing } = useTheme();
  const copy = purchaseWelcomeCopy;
  const end = info.endsAt;
  const reminder = end ? new Date(end.getTime() - 2 * 24 * 60 * 60 * 1000) : null;
  const billingRows: { icon: ComponentProps<typeof Ionicons>['name']; title: string; body: string }[] = info.isTrial
    ? [
        { icon: 'sparkles', title: copy.trial_today, body: copy.trial_today_body },
        ...(reminder
          ? [{ icon: 'notifications-outline' as const, title: formatBillingDate(reminder), body: copy.trial_reminder_body }]
          : []),
        ...(end
          ? [
              {
                icon: 'card-outline' as const,
                title: formatBillingDate(end),
                body: fillCopy(copy.trial_charge_body, { price: info.price }),
              },
            ]
          : []),
      ]
    : end
      ? [
          {
            icon: 'refresh-outline',
            title: fillCopy(copy.renews, { date: formatBillingDate(end) }),
            body: fillCopy(info.isAnnual ? copy.renews_body_annual : copy.renews_body_monthly, { price: info.price }),
          },
        ]
      : [];

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 28,
          paddingHorizontal: spacing.lg,
          paddingBottom: 24,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colours.success,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="checkmark" size={40} color="#FFFFFF" />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={{ alignItems: 'center', gap: 6 }}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {copy.eyebrow}
          </AppText>
          <AppText style={[styles.headlineLead, { color: colours.ink, fontFamily: fonts.bold, textAlign: 'center' }]}>
            {name ? fillCopy(copy.title_named, { name }) : copy.title}
          </AppText>
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {info.isTrial
              ? fillCopy(copy.body_trial, { trial_days: info.trialDays ?? 7 })
              : fillCopy(copy.body_paid, { plan_length: info.isAnnual ? copy.plan_annual : copy.plan_monthly })}
          </AppText>
        </Animated.View>

        {billingRows.length > 0 ? (
          <Animated.View
            entering={FadeInDown.delay(300).duration(400)}
            style={{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: 16, gap: 12 }}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {copy.billing_title}
            </AppText>
            {billingRows.map((row) => (
              <WelcomeRow key={row.title + row.body} icon={row.icon} title={row.title} body={row.body} />
            ))}
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(450).duration(400)} style={{ gap: 12 }}>
          <AppText variant="title3" style={{ color: colours.ink }}>
            {copy.included_title}
          </AppText>
          {copy.included.map((row) => (
            <WelcomeRow
              key={row.title}
              icon={row.icon as ComponentProps<typeof Ionicons>['name']}
              title={row.title}
              body={
                'body_with_plan' in row && row.body_with_plan && routineName
                  ? fillCopy(row.body_with_plan, { routine_name: routineName })
                  : row.body
              }
            />
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(600).duration(400)}
          style={{ backgroundColor: colours.brandSoft, borderRadius: radius.lg, padding: 14, gap: 4 }}>
          <AppText variant="bodyStrong" style={{ color: colours.ink }}>
            {copy.cancel_title}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {copy.cancel_body}
          </AppText>
        </Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: Math.max(insets.bottom, 16) + 8, paddingTop: 8 }}>
        <PrimaryButton label={ctaLabel} onPress={onDone} />
      </View>
    </View>
  );
}

function WelcomeRow({
  icon,
  title,
  body,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}) {
  const { colours } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colours.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={icon} size={18} color={colours.brand} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" style={{ color: colours.ink }}>
          {title}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {body}
        </AppText>
      </View>
    </View>
  );
}

/** Small underlined links under the paywall, like the store apps. */
function FooterLink({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      hitSlop={8}
      style={({ pressed }) => [styles.footerLink, (pressed || disabled) && styles.pressed]}>
      <AppText variant="bodySm" style={{ color: colours.inkMuted, textDecorationLine: 'underline' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  statusStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
  },
  close: {
    marginLeft: 12,
    alignSelf: 'flex-start',
  },
  headline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 2,
  },
  headlineLead: {
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  headlineAccent: {
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  benefits: {
    gap: 16,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    marginVertical: 32,
  },
  notice: {
    padding: 20,
    gap: 16,
  },
  plans: {
    gap: 14,
    paddingTop: 8,
  },
  plan: {
    minHeight: 84,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 2,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  saveTag: {
    position: 'absolute',
    top: -12,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.85,
  },
  cta: {
    minHeight: 58,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 20,
    rowGap: 10,
    paddingTop: 4,
  },
  footerLink: {
    paddingVertical: 4,
  },
});
