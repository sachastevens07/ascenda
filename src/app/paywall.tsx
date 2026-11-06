import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, HeroImage, IconButton, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fillCopy, paywallScreenCopy, restoreCopy } from '@/lib/copy';
import { imageSourceForSlug } from '@/lib/images';
import { draftFromSaved, emptyOnboardingDraft } from '@/lib/onboardingAnswers';
import { recommendPlan } from '@/lib/onboardingPlan';
import { PRO_FEATURES, defaultPackageId } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import { fetchActiveEnrolment } from '@/lib/routines';
import {
  STORE_NAME,
  fetchProPackages,
  getFreeTrialDays,
  hasProEntitlement,
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
  return formatShortDate(date);
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const { isAvailable, applyCustomerInfo } = useSubscription();
  const [loadState, setLoadState] = useState<LoadState>(isAvailable ? 'loading' : 'unavailable');
  const [attempt, setAttempt] = useState(0);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);

  function dismiss() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  useEffect(() => {
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
  }, [answers, profile?.age_band, profile?.bodyweight_kg, profile?.cardio_preference, profile?.onboarding_answers]);

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
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [isAvailable, attempt]);

  const selected = packages.find((item) => item.identifier === selectedId) ?? null;
  const trialDays = selected ? getFreeTrialDays(selected.product) : null;
  const annualSaving = getAnnualSaving(packages);
  const headline = routineName
    ? fillCopy(paywallScreenCopy.headline_with_plan, { routine_name: routineName })
    : paywallScreenCopy.headline_fallback;
  const showTrialCta = Boolean(trialDays && selected?.packageType === 'ANNUAL');

  async function handleSubscribe() {
    if (!selected) return;
    setBusy('buy');
    try {
      const info = await purchasePackage(selected);
      if (!info) return;
      applyCustomerInfo(info);
      if (hasProEntitlement(info)) {
        dismiss();
        showDialog(paywallScreenCopy.success_title, paywallScreenCopy.success_body);
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

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <IconButton
        icon="close"
        accessibilityLabel={paywallScreenCopy.close_a11y}
        onPress={dismiss}
        variant="muted"
        style={[styles.close, { top: Math.max(insets.top, 8) }]}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        showsVerticalScrollIndicator={false}>
        <HeroImage
          image={imageSourceForSlug('hero-paywall') ?? imageSourceForSlug('cover-barbell-strength-8')}
          height={240}
        />
        <View style={[styles.body, { paddingHorizontal: spacing.lg, gap: spacing.md }]}>
          <AppText variant="display" style={{ color: colours.ink }}>
            {headline}
          </AppText>
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {paywallScreenCopy.subheadline}
          </AppText>

          <View
            style={[
              styles.benefits,
              { backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.md },
              shadow,
            ]}>
            {PRO_FEATURES.map((feature) => (
              <View key={feature.text} style={styles.benefit}>
                <View style={[styles.benefitIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
                  <Ionicons name={feature.icon} size={20} color={colours.brand} />
                </View>
                <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                  {feature.text}
                </AppText>
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
              <View style={styles.plans}>
                {packages.map((item) => {
                  const isSelected = item.identifier === selectedId;
                  const isAnnual = item.packageType === 'ANNUAL';
                  const itemTrial = getFreeTrialDays(item.product);
                  return (
                    <Pressable
                      key={item.identifier}
                      onPress={() => setSelectedId(item.identifier)}
                      style={[
                        styles.plan,
                        {
                          borderRadius: radius.xl,
                          borderColor: isSelected ? colours.brand : colours.border,
                          backgroundColor: isSelected ? colours.brandSoft : colours.surface,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}>
                      <View style={styles.planHeader}>
                        <AppText variant="title3" style={{ color: colours.ink }}>
                          {isAnnual ? paywallScreenCopy.annual_title : paywallScreenCopy.monthly_title}
                        </AppText>
                        {isAnnual && annualSaving !== null ? (
                          <AppText
                            variant="caption"
                            style={[
                              styles.tag,
                              { backgroundColor: colours.pro, color: colours.onPro, borderRadius: radius.full },
                            ]}>
                            {paywallScreenCopy.annual_tag}
                          </AppText>
                        ) : null}
                      </View>
                      <AppText variant="body" style={{ color: colours.ink, marginTop: 4 }}>
                        {isAnnual
                          ? itemTrial
                            ? fillCopy(paywallScreenCopy.annual_trial_line, {
                                trial_days: itemTrial,
                                annual_price: item.product.priceString,
                              })
                            : `${item.product.priceString} a year`
                          : fillCopy(paywallScreenCopy.monthly_line, {
                              monthly_price: item.product.priceString,
                            })}
                      </AppText>
                      {isAnnual && item.product.pricePerMonthString ? (
                        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                          {fillCopy(paywallScreenCopy.annual_monthly_equiv, {
                            annual_per_month: item.product.pricePerMonthString,
                          })}
                        </AppText>
                      ) : null}
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
              <TextButton
                label={busy === 'restore' ? 'Restoring…' : paywallScreenCopy.restore}
                onPress={() => void handleRestore()}
                disabled={busy !== null}
              />
            ) : null}
            <TextButton label={paywallScreenCopy.terms} onPress={() => router.push('/terms' as Href)} />
            <TextButton label={paywallScreenCopy.privacy} onPress={() => router.push('/privacy' as Href)} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  close: {
    position: 'absolute',
    left: 8,
    zIndex: 2,
  },
  body: {
    paddingTop: 20,
  },
  benefits: {
    gap: 12,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    width: 36,
    height: 36,
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
    gap: 12,
  },
  plan: {
    minHeight: 88,
    padding: 16,
    borderWidth: 1.5,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tag: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
});
