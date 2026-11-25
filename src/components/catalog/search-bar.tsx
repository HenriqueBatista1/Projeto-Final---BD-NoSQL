"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import type { SuggestedProduct } from "@/lib/types";
import { suggestProductsAction } from "../../../app/actions/catalog";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown se o usuário clicar fora do componente
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Efeito de busca com Debounce de 300ms
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await suggestProductsAction(trimmed);
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch (error) {
        console.error("Erro ao buscar sugestões:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Input
          type="search"
          placeholder="Buscar produtos ..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          className="w-full pr-10"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        )}
      </div>

      {/* Dropdown com as sugestões retornadas pelo MongoDB */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 text-xs font-semibold uppercase text-slate-400">
            Sugestões ({suggestions.length})
          </div>
          <ul className="divide-y divide-slate-100">
            {suggestions.map((item) => {
              const formattedPrice = new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(item.price);

              return (
                <li
                  key={item.externalId}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-slate-50 cursor-pointer"
                  onClick={() => {
                    setQuery(item.title);
                    setIsOpen(false);
                  }}
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-50 p-1">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {item.title}
                    </p>
                    <p className="text-xs font-bold text-indigo-600">
                      {formattedPrice}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}