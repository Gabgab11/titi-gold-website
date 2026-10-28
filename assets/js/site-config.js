/**
 * TITI GOLD — site settings
 * ------------------------------------------------------------------
 * Fill these in with the real, approved business details.
 * Anything left as "" is simply hidden on the website, so it is safe
 * to publish before every detail is ready.
 */
export const SITE = {
  contact: {
    // Public enquiries inbox, e.g. "hello@titigold.com".
    // Also used for the "send by email instead" fallback on the form.
    email: "",
    // International format, e.g. "+234 800 000 0000".
    phone: "",
    // WhatsApp number in international format WITHOUT "+" or spaces, e.g. "2348000000000".
    whatsapp: "",
    // City / country shown in the footer, e.g. "Lagos, Nigeria".
    location: "",
  },

  // Full profile URLs, e.g. "https://instagram.com/titigold".
  social: {
    instagram: "",
    facebook: "",
    tiktok: "",
    linkedin: "",
    youtube: "",
  },

  enquiry: {
    // Where the form posts. "/api/enquiry" is the serverless function in /api.
    // Set to "" to switch online submissions off entirely (the form then
    // offers the email fallback only).
    endpoint: "/api/enquiry",
  },
};
