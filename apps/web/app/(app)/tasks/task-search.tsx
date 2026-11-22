"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

export function TaskSearch({ initialQuery }: { initialQuery?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const urlQuery = searchParams.get("q") ?? initialQuery ?? "";
  const [query, setQuery] = useState(urlQuery);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  function commitQuery(nextValue: string) {
    const trimmed = nextValue.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === urlQuery.trim()) return;
    const handle = window.setTimeout(() => commitQuery(query), 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, urlQuery]);

  return (
    <form
      action={pathname}
      onSubmit={(event) => {
        event.preventDefault();
        commitQuery(query);
      }}
      className="relative"
      role="search"
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <Input
        ref={inputRef}
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search tasks…"
        aria-label="Search tasks"
        className="h-9 w-full pl-8 pr-8 text-[12px] sm:w-[210px]"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            commitQuery("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </form>
  );
}
