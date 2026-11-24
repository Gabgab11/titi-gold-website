// Applies the text, picture and colour changes Titi has published.
// Pages with nothing published (or no connection) show the built-in content.
// Uses a plain request rather than the full Supabase library, so phones download less.
import { SUPABASE_URL, SUPABASE_KEY } from "./supabase-config.js";
import { editableTexts, editableImages } from "./editable.js";

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
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_content?select=key,value`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) apply(data);
  } catch {}
}
run();
