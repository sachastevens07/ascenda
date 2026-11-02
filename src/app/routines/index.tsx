import { Redirect, type Href } from 'expo-router';

export default function RoutinesIndexRedirect() {
  return <Redirect href={'/programmes' as Href} />;
}
