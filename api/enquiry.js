/**
 * Vercel Function: POST /api/enquiry
 * All logic lives in server/enquiry-handler.js — this file only adapts it to Vercel.
 * Configure delivery with environment variables (see .env.example and README.md).
 */
import { handleEnquiryRequest } from "../server/enquiry-handler.js";

export default {
  fetch(request) {
    return handleEnquiryRequest(request, { env: process.env });
  },
};
