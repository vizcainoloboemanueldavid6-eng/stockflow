import * as React from 'react';

/**
 * Wraps bare text children (strings and numbers) in a `<span>` keyed by the text.
 *
 * Why: browser translation (Chrome/Google Translate) replaces every text node with
 * `<font>` wrappers. React still holds the original, now detached, text node, so
 *  - inserting a node before it (a spinner icon appearing in front of a button label)
 *    or removing it throws `NotFoundError` and crashes the page;
 *  - changing its text changes nothing on screen.
 * An element React owns avoids both: siblings are inserted relative to the span, and a
 * different text gives a different key, so React swaps the whole span (which the
 * translator then translates) instead of editing a text node that is no longer shown.
 */
export function wrapText(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? (
      <span key={`t:${child}`}>{child}</span>
    ) : (
      child
    ),
  );
}

/**
 * Text that changes while the component stays mounted, in its own element keyed by the
 * value (see wrapText). Use it for counters, labels that swap and interpolated values.
 */
export function Swap({
  children,
  className,
  ...props
}: { children: string | number } & Omit<React.ComponentProps<'span'>, 'children'>) {
  return (
    <span key={String(children)} className={className} {...props}>
      {children}
    </span>
  );
}
