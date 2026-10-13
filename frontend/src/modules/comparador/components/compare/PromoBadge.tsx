interface PromoBadgeProps {
  label: string;
}

/**
 * Amber pill for nth-unit promo labels (e.g. "2do al 80%").
 * Used in ItemMatchTable and OptionBBreakdown.
 */
export function PromoBadge({ label }: PromoBadgeProps) {
  return (
    <span
      aria-label={`Promoción: ${label}`}
      data-testid="promo-badge"
      className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-200 px-1 text-[9px] font-bold text-amber-700"
    >
      🏷️ {label}
    </span>
  );
}

interface InfoBadgeProps {
  label: string;
}

/**
 * Violet pill for informational badges (e.g. "Cuotas sin interés").
 * Used in ItemMatchTable.
 */
export function InfoBadge({ label }: InfoBadgeProps) {
  return (
    <span
      aria-label={`Info: ${label}`}
      data-testid="info-badge"
      className="rounded-md border border-violet-200 bg-violet-50 px-1 text-[9px] font-semibold text-violet-700"
    >
      🎉 {label}
    </span>
  );
}
