import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark className="size-10" />
      <p className="text-sm font-semibold text-link">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </main>
  );
}
