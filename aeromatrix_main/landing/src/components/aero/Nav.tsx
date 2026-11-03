import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { MAIN_APP_URL } from "@/config/app";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "concept", label: "Concept" },
  { id: "capabilities", label: "Capabilities" },
  { id: "digital-twin", label: "Digital Twin" },
  { id: "what-if", label: "What If" },
  { id: "about", label: "About" },
];

export function Logo() {
  return (
    <a href="#home" className="flex items-center gap-2.5 text-vanilla" aria-label="AeroMatrix home">
      <span className="grid h-8 w-8 place-items-center rounded-full border border-vanilla/70 font-display text-sm">A</span>
      <span className="text-sm font-semibold tracking-[0.18em]">AERO-MATRIX</span>
    </a>
  );
}

export function Nav() {
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled || open ? "bg-ink/80 backdrop-blur-md border-b border-border" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-10">
        <Logo />
        <ul className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                className={`relative text-[13px] transition-colors ${
                  active === l.id ? "text-vanilla" : "text-vanilla/60 hover:text-vanilla"
                }`}
              >
                {l.label}
                <span
                  className={`absolute -bottom-2 left-1/2 h-0.5 -translate-x-1/2 rounded bg-cherry transition-all ${
                    active === l.id ? "w-5" : "w-0"
                  }`}
                />
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a
            href={MAIN_APP_URL}
            className="hidden items-center gap-2 rounded-full border border-cherry bg-cherry/15 px-5 py-2 text-[13px] text-vanilla transition hover:bg-cherry sm:inline-flex"
          >
            Explore the System <ArrowRight size={14} />
          </a>
          <button
            className="rounded-md p-2 text-vanilla lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
      {open && (
        <ul className="flex flex-col gap-1 px-5 pb-6 lg:hidden">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-3 text-base ${active === l.id ? "bg-cola text-vanilla" : "text-vanilla/75"}`}
              >
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href={MAIN_APP_URL} className="mt-2 flex items-center justify-center gap-2 rounded-full bg-cherry px-5 py-3 text-vanilla">
              Explore the System <ArrowRight size={16} />
            </a>
          </li>
        </ul>
      )}
    </header>
  );
}
