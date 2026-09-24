import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/lib/auth.config';

/** "/" has no content of its own: the middleware sends guests to /login first. */
export default function RootPage() {
  redirect(HOME_PATH);
}
