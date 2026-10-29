/**
 * TITI GOLD — page behaviour
 * Navigation, header state, scroll reveals, contact details and the enquiry form.
 */
import { SITE } from "./site-config.js";
import { initEnquiryForm } from "./enquiry-form.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Toast ---------- */
const toastEl = $("#toast");
let toastTimer;
function toast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3200);
}

/* ---------- Mobile navigation ---------- */
function initNav() {
  const toggle = $("#menuToggle");
  const menu = $("#navMenu");
  if (!toggle || !menu) return;
  const mobile = window.matchMedia("(max-width: 880px)");

  const setOpen = (open, { returnFocus = false } = {}) => {
    toggle.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
    if (!open && returnFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setOpen(open);
    if (open) $("a", menu)?.focus();
  });

  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false, { returnFocus: true });
    }
  });

  document.addEventListener("click", (e) => {
    if (mobile.matches && !e.target.closest(".nav") && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
    }
  });

  // Close the drawer if the viewport grows to desktop size.
  mobile.addEventListener("change", (e) => { if (!e.matches) setOpen(false); });
}

/* ---------- Header shrink on scroll ---------- */
function initHeader() {
  const header = $("#siteHeader");
  if (!header) return;
  let ticking = false;
  const update = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ---------- Highlight the current section in the nav ---------- */
function initActiveSection() {
  const links = $$(".nav-links a[href^='#']");
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  if (!("IntersectionObserver" in window) || !sections.length) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a) => {
        if (a.hash === `#${entry.target.id}`) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => observer.observe(s));
}

/* ---------- Scroll reveal ---------- */
function initReveal() {
  const items = $$("[data-reveal]");
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-revealed"));
    return;
  }
  const pending = new Set(items);
  const reveal = (el) => {
    el.classList.add("is-revealed");
    pending.delete(el);
    observer.unobserve(el);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach((el) => observer.observe(el));

  // A fast swipe or jump can skip right over a section without it ever
  // "intersecting". Anything that is now above the bottom of the screen is shown.
  let ticking = false;
  const sweep = () => {
    ticking = false;
    const limit = window.innerHeight;
    for (const el of pending) if (el.getBoundingClientRect().top < limit) reveal(el);
    if (!pending.size) window.removeEventListener("scroll", onScroll);
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(sweep); }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ---------- Contact details & social links from site-config.js ---------- */
function svgIcon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#icon-${name}`);
  svg.append(use);
  return svg;
}

function contactEntries() {
  const c = SITE.contact || {};
  const entries = [];
  if (c.email) entries.push({ icon: "mail", label: c.email, href: `mailto:${c.email}` });
  if (c.phone) entries.push({ icon: "phone", label: c.phone, href: `tel:${c.phone.replace(/[^\d+]/g, "")}` });
  if (c.whatsapp) entries.push({ icon: "whatsapp", label: "Chat on WhatsApp", href: `https://wa.me/${c.whatsapp.replace(/\D/g, "")}`, external: true });
  if (c.location) entries.push({ icon: "pin", label: c.location });
  return entries;
}

function renderContact() {
  const entries = contactEntries();

  const list = $("[data-contact-list]");
  const footer = $("[data-footer-contact]");
  if (entries.length) {
    for (const target of [list, footer].filter(Boolean)) {
      target.replaceChildren(...entries.map((entry) => {
        const li = document.createElement("li");
        const el = document.createElement(entry.href ? "a" : "span");
        if (entry.href) {
          el.href = entry.href;
          if (entry.external) { el.target = "_blank"; el.rel = "noopener"; }
        }
        if (target === list) el.append(svgIcon(entry.icon));
        el.append(entry.label);
        li.append(el);
        return li;
      }));
    }
    if (list) list.hidden = false;
  }

  const socialWrap = $("[data-social-links]");
  const names = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube" };
  const socials = Object.entries(SITE.social || {}).filter(([key, url]) => url && names[key]);
  if (socialWrap && socials.length) {
    socialWrap.replaceChildren(...socials.map(([key, url]) => {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", `TITI GOLD on ${names[key]} (opens in a new tab)`);
      a.append(svgIcon(key));
      return a;
    }));
    socialWrap.hidden = false;
  }
}

/* ---------- In-page links ----------
   Scroll to the section without adding "#section" to the address, so a
   reload always starts from the top with the opening animation. */
function scrollBehavior() { return reducedMotion.matches ? "auto" : "smooth"; }

function initInPageLinks() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const id = link.getAttribute("href").slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    if (id === "home") window.scrollTo({ top: 0, behavior: scrollBehavior() });
    else target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    // Move keyboard focus with the scroll (the form links manage their own focus).
    if (!link.hasAttribute("data-choose-business")) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  });
}

