export type FormState = { error?: string; ok?: string } | null;

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role={state.error ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${state.error ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'}`}>
      {state.error || state.ok}
    </p>
  );
}
