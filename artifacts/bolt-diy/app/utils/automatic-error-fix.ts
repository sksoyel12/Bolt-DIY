export type AutomaticFixSource = 'preview' | 'terminal';

export function reportAutomaticErrorFix(source: AutomaticFixSource, error: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  const rawMessage = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error ?? '');
  const message = rawMessage
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted token]')
    .replace(
      /\b(authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)(\s*[:=]\s*)["']?[^\s,"']+/gi,
      '$1$2[redacted]',
    )
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[redacted]')
    .slice(0, 12_000);

  if (!message.trim()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('bolt:auto-fix-error', {
      detail: { source, error: message },
    }),
  );
}
