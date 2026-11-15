import { Redirect } from 'expo-router';

/** Scan a machine is removed. Coach identifies machines from a description. */
export default function ScanRedirect() {
  return <Redirect href="/machines" />;
}
