import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * Pushes server-side field errors (ActionResult.fieldErrors) into a react-hook-form
 * instance so they render under the matching inputs. Unknown keys and "_form"
 * are returned so the caller can show them as a form-level message.
 */
export function applyFieldErrors<T extends FieldValues>(
  // Only these two methods are used, so forms with a Zod transform (input != output) fit too.
  form: Pick<UseFormReturn<T>, 'getValues' | 'setError'>,
  fieldErrors: Record<string, string[]> | undefined,
): string[] {
  const leftovers: string[] = [];
  if (!fieldErrors) return leftovers;
  const known = new Set(Object.keys(form.getValues()));
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const message = messages[0];
    if (!message) continue;
    if (known.has(key.split('.')[0] ?? key)) {
      form.setError(key as Path<T>, { type: 'server', message });
    } else {
      leftovers.push(message);
    }
  }
  return leftovers;
}
