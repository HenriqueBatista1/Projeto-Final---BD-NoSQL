import { cn } from "../../lib/utils/cn";

export type StockBadgeProps = {
  stock: number;
  className?: string;
};

export function StockBadge({ stock, className }: StockBadgeProps) {
  const available = stock > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        available
          ? "bg-success-100 text-success-800"
          : "bg-danger-100 text-danger-800",
        className,
      )}
    >
      {available ? `${stock} em estoque` : "Sem estoque"}
    </span>
  );
}
