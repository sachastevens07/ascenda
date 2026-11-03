import { LegalPage } from '@/components/ui/Legal';
import { PRIVACY_SECTIONS, PRIVACY_TITLE } from '@/lib/legal';

export default function PrivacyScreen() {
  return <LegalPage title={PRIVACY_TITLE} sections={PRIVACY_SECTIONS} />;
}
