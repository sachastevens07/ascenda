/**
 * B2 check-in copy and rules. Bundled from content/checkin/checkin.json.
 * The option she picked stays in component memory only. Never persist, log or send it.
 */
import file from '../../content/checkin/checkin.json';

type Json = Record<string, unknown>;

export type CheckinOption = {
  id: string;
  label: string;
  offers_lighter: boolean;
};

export type CheckinCopy = {
  title: string;
  helper: string;
  skip: string;
  options: CheckinOption[];
  offerTitle: string;
  offerBody: string;
  offerAccept: string;
  offerDecline: string;
  shortTimeBody: string;
  shortTimeOptionId: string;
  loggerBadge: string;
};

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const root = asRecord(file);
const card = asRecord(root.card);
const offer = asRecord(root.lighter_offer);

const options: CheckinOption[] = asArray(root.options).flatMap((item) => {
  const row = asRecord(item);
  const id = text(row.id);
  const label = text(row.label);
  if (!id || !label) return [];
  return [{ id, label, offers_lighter: row.offers_lighter === true }];
});

const shortTime =
  options.find((item) => item.id === 'short_time') ??
  options.find((item) => item.offers_lighter && text(offer.short_time_body).length > 0);

export const CHECKIN: CheckinCopy = {
  title: text(card.title),
  helper: text(card.helper),
  skip: text(card.skip),
  options,
  offerTitle: text(offer.title),
  offerBody: text(offer.body),
  offerAccept: text(offer.accept),
  offerDecline: text(offer.decline),
  shortTimeBody: text(offer.short_time_body) || text(offer.body),
  shortTimeOptionId: shortTime?.id ?? '',
  loggerBadge: text(root.logger_badge),
};

export function offerBodyForShortTime(shortTime: boolean): string {
  return shortTime && CHECKIN.shortTimeBody ? CHECKIN.shortTimeBody : CHECKIN.offerBody;
}

export function shouldShowCheckin(input: {
  isStrength: boolean;
  hideCheckin: boolean;
  resolved: boolean;
  hasTickedSet: boolean;
}): boolean {
  if (!input.isStrength || input.hideCheckin || input.resolved || input.hasTickedSet) return false;
  return CHECKIN.title.length > 0 && CHECKIN.options.length > 0;
}