/* ---------- Back to top ---------- */
function initBackToTop() {
  const btn = $("#toTop");
  if (!btn) return;
  btn.hidden = false;
  let ticking = false;
  const update = () => {
    btn.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.8);
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    $(".site-header .logo")?.focus({ preventScroll: true });
  });
  update();
}

/* ---------- Scroll effects ----------
   One requestAnimationFrame per scroll; only transforms and opacity change,
   so it stays smooth on phones. Skipped entirely for reduced motion. */
function splitHeadings() {
  $$("[data-split]").forEach((el) => {
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts
      .map((html, i) => `<span class="split-line" style="--line:${i}"><span>${html.trim()}</span></span>`)
      .join("");
  });
}

function indexStaggers() {
  $$("[data-stagger]").forEach((list) => {
    [...list.children].forEach((child, i) => child.style.setProperty("--i", i));
  });
}

function initMarquee() {
  const track = $("[data-marquee]");
  if (!track) return null;
  const run = $(".strip-run", track);
  const set = $(".strip-set", run);
  if (!run || !set) return null;
  let setWidth = 0;

  const build = () => {
    run.querySelectorAll(".strip-set:not(:first-child)").forEach((n) => n.remove());
    setWidth = set.getBoundingClientRect().width;
    if (!setWidth) return;
    // Enough copies to cover the screen while drifting and scroll-shifting by two sets.
    const copies = Math.ceil(window.innerWidth / setWidth) + 3;
    for (let i = 1; i < copies; i++) run.append(set.cloneNode(true));
    run.style.setProperty("--set-w", `${setWidth}px`);
    run.style.setProperty("--strip-speed", `${Math.max(18, setWidth / 22)}s`);
  };
  build();
  return {
    rebuild: build,
    update(y) {
      if (!setWidth) return;
      const x = -((y * 0.45) % setWidth);
      track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    },
  };
}

function initScrollEffects() {
  if (reducedMotion.matches) return;
  document.documentElement.classList.add("motion-ok");

  splitHeadings();
  indexStaggers();

  const bar = $("#scrollProgress");
  const hero = $(".hero");
  const marquee = initMarquee();
  const layers = $$("[data-parallax]").map((el) => ({
    el,
    speed: parseFloat(el.dataset.parallax) || 0,
    // data-parallax-clamp="0.2" limits movement to 20% of the element's height.
    clamp: el.hasAttribute("data-parallax-clamp") ? (parseFloat(el.dataset.parallaxClamp) || 0.045) : 0,
    visible: false,
  }));

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const layer = layers.find((l) => l.el === entry.target);
        if (layer) layer.visible = entry.isIntersecting;
      }
      schedule();
    }, { rootMargin: "25% 0px 25% 0px" });
    layers.forEach((l) => io.observe(l.el));
  } else {
    layers.forEach((l) => { l.visible = true; });
  }

  let vh = window.innerHeight;
  let ticking = false;

  function frame() {
    ticking = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - vh;

    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max).toFixed(4) : 0})`;

    if (hero) {
      const h = hero.offsetHeight || 1;
      const p = Math.min(1, Math.max(0, y / h));
      hero.style.setProperty("--hero-p", p.toFixed(4));
    }

    marquee?.update(y);

    for (const layer of layers) {
      if (!layer.visible) continue;
      const rect = layer.el.getBoundingClientRect();
      const fromCentre = rect.top + rect.height / 2 - vh / 2;
      let offset = -fromCentre * layer.speed;
      if (layer.clamp) {
        const limit = rect.height * layer.clamp;
        offset = Math.max(-limit, Math.min(limit, offset));
      }
      layer.el.style.setProperty("--py", `${offset.toFixed(1)}px`);
    }
  }

  function schedule() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  window.addEventListener("scroll", schedule, { passive: true });
  let resizeTimer;
  window.addEventListener("resize", () => {
    vh = window.innerHeight;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { marquee?.rebuild(); schedule(); }, 150);
    schedule();
  });
  // Fonts change text widths; rebuild the strip once they're in.
  document.fonts?.ready.then(() => { marquee?.rebuild(); schedule(); });
  schedule();
}

/* ---------- Boot ---------- */
initNav();
initHeader();
initActiveSection();
initScrollEffects();
initReveal();
initInPageLinks();
initBackToTop();
renderContact();

const yearEl = $("#year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const form = $("#enquiryForm");
if (form) initEnquiryForm({ form, site: SITE, toast });
