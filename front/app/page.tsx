import { redirect } from 'next/navigation';

export default function HomePage() {
  // Robinhood is the default network: landing on the app root goes straight to it.
  redirect('/robinhood');
}
