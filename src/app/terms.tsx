import { LegalPage } from '@/components/ui/Legal';
import { TERMS_SECTIONS, TERMS_TITLE } from '@/lib/legal';

export default function TermsScreen() {
  return <LegalPage title={TERMS_TITLE} sections={TERMS_SECTIONS} />;
}
