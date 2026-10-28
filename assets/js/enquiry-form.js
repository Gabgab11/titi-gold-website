/**
 * TITI GOLD — smart enquiry form
 * ------------------------------------------------------------------
 * - Adapts its questions to the chosen business (from enquiry-schema.js).
 * - Validates with the same rules the server uses.
 * - Submits to SITE.enquiry.endpoint and reports the server's real answer.
 *   It only says an enquiry was sent when the server confirms delivery.
 *   If online delivery isn't switched on, it says so plainly, keeps the
 *   visitor's details, and offers email / WhatsApp / copy fallbacks.
 */
import {
  BUSINESSES,
  OPTIONAL_FIELDS,
  validateEnquiry,
  isoToday,
  LIMITS,
} from "./enquiry-schema.js";

const REQUEST_TIMEOUT_MS = 20000;

export function initEnquiryForm({ form, site, toast = () => {} }) {
  const $ = (sel) => form.querySelector(sel);
  const status = $("#formStatus");
  const submitBtn = $("#submitButton");
  const submitLabel = submitBtn.querySelector(".btn-label");
  const typeSelect = $("#enquiryType");
  const typeLabel = $("#enquiryTypeLabel");
  const messageLabel = $("#messageLabel");
  const message = $("#message");
  const locationLabel = $("#locationLabel");
  const locationInput = $("#location");
  const counter = form.querySelector("[data-char-count]");
  const startedAt = $("#startedAt");
  const endpoint = (site.enquiry && site.enquiry.endpoint) || "";

  let attempted = false;
  let busy = false;

  /* ---------- helpers ---------- */
  const currentBusiness = () => form.querySelector("input[name='business']:checked")?.value || "events";

  function setLabel(labelEl, text, required) {
    labelEl.textContent = `${text} `;
    const mark = document.createElement("span");
    if (required) {
      mark.className = "req";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "*";
    } else {
      mark.className = "optional";
      mark.textContent = "(optional)";
    }
    labelEl.append(mark);
  }

  function fieldWrap(name) {
    return form.querySelector(`[data-field="${name}"]`);
  }

  function setError(name, text) {
    const errorEl = form.querySelector(`#${name}-error`);
    const control = name === "business"
      ? null
      : form.querySelector(`[name="${name}"]`);
    if (errorEl) errorEl.textContent = text || "";
    if (control) {
      if (text) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
  }

  function clearErrors() {
    form.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  }

  function showErrors(errors) {
    clearErrors();
    for (const [name, text] of Object.entries(errors)) setError(name, text);
  }

  function focusFirstError(errors) {
    const order = ["business", "name", "email", "phone", "enquiryType", ...OPTIONAL_FIELDS, "message", "consent"];
    const first = order.find((n) => errors[n]);
    if (!first) return;
    const el = first === "business"
      ? form.querySelector("input[name='business']:checked") || form.querySelector("input[name='business']")
      : form.querySelector(`[name="${first}"]`);
    el?.focus();
  }

  function collect() {
    const data = Object.fromEntries(new FormData(form).entries()); // disabled fields are excluded
    data.consent = form.querySelector("#consent").checked;
    return data;
  }

  /* ---------- adapt the form to the chosen business ---------- */
  function applyBusiness(key) {
    const cfg = BUSINESSES[key];
    if (!cfg) return;

    const radio = form.querySelector(`input[name='business'][value='${key}']`);
    if (radio && !radio.checked) radio.checked = true;

    // Enquiry type
    setLabel(typeLabel, cfg.typeLabel, true);
    const previous = typeSelect.value;
    const options = [new Option("Select an option", "")];
    for (const t of cfg.types) options.push(new Option(t, t));
    typeSelect.replaceChildren(...options);
    typeSelect.value = cfg.types.includes(previous) ? previous : "";

    // Business-specific fields
    for (const name of OPTIONAL_FIELDS) {
      const wrap = fieldWrap(name);
      if (!wrap) continue;
      const show = cfg.fields.includes(name);
      const required = cfg.required.includes(name);
      wrap.hidden = !show;
      wrap.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !show;
        control.required = show && required;
      });
      const label = wrap.querySelector("label");
      if (label && name !== "location") {
        const text = label.firstChild?.textContent?.trim() || label.textContent.trim();
        setLabel(label, text, required);
      }
      if (!show) setError(name, "");
    }

    setLabel(locationLabel, cfg.locationLabel, cfg.required.includes("location"));
    locationInput.placeholder = cfg.locationPlaceholder;
    setLabel(messageLabel, cfg.messageLabel, true);
    message.placeholder = cfg.messagePlaceholder;

    // Clear any previous result when the visitor switches business.
    if (!busy) status.replaceChildren();
    if (attempted) revalidateVisible();
  }

  function revalidateVisible() {
    const result = validateEnquiry(collect(), { minDate: isoToday() });
    showErrors(result.ok ? {} : result.errors);
  }

  /* ---------- live behaviour ---------- */
  form.querySelectorAll("input[name='business']").forEach((radio) => {
    radio.addEventListener("change", () => applyBusiness(radio.value));
  });

  document.querySelectorAll("[data-choose-business]").forEach((link) => {
    link.addEventListener("click", () => {
      const key = link.dataset.chooseBusiness;
      applyBusiness(key);
      toast(`${BUSINESSES[key].name} selected`);
      // After the smooth scroll, move focus into the form for keyboard users.
      setTimeout(() => form.querySelector("#name")?.focus({ preventScroll: true }), 450);
    });
  });

  const eventDate = form.querySelector("#eventDate");
  if (eventDate) eventDate.min = isoToday();

  const updateCounter = () => {
    if (!counter) return;
    const n = message.value.length;
    counter.textContent = n > LIMITS.message * 0.75 ? `${n} / ${LIMITS.message}` : "";
  };
  message.addEventListener("input", updateCounter);

  // Record when the visitor started — helps the server spot instant bot submissions.
  const markStart = () => { if (!startedAt.value) startedAt.value = String(Date.now()); };
  form.addEventListener("focusin", markStart, { once: true });
  form.addEventListener("input", markStart, { once: true });

  // Once someone has tried to submit, update errors as they fix them.
  form.addEventListener("input", (e) => {
    if (!attempted || !e.target.name) return;
    const result = validateEnquiry(collect(), { minDate: isoToday() });
    setError(e.target.name, result.ok ? "" : result.errors[e.target.name] || "");
  });
  form.addEventListener("change", (e) => {
    if (!attempted || !e.target.name || e.target.name === "business") return;
    const result = validateEnquiry(collect(), { minDate: isoToday() });
    setError(e.target.name, result.ok ? "" : result.errors[e.target.name] || "");
  });

  /* ---------- result messages ---------- */
  function statusCard(kind, title, paragraphs, actions = []) {
    const card = document.createElement("div");
    card.className = `status-card status-${kind}`;
    const h = document.createElement("h4");
    h.textContent = title;
    card.append(h);
    for (const p of paragraphs) {
      const el = document.createElement("p");
      if (typeof p === "string") el.textContent = p;
      else el.append(...p);
      card.append(el);
    }
    if (actions.length) {
      const row = document.createElement("div");
      row.className = "status-actions";
      row.append(...actions);
      card.append(row);
    }
    status.replaceChildren(card);
    status.focus({ preventScroll: true });
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function enquirySummary(data) {
    const cfg = BUSINESSES[data.business];
    const lines = [
      `Business: ${cfg.name}`,
      `${cfg.typeLabel}: ${data.enquiryType}`,
      `Name: ${data.name}`,
      `Email: ${data.email}`,
    ];
    if (data.phone) lines.push(`Phone: ${data.phone}`);
    const labels = { eventDate: "Preferred date", budget: "Budget", guests: "Guests", organisation: "Organisation", product: "Product", quantity: "Quantity / size", location: cfg.locationLabel };
    for (const f of cfg.fields) if (data[f]) lines.push(`${labels[f]}: ${data[f]}`);
    lines.push("", data.message);
    return lines.join("\n");
  }

  function fallbackActions(data) {
    const actions = [];
    const contact = site.contact || {};
    const summary = enquirySummary(data);
    const subject = `Enquiry: ${BUSINESSES[data.business].name}`;

    if (contact.email) {
      const body = summary.length > 1800 ? `${summary.slice(0, 1800)}…` : summary;
      const a = document.createElement("a");
      a.className = "btn";
      a.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      a.textContent = "Send by email instead";
      actions.push(a);
    }
    if (contact.whatsapp) {
      const a = document.createElement("a");
      a.className = "btn btn-outline";
      a.href = `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`${subject}\n\n${summary}`.slice(0, 1500))}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Send on WhatsApp";
      actions.push(a);
    }
    if (navigator.clipboard) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-outline";
      b.textContent = "Copy my enquiry";
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(summary);
          b.textContent = "Copied";
          toast("Your enquiry has been copied");
        } catch {
          toast("Couldn't copy. Please select and copy the text manually.");
        }
      });
      actions.push(b);
    }
    return actions;
  }

  function showNotConnected(data) {
    const hasDirect = Boolean(site.contact?.email || site.contact?.whatsapp);
    statusCard(
      "warning",
      "Online enquiries aren't switched on yet",
      [
        "Your enquiry has not been sent. Your details are still in the form, so nothing is lost.",
        hasDirect
          ? "You can send the same details to us directly using one of the options below."
          : "Please copy your enquiry and keep it handy, or check back soon.",
      ],
      fallbackActions(data),
    );
  }

  function showFailure(data, text) {
    statusCard("error", "We couldn't send your enquiry", [text, "Your details are still in the form. Please try again in a moment."], fallbackActions(data));
  }

  function showSuccess(data, reference) {
    const cfg = BUSINESSES[data.business];
    const paragraphs = [
      `Thank you, ${data.name.split(" ")[0]}. Your enquiry has reached ${cfg.name}, and we'll reply to ${data.email}.`,
    ];
    if (reference) {
      const label = document.createTextNode("Your reference: ");
      const ref = document.createElement("span");
      ref.className = "status-ref";
      ref.textContent = reference;
      paragraphs.push([label, ref]);
    }
    statusCard("success", "Enquiry received", paragraphs);
  }

  function setBusy(on) {
    busy = on;
    submitBtn.disabled = on;
    submitBtn.setAttribute("aria-busy", String(on));
    submitLabel.textContent = on ? "Sending…" : "Send enquiry";
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    attempted = true;

    const raw = collect();
    const result = validateEnquiry(raw, { minDate: isoToday() });
    if (!result.ok) {
      showErrors(result.errors);
      status.replaceChildren();
      focusFirstError(result.errors);
      return;
    }
    clearErrors();
    const data = result.data;

    if (!endpoint) {
      showNotConnected(data);
      return;
    }

    const payload = { ...raw, consent: true };
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let body = null;
      try { body = await response.json(); } catch { /* non-JSON (e.g. a static host's 404 page) */ }

      if (response.ok && body && body.ok === true) {
        showSuccess(data, body.reference);
        const keep = data.business;
        form.reset();
        applyBusiness(keep);
        startedAt.value = "";
        attempted = false;
        updateCounter();
        return;
      }

      if (response.status === 422 && body?.errors) {
        showErrors(body.errors);
        status.replaceChildren();
        focusFirstError(body.errors);
        return;
      }

      // No backend deployed (static hosting returns 404/405) or not configured yet.
      if (response.status === 404 || response.status === 405 || response.status === 501 || body?.code === "not_configured") {
        showNotConnected(data);
        return;
      }

      if (response.status === 429) {
        showFailure(data, "We've received several enquiries from your connection in a short time.");
        return;
      }

      showFailure(data, "Something went wrong on our side while sending your enquiry.");
    } catch (err) {
      if (err.name === "AbortError") {
        showFailure(data, "The connection timed out before we could confirm your enquiry was received.");
      } else if (window.location.protocol === "file:") {
        showNotConnected(data); // opened straight from disk, so there is no server to send to
      } else {
        showFailure(data, "We couldn't reach our server. Please check your internet connection.");
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  });

  /* ---------- initial state ---------- */
  applyBusiness(currentBusiness());
  updateCounter();
}
