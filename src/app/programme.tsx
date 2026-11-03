import { Redirect, type Href } from 'expo-router';

/** Old programme screen. Routines live under Programmes now. */
export default function ProgrammeScreen() {
  return <Redirect href={'/programmes' as Href} />;
}
