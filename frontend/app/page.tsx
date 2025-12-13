import { redirect } from 'next/navigation';

export default function Home() {
  // Simple public route acting as entry point
  // Redirects directly to login
  redirect('/login');
}
