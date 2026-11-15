import { Redirect, type Href } from 'expo-router';

/** Build me a session is now a Coach tool. */
export default function BuildSessionRedirect() {
  return (
    <Redirect
      href={{ pathname: '/coach', params: { question: 'Build me a 30-minute session' } } as Href}
    />
  );
}
