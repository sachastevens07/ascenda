import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
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
import { AppText } from '@/components/ui';
import { colours } from '@/constants/theme';
import { paywallScreenCopy, restoreCopy } from '@/lib/copy';
import {
  PRO_FEATURES,
  defaultPackageId,
  isPaywallReason,
  paywallCopy,
} from '@/lib/paywall';
import {
  REMINDER_DAYS_BEFORE,
  STORE_NAME,
  fetchProPackages,
  getFreeTrialDays,
  hasProEntitlement,
  purchasePackage,
  restorePurchases,
  useSubscription,
} from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'unavailable' | 'ready';

function periodName(item: PurchasesPackage): string {
  return item.packageType === 'ANNUAL' ? 'year' : 'month';
}

/** "Save 37%" on the yearly plan compared with paying monthly. */
function getAnnualSaving(packages: PurchasesPackage[]): number | null {
  const annual = packages.find((item) => item.packageType === 'ANNUAL');
  const monthly = packages.find((item) => item.packageType === 'MONTHLY');
  if (!annual || !monthly || monthly.product.price <= 0) return null;
  const saving = Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100);
  return saving > 0 ? saving : null;
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reason?: string | string[] }>();
  const rawReason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const reason = isPaywallReason(rawReason) ? rawReason : 'general';
  const copy = paywallCopy(reason);
  const { isAvailable, applyCustomerInfo } = useSubscription();
  const [loadState, setLoadState] = useState<LoadState>(isAvailable ? 'loading' : 'unavailable');
  const [attempt, setAttempt] = useState(0);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  function dismiss() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

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
      showDialog(
        'That didn’t go through',
        'Check your connection and try again. If you were charged, tap Restore purchases.'
      );
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
    <View style={styles.overlay}>
      <Pressable
        style={styles.backdrop}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[styles.sheet, { marginTop: Math.max(insets.top, 36) }]}>
        <Pressable
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close">
          <Ionicons name="close" size={28} color={colours.text} />
        </Pressable>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <AppText variant="eyebrow" style={styles.eyebrow}>{copy.eyebrow}</AppText>
          <AppText variant="display" style={styles.title}>{copy.title}</AppText>
          <AppText variant="body" style={styles.body}>{copy.body}</AppText>

          <View style={styles.features}>
            {PRO_FEATURES.map((feature) => (
              <View key={feature.text} style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon} size={22} color={colours.accent} />
                </View>
                <AppText variant="body" style={styles.featureText}>{feature.text}</AppText>
              </View>
            ))}
          </View>
          {loadState === 'loading' ? (
            <ActivityIndicator color={colours.accent} style={styles.loading} />
          ) : loadState !== 'ready' ? (
            <View style={styles.notice}>
              <AppText variant="body" style={styles.noticeText}>
                {loadState === 'error'
                  ? 'We couldn’t load the plans. Check your connection and try again.'
                  : 'Subscriptions aren’t available to buy yet. Check back soon.'}
              </AppText>
              {loadState === 'error' && (
                <Pressable
                  style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                  onPress={() => setAttempt((count) => count + 1)}
                  accessibilityRole="button">
                  <AppText variant="bodyStrong" style={styles.outlineButtonText}>Try again</AppText>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <View style={styles.plans}>
                {packages.map((item) => {
                  const isSelected = item.identifier === selectedId;
                  const isAnnual = item.packageType === 'ANNUAL';
                  return (
                    <Pressable
                      key={item.identifier}
                      onPress={() => setSelectedId(item.identifier)}
                      style={[styles.plan, isSelected && styles.planSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}>
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={colours.accent}
                      />
                      <View style={styles.flex}>
                        <AppText variant="title3" style={styles.planName}>{isAnnual ? 'Yearly' : 'Monthly'}</AppText>
                        <AppText variant="body" style={styles.planPrice}>
                          {item.product.priceString} a {periodName(item)}
                        </AppText>
                        {isAnnual && item.product.pricePerMonthString && (
                          <AppText variant="bodySm" style={styles.planDetail}>
                            Works out at {item.product.pricePerMonthString} a month
                          </AppText>
                        )}
                      </View>
                      {isAnnual && (
                        <AppText variant="caption" style={styles.badge}>
                          {annualSaving !== null ? `Save ${annualSaving}%` : 'Best value'}
                        </AppText>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={({ pressed }) => [styles.button, (pressed || busy !== null) && styles.pressed]}
                onPress={handleSubscribe}
                disabled={busy !== null || !selected}
                accessibilityRole="button">
                {busy === 'buy' ? (
                  <ActivityIndicator color={colours.surface} />
                ) : (
                  <AppText variant="bodyStrong" style={styles.buttonText}>
                    {trialDays ? `Start ${trialDays}-day free trial` : 'Subscribe'}
                  </AppText>
                )}
              </Pressable>

              {selected && (
                <AppText variant="bodySm" style={styles.finePrint}>
                  {trialDays
                    ? `Free for ${trialDays} days, then ${selected.product.priceString} a ${periodName(selected)}. ` +
                      `We’ll remind you ${REMINDER_DAYS_BEFORE} days before your trial ends. ` +
                      `Cancel at least 24 hours before it ends in your ${STORE_NAME} settings.`
                    : `${selected.product.priceString} a ${periodName(selected)}, renewing automatically. ` +
                      `Cancel any time in your ${STORE_NAME} settings.`}
                </AppText>
              )}
            </>
          )}

          {isAvailable && (
            <Pressable
              style={styles.link}
              onPress={handleRestore}
              disabled={busy !== null}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={styles.linkText}>
                {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
              </AppText>
            </Pressable>
          )}
          <Pressable style={styles.link} onPress={dismiss} accessibilityRole="button">
            <AppText variant="bodyStrong" style={styles.mutedLinkText}>Not now</AppText>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    flex: 1,
    backgroundColor: colours.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  close: {
    alignSelf: 'flex-end',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  content: {
    paddingHorizontal: 24,
    gap: 16,
  },
  eyebrow: {
    color: colours.accent,
  },
  title: {
    color: colours.text,
    marginTop: -8,
  },
  body: {
    color: colours.textMuted,
    marginTop: -4,
  },
  features: {
    gap: 12,
    marginTop: 4,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  featureText: {
    flex: 1,
    color: colours.text,
  },
  freeNote: {
    color: colours.textMuted,
  },
  loading: {
    marginVertical: 32,
  },
  notice: {
    padding: 20,
    borderRadius: 18,
    gap: 16,
    backgroundColor: colours.surface,
  },
  noticeText: {
    color: colours.text,
  },
  plans: {
    gap: 12,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colours.border,
    backgroundColor: colours.surface,
  },
  planSelected: {
    borderColor: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  flex: {
    flex: 1,
  },
  planName: {
    color: colours.text,
  },
  planPrice: {
    color: colours.text,
    marginTop: 2,
  },
  planDetail: {
    color: colours.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  button: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  buttonText: {
    color: colours.surface,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  outlineButtonText: {
    color: colours.accent,
  },
  finePrint: {
    color: colours.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    color: colours.accent,
  },
  mutedLinkText: {
    color: colours.textMuted,
  },
});
