'use client';

import * as React from 'react';
import { ArrowLeftRight, Download, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
  STOCK_STATUS_LABELS,
  STOCK_STATUSES,
} from '@/lib/constants';

const ANY = '__any';

function href(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * The two CSV downloads. Each is a plain link to a guarded Route Handler, so the
 * browser downloads the file itself (UTF-8 with BOM, dated filename); the
 * options only add query parameters the handlers already understand.
 */
export function ReportExports({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [archived, setArchived] = React.useState<'active' | 'archived' | 'all'>('active');
  const [status, setStatus] = React.useState<string>(ANY);
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [type, setType] = React.useState<string>(ANY);

  const productsHref = href('/api/export/products', {
    archived: archived === 'active' ? undefined : archived,
    status: status === ANY ? undefined : status,
  });
  const movementsHref = href('/api/export/movements', {
    from: from || undefined,
    to: to || undefined,
    type: type === ANY ? undefined : type,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" aria-hidden="true" />
            Products
          </CardTitle>
          <CardDescription>
            SKU, category, supplier, stock, reorder level, cost, price and stock value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="export-archived">Products</Label>
              <Select
                value={archived}
                onValueChange={(value) => setArchived(value as typeof archived)}
              >
                <SelectTrigger id="export-archived">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="archived">Archived only</SelectItem>
                  <SelectItem value="all">Active and archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="export-status">Stock status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="export-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any status</SelectItem>
                  {STOCK_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {STOCK_STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button asChild>
            <a href={productsHref} download data-testid="download-products-csv">
              <Download aria-hidden="true" />
              Download products CSV
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
            Stock movements
          </CardTitle>
          <CardDescription>
            Date, type, product, signed change in units, reason and user. Dates are inclusive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="export-from">From</Label>
              <Input
                id="export-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="export-to">To</Label>
              <Input
                id="export-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="export-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="export-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All types</SelectItem>
                  {MOVEMENT_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MOVEMENT_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button asChild>
            <a href={movementsHref} download data-testid="download-movements-csv">
              <Download aria-hidden="true" />
              Download movements CSV
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
