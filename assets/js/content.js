// Applies the text, picture and colour changes Titi has published.
// Pages with nothing published (or no connection) show the built-in content.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabase-config.js";
import { editableTexts, editableImages } from "./editable.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";

function apply(rows) {
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const theme = map.get("theme");
  if (theme) {
    try {
      for (const [name, value] of Object.entries(JSON.parse(theme))) {
        document.documentElement.style.setProperty(name, value);
      }
    } catch {}
  }

  editableTexts().forEach((el, i) => {
    const raw = map.get(`t:${page}:${i}`);
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (el.textContent.trim() === String(o.orig).trim()) el.innerHTML = o.html;
    } catch {}
  });

  editableImages().forEach((img, i) => {
    const raw = map.get(`i:${page}:${i}`);
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (img.getAttribute("src") === o.orig) {
        const pic = img.closest("picture");
        if (pic) pic.querySelectorAll("source").forEach((s) => s.remove());
        img.src = o.src;
        img.removeAttribute("srcset");
      }
    } catch {}
  });
}

async function run() {
  const { data, error } = await sb.from("site_content").select("key,value");
  if (error || !data) return;
  apply(data);
}
run();
