import { Redirect, type Href } from 'expo-router';

/** What can I cook is now a Coach tool. */
export default function CookRedirect() {
  return (
    <Redirect
      href={{ pathname: '/coach', params: { question: 'What can I cook with what I have?' } } as Href}
    />
  );
}
