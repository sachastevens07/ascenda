import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { colours } from '@/constants/theme';
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

const PRO_FEATURES = [
  { icon: 'calendar-outline', text: 'A programme planned around your goal and your week' },
  { icon: 'today-outline', text: 'Today’s session ready when you walk in' },
  { icon: 'trending-up', text: 'Know when to lift a little heavier' },
  { icon: 'swap-horizontal', text: 'Swap any exercise for one that suits your gym' },
  { icon: 'stats-chart-outline', text: 'Charts of your lifts and weeks' },
] as const;

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
  const { isAvailable, applyCustomerInfo } = useSubscription();
  const [loadState, setLoadState] = useState<LoadState>(isAvailable ? 'loading' : 'unavailable');
  const [attempt, setAttempt] = useState(0);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  useEffect(() => {
    if (!isAvailable) return;
    let isCurrent = true;
    setLoadState('loading');
    fetchProPackages()
      .then((result) => {
        if (!isCurrent) return;
        setPackages(result);
        setSelectedId(result[0]?.identifier ?? null);
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
        router.back();
        showDialog(
          'Welcome to Pro',
          trialDays
            ? `Your free trial has started. We’ll remind you ${REMINDER_DAYS_BEFORE} days before it ends.`
            : 'Your programme, suggestions, swaps and charts are ready.'
        );
      } else {
        showDialog('Almost there', `Pro will unlock as soon as ${STORE_NAME} confirms your payment.`);
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
        router.back();
        showDialog('Pro restored', 'Welcome back. Everything is unlocked again.');
      } else {
        showDialog('No subscription found', `We couldn’t find Pro on this ${STORE_NAME} account.`);
      }
    } catch {
      showDialog('Couldn’t restore', 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close">
        <Ionicons name="close" size={28} color={colours.text} />
      </Pressable>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.eyebrow}>Women’s Strength Pro</Text>
        <Text style={styles.title}>Walk in with a plan</Text>

        <View style={styles.features}>
          {PRO_FEATURES.map((feature) => (
            <View key={feature.text} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={colours.accent} />
              </View>
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.freeNote}>
          Always free: logging your sets, your history, the exercise library, cycle notes and
          exporting your data.
        </Text>

        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} style={styles.loading} />
        ) : loadState !== 'ready' ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {loadState === 'error'
                ? 'We couldn’t load the plans. Check your connection and try again.'
                : 'Pro isn’t available to buy yet. Check back soon.'}
            </Text>
            {loadState === 'error' && (
              <Pressable
                style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                onPress={() => setAttempt((count) => count + 1)}
                accessibilityRole="button">
                <Text style={styles.outlineButtonText}>Try again</Text>
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
                      <Text style={styles.planName}>{isAnnual ? 'Yearly' : 'Monthly'}</Text>
                      <Text style={styles.planPrice}>
                        {item.product.priceString} a {periodName(item)}
                      </Text>
                      {isAnnual && item.product.pricePerMonthString && (
                        <Text style={styles.planDetail}>
                          Works out at {item.product.pricePerMonthString} a month
                        </Text>
                      )}
                    </View>
                    {isAnnual && annualSaving !== null && (
                      <Text style={styles.badge}>Save {annualSaving}%</Text>
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
                <Text style={styles.buttonText}>
                  {trialDays ? `Start ${trialDays}-day free trial` : 'Subscribe'}
                </Text>
              )}
            </Pressable>

            {selected && (
              <Text style={styles.finePrint}>
                {trialDays
                  ? `Free for ${trialDays} days, then ${selected.product.priceString} a ${periodName(selected)}. ` +
                    `We’ll remind you ${REMINDER_DAYS_BEFORE} days before your trial ends. `
                  : `${selected.product.priceString} a ${periodName(selected)}, renewing automatically. `}
                Cancel any time in your {STORE_NAME} settings.
              </Text>
            )}
          </>
        )}

        {isAvailable && (
          <Pressable
            style={styles.link}
            onPress={handleRestore}
            disabled={busy !== null}
            accessibilityRole="button">
            <Text style={styles.linkText}>
              {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.link} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.mutedLinkText}>Not now</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
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
    fontSize: 15,
    fontWeight: '700',
    color: colours.accent,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
    marginTop: -8,
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
    fontSize: 17,
    lineHeight: 23,
    color: colours.text,
  },
  freeNote: {
    fontSize: 15,
    lineHeight: 21,
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
    fontSize: 16,
    lineHeight: 22,
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
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
  },
  planPrice: {
    fontSize: 16,
    color: colours.text,
    marginTop: 2,
  },
  planDetail: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '700',
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
    fontSize: 18,
    fontWeight: '700',
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
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  finePrint: {
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  mutedLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.textMuted,
  },
});
