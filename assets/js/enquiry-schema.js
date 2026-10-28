/**
 * TITI GOLD — enquiry schema
 * ------------------------------------------------------------------
 * Single source of truth for the three businesses, the questions the
 * enquiry form asks for each one, and the validation rules.
 *
 * This file is imported by BOTH the browser (assets/js/enquiry-form.js)
 * and the server (server/enquiry-handler.js), so the form and the API
 * can never disagree about what is valid.
 *
 * To change a dropdown option, edit it here — nothing else needs to change.
 */

export const BUSINESSES = Object.freeze({
  events: {
    name: "TITIGOLD Project and Event Management",
    shortName: "Project & Event Management",
    typeLabel: "Event or project type",
    types: [
      "Wedding / engagement",
      "Birthday / celebration",
      "Corporate event",
      "Conference / seminar",
      "Project management",
      "Other event",
    ],
    // Optional fields shown for this business (see FIELD_LABELS below).
    fields: ["eventDate", "budget", "guests", "location", "organisation"],
    // Of those, which are required.
    required: ["eventDate"],
    messageLabel: "Tell us about your event or project",
    messagePlaceholder: "The occasion, the feel you're after, guest numbers, anything you already have in place…",
    locationLabel: "Event location",
    locationPlaceholder: "City, venue, or online",
  },
  foundation: {
    name: "TITIGOLD Foundation",
    shortName: "Foundation",
    typeLabel: "How would you like to connect?",
    types: [
      "Partnership",
      "Sponsorship",
      "Volunteering",
      "Donation",
      "Community project",
      "General enquiry",
    ],
    fields: ["organisation", "location"],
    required: [],
    messageLabel: "Tell us how you would like to connect",
    messagePlaceholder: "Your organisation or community, what you have in mind, and how we can work together…",
    locationLabel: "Your city or community",
    locationPlaceholder: "Where are you based?",
  },
  fashion: {
    name: "TITIGOLD Fashion Hub",
    shortName: "Fashion Hub",
    typeLabel: "What can we help with?",
    types: [
      "Product availability",
      "Place an order",
      "Custom / styling enquiry",
      "Wholesale / partnership",
      "General enquiry",
    ],
    fields: ["product", "quantity", "location"],
    required: [],
    messageLabel: "Tell us what you are looking for",
    messagePlaceholder: "The piece or look you have in mind, colours, occasion, timing…",
    locationLabel: "Delivery city",
    locationPlaceholder: "Where would you like your order delivered?",
  },
});

export const BUSINESS_KEYS = Object.freeze(Object.keys(BUSINESSES));

export const BUDGET_OPTIONS = Object.freeze([
  "Under ₦250,000",
  "₦250,000 – ₦750,000",
  "₦750,000 – ₦2,000,000",
  "Above ₦2,000,000",
  "To be discussed",
]);

export const GUEST_OPTIONS = Object.freeze([
  "Under 50",
  "50 – 150",
  "150 – 300",
  "300 – 500",
  "Over 500",
  "Not sure yet",
]);

/** Every optional, business-specific field the form can show. */
export const OPTIONAL_FIELDS = Object.freeze([
  "eventDate",
  "budget",
  "guests",
  "location",
  "organisation",
  "product",
  "quantity",
]);

export const FIELD_LABELS = Object.freeze({
  business: "Business",
  enquiryType: "Enquiry type",
  name: "Full name",
  email: "Email address",
  phone: "Phone number",
  eventDate: "Preferred date",
  budget: "Estimated budget",
  guests: "Guest numbers",
  location: "Location",
  organisation: "Organisation",
  product: "Product or item",
  quantity: "Quantity / size",
  message: "Message",
  consent: "Consent",
});

/** Maximum lengths. Mirrored as maxlength attributes in index.html. */
export const LIMITS = Object.freeze({
  name: 120,
  email: 254,
  phone: 40,
  location: 200,
  organisation: 160,
  product: 200,
  quantity: 100,
  message: 4000,
});

export const MIN_MESSAGE_LENGTH = 10;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_RE = /^\+?[0-9()\s.-]{7,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Strip control characters except tab/newline.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function clean(value, { multiline = false } = {}) {
  if (value === undefined || value === null) return "";
  let s = String(value).replace(CONTROL_RE, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").trim() : s.replace(/\s+/g, " ").trim();
  return s;
}

/** Today's date as YYYY-MM-DD in local time. */
export function isoToday(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Validate and normalise an enquiry.
 *
 * @param {Record<string, unknown>} input  raw form values
 * @param {{ minDate?: string }} [options] earliest allowed event date (YYYY-MM-DD)
 * @returns {{ ok: true, data: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateEnquiry(input, options = {}) {
  const errors = {};
  const src = input && typeof input === "object" ? input : {};

  const business = clean(src.business);
  const config = BUSINESSES[business];
  if (!config) {
    return { ok: false, errors: { business: "Please choose which TITI GOLD business you're enquiring about." } };
  }

  const data = {
    business,
    businessName: config.name,
    enquiryType: clean(src.enquiryType),
    name: clean(src.name),
    email: clean(src.email).toLowerCase(),
    phone: clean(src.phone),
    message: clean(src.message, { multiline: true }),
  };

  if (!config.types.includes(data.enquiryType)) {
    errors.enquiryType = "Please choose an option from the list.";
  }

  if (data.name.length < 2) errors.name = "Please enter your full name.";
  else if (data.name.length > LIMITS.name) errors.name = `Please keep your name under ${LIMITS.name} characters.`;

  if (!data.email) errors.email = "Please enter your email address so we can reply.";
  else if (data.email.length > LIMITS.email || !EMAIL_RE.test(data.email)) {
    errors.email = "Please enter a valid email address, like name@example.com.";
  }

  if (data.phone && !PHONE_RE.test(data.phone)) {
    errors.phone = "Please enter a valid phone number, using digits and an optional + country code.";
  }

  if (data.message.length < MIN_MESSAGE_LENGTH) {
    errors.message = `Please tell us a little more (at least ${MIN_MESSAGE_LENGTH} characters).`;
  } else if (data.message.length > LIMITS.message) {
    errors.message = `Please keep your message under ${LIMITS.message} characters.`;
  }

  const consent = src.consent;
  if (!(consent === true || consent === "on" || consent === "true" || consent === "yes")) {
    errors.consent = "Please confirm we may use these details to reply to your enquiry.";
  }

  // Business-specific fields. Fields that don't belong to the chosen
  // business are dropped, so stale values from another tab never leak in.
  for (const field of config.fields) {
    const value = clean(src[field]);
    const required = config.required.includes(field);

    if (!value) {
      if (required) errors[field] = `Please add a ${FIELD_LABELS[field].toLowerCase()}.`;
      continue;
    }

    if (field === "eventDate") {
      if (!isRealDate(value)) errors.eventDate = "Please choose a valid date.";
      else if (options.minDate && value < options.minDate) errors.eventDate = "Please choose a date in the future.";
    } else if (field === "budget") {
      if (!BUDGET_OPTIONS.includes(value)) errors.budget = "Please choose a budget range from the list.";
    } else if (field === "guests") {
      if (!GUEST_OPTIONS.includes(value)) errors.guests = "Please choose an option from the list.";
    } else if (LIMITS[field] && value.length > LIMITS[field]) {
      errors[field] = `Please keep this under ${LIMITS[field]} characters.`;
    }
    data[field] = value;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data };
}
