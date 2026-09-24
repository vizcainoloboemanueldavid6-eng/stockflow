import { ArrowLeftRight, ChartColumn, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { DemoBanner } from '@/components/layout/demo-banner';
import { ThemeToggle } from '@/components/theme/theme-toggle';

const FEATURES = [
  {
    icon: ArrowLeftRight,
    text: 'Every stock change is a recorded movement — nothing edits quantities behind your back.',
  },
  { icon: TriangleAlert, text: 'Low-stock alerts before a best seller runs out.' },
  { icon: ChartColumn, text: 'Sales trends, best sellers and stock value at a glance.' },
  { icon: ShieldCheck, text: 'Roles for admins and staff, checked on the server.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <aside className="relative hidden overflow-hidden bg-[#0B1A3A] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary/40 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-sky-500/20 blur-3xl"
          />
          <Logo className="relative text-white" />
          <div className="relative max-w-md space-y-8">
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight">
                Know what is on your shelves — and what to reorder next.
              </h2>
              <p className="text-base text-blue-100/80">
                StockFlow keeps products, stock movements, suppliers and reports in one place for
                small shops and warehouses.
              </p>
            </div>
            <ul className="space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 text-sm text-blue-50/90">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-blue-100/60">
            Portfolio demo with sample data. Products, suppliers and people are fictional.
          </p>
        </aside>

        <main className="relative flex flex-col px-4 py-6 sm:px-8">
          <div className="flex items-center justify-between lg:justify-end">
            <Logo className="lg:hidden" />
            <ThemeToggle />
          </div>
          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-sm">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
