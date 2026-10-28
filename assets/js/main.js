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
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach((el) => observer.observe(el));
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

/* ---------- Boot ---------- */
initNav();
initHeader();
initActiveSection();
initReveal();
initInPageLinks();
initBackToTop();
renderContact();

const yearEl = $("#year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const form = $("#enquiryForm");
if (form) initEnquiryForm({ form, site: SITE, toast });
