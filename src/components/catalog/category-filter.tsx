"use client";

import Link from "next/link";

type CategoryFilterProps = {
  categories: string[];
  selectedCategory?: string;
};

export function CategoryFilter({
  categories,
  selectedCategory,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-4">
      {/* Botão para limpar o filtro ("Todos") */}
      <Link
        href="/"
        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all ${
          !selectedCategory
            ? "bg-indigo-600 text-white shadow-sm"
            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
        }`}
      >
        Todos
      </Link>

      {/* Botões para cada categoria vinda do MongoDB */}
      {categories.map((category) => {
        const isSelected = selectedCategory === category;
        return (
          <Link
            key={category}
            href={`/?category=${encodeURIComponent(category)}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all ${
              isSelected
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {category}
          </Link>
        );
      })}
    </div>
  );
}