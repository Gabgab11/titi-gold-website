// Admin page for Titi Gold: sign in by email link, then write, upload, publish and share posts.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from "./supabase-config.js";
import { editableTexts, editableImages, DEFAULT_THEME } from "./editable.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let currentId = null;
let coverUrl = null;

const setMsg = (el, text, ok = false) => {
  el.textContent = text;
  el.dataset.ok = ok ? "1" : "0";
};
const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

function showLogin(message = "") {
  $("editorPanel").hidden = true;
  $("authPanel").hidden = false;
  if (message) setMsg($("loginMsg"), message);
}

function showEditor(email) {
  $("authPanel").hidden = true;
  $("editorPanel").hidden = false;
  $("whoami").textContent = email;
  loadPosts();
  newPost();
}

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  const { data: isAdmin, error } = await sb.rpc("is_admin");
  if (error || !isAdmin) {
    await sb.auth.signOut();
    return showLogin("This email is not set up as an admin. Please contact Titi Gold's team.");
  }
  showEditor(session.user.email);
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return setMsg($("loginMsg"), "That email or password is not right. Please try again.");
  $("loginPassword").value = "";
  init();
});

$("signOut").addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin("You have signed out.");
});


async function loadPosts() {
  const { data, error } = await sb
    .from("posts")
    .select("id,title,status,updated_at")
    .order("updated_at", { ascending: false });
  const list = $("postList");
  list.replaceChildren();
  if (error) return setMsg($("formMsg"), "Posts could not be loaded: " + error.message);
  for (const p of data) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = p.id;
    btn.setAttribute("aria-current", String(p.id === currentId));
    btn.textContent = `${p.title || "Untitled"} (${p.status === "published" ? "published" : "draft"})`;
    btn.addEventListener("click", () => loadPost(p.id));
    li.append(btn);
    list.append(li);
  }
}

function fillForm(p) {
  currentId = p?.id || null;
  coverUrl = p?.cover_url || null;
  $("postId").value = p?.id || "";
  $("title").value = p?.title || "";
  $("slug").value = p?.slug || "";
  $("slug").dataset.auto = p ? "0" : "1";
  $("excerpt").value = p?.excerpt || "";
  $("body").value = p?.body || "";
  $("coverName").textContent = coverUrl ? "Cover image added" : "";
  $("deletePost").hidden = !p;
  $("unpublish").hidden = !(p && p.status === "published");
  if (p?.status === "published") showShare(p.slug, p.title);
  else $("shareBox").hidden = true;
}

async function loadPost(id) {
  const { data, error } = await sb.from("posts").select("*").eq("id", id).single();
  if (error) return setMsg($("formMsg"), "That post could not be opened.");
  fillForm(data);
  setMsg($("formMsg"), "");
  loadPosts();
}

function newPost() {
  fillForm(null);
  setMsg($("formMsg"), "");
  loadPosts();
}

function showShare(slug, title) {
  const url = `${SITE_URL}/post.html?slug=${encodeURIComponent(slug)}`;
  $("shareUrl").value = url;
  $("shareWa").href = `https://wa.me/?text=${encodeURIComponent(title + " " + url)}`;
  $("shareMail").href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;
  $("shareBox").hidden = false;
}

function collect(status) {
  const title = $("title").value.trim();
  const slug = $("slug").value.trim();
  if (!title) return { error: "Please add a title." };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: "The web address can only use small letters, numbers and dashes." };
  return {
    error: null,
    row: {
      title,
      slug,
      excerpt: $("excerpt").value.trim(),
      body: $("body").value.trim(),
      cover_url: coverUrl,
      status,
      updated_at: new Date().toISOString(),
    },
  };
}

async function save(status) {
  const { error: err, row } = collect(status);
  if (err) return setMsg($("formMsg"), err);
  if (status === "published") row.published_at = new Date().toISOString();
  if (status === "published" && currentId) {
    const { data: existing } = await sb.from("posts").select("published_at").eq("id", currentId).single();
    if (existing?.published_at) row.published_at = existing.published_at;
  }
  if (status === "draft") row.published_at = null;

  const query = currentId
    ? sb.from("posts").update(row).eq("id", currentId).select().single()
    : sb.from("posts").insert(row).select().single();
  const { data, error } = await query;
  if (error) {
    const taken = error.code === "23505";
    return setMsg($("formMsg"), taken ? "Another post already uses that web address. Please change it." : "The post could not be saved. " + error.message);
  }
  fillForm(data);
  loadPosts();
  setMsg(
    $("formMsg"),
    status === "published" ? "Published. Share the link below." : "Saved as a draft. Only you can see it until you publish.",
    true
  );
}

$("saveDraft").addEventListener("click", () => save("draft"));
$("publish").addEventListener("click", () => save("published"));
$("unpublish").addEventListener("click", () => save("draft"));
$("newPost").addEventListener("click", newPost);

$("deletePost").addEventListener("click", async () => {
  if (!currentId) return;
  if (!confirm("Delete this post permanently? This cannot be undone.")) return;
  const { error } = await sb.from("posts").delete().eq("id", currentId);
  if (error) return setMsg($("formMsg"), "The post could not be deleted. " + error.message);
  newPost();
  setMsg($("formMsg"), "The post was deleted.", true);
});

$("title").addEventListener("input", () => {
  if ($("slug").dataset.auto !== "0") $("slug").value = slugify($("title").value);
});
$("slug").addEventListener("input", () => {
  $("slug").dataset.auto = "0";
});

async function upload(file) {
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${Date.now()}-${safe}`;
  const { error } = await sb.storage.from("media").upload(path, file, { contentType: file.type, cacheControl: "3600" });
  if (error) throw error;
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
}

$("bodyImage").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setMsg($("formMsg"), "Uploading picture…");
  try {
    const url = await upload(file);
    const ta = $("body");
    ta.value = (ta.value ? ta.value.trimEnd() + "\n\n" : "") + "image: " + url + "\n\n";
    setMsg($("formMsg"), "Picture added to the post. Save to keep it.", true);
  } catch (err) {
    setMsg($("formMsg"), "The picture could not be uploaded. " + err.message);
  }
  e.target.value = "";
});

$("coverImage").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setMsg($("formMsg"), "Uploading cover…");
  try {
    coverUrl = await upload(file);
    $("coverName").textContent = "Cover image added: " + file.name;
    setMsg($("formMsg"), "Cover added. Save to keep it.", true);
  } catch (err) {
    setMsg($("formMsg"), "The cover could not be uploaded. " + err.message);
  }
  e.target.value = "";
});

$("copyLink").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("shareUrl").value);
    $("copyLink").textContent = "Link copied";
  } catch {
    $("shareUrl").select();
  }
});


// ---- Tabs ----
function showTab(name) {
  $("blogPanel").hidden = name !== "blog";
  $("booksPanel").hidden = name !== "books";
  $("pagesPanel").hidden = name !== "pages";
  $("themePanel").hidden = name !== "theme";
  document.querySelectorAll(".admin-tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === name)));
  if (name === "books") loadBooks();
  if (name === "pages") loadPage($("pageSelect").value);
  if (name === "theme") loadTheme();
}
document.querySelectorAll(".admin-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---- Books ----
let currentBookId = null;
let bookCoverUrl = null;

async function loadBooks() {
  const { data, error } = await sb.from("books").select("id,title,status,sort_order").order("sort_order", { ascending: true });
  const list = $("bookList");
  list.replaceChildren();
  if (error) return setMsg($("bookMsg"), "Books could not be loaded: " + error.message);
  for (const b of data) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-current", String(b.id === currentBookId));
    btn.textContent = `${b.title || "Untitled"} (${b.status === "published" ? "shown" : "hidden"})`;
    btn.addEventListener("click", () => loadBook(b.id));
    li.append(btn);
    list.append(li);
  }
}

function fillBook(b) {
  currentBookId = b?.id || null;
  bookCoverUrl = b?.cover_url || null;
  $("bookId").value = b?.id || "";
  $("bookTitle").value = b?.title || "";
  $("bookSubtitle").value = b?.subtitle || "";
  $("bookDesc").value = b?.description || "";
  $("bookBuy").value = b?.buy_url || "";
  $("bookOrder").value = b?.sort_order ?? 0;
  $("bookStatus").value = b?.status || "draft";
  $("bookCoverName").textContent = bookCoverUrl ? "Cover picture added" : "";
  $("deleteBook").hidden = !b;
  setMsg($("bookMsg"), "");
}

async function loadBook(id) {
  const { data, error } = await sb.from("books").select("*").eq("id", id).single();
  if (error) return setMsg($("bookMsg"), "That book could not be opened.");
  fillBook(data);
  loadBooks();
}

$("newBook").addEventListener("click", () => { fillBook(null); loadBooks(); });

$("saveBook").addEventListener("click", async () => {
  const title = $("bookTitle").value.trim();
  if (!title) return setMsg($("bookMsg"), "Please add a title.");
  const row = {
    title,
    subtitle: $("bookSubtitle").value.trim(),
    description: $("bookDesc").value.trim(),
    buy_url: $("bookBuy").value.trim() || null,
    sort_order: Number($("bookOrder").value) || 0,
    status: $("bookStatus").value,
    cover_url: bookCoverUrl,
    updated_at: new Date().toISOString(),
  };
  let result;
  if (currentBookId) {
    result = await sb.from("books").update(row).eq("id", currentBookId).select().single();
  } else {
    row.slug = slugify(title) || "book-" + Date.now();
    result = await sb.from("books").insert(row).select().single();
  }
  if (result.error) return setMsg($("bookMsg"), "The book could not be saved. " + result.error.message);
  fillBook(result.data);
  loadBooks();
  setMsg($("bookMsg"), row.status === "published" ? "Saved. It is shown on the website." : "Saved. It is hidden until you choose to show it.", true);
});

$("deleteBook").addEventListener("click", async () => {
  if (!currentBookId) return;
  if (!confirm("Delete this book permanently? This cannot be undone.")) return;
  const { error } = await sb.from("books").delete().eq("id", currentBookId);
  if (error) return setMsg($("bookMsg"), "The book could not be deleted. " + error.message);
  fillBook(null);
  loadBooks();
  setMsg($("bookMsg"), "The book was deleted.", true);
});

$("bookCover").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setMsg($("bookMsg"), "Uploading cover…");
  try {
    bookCoverUrl = await upload(file);
    $("bookCoverName").textContent = "Cover picture added: " + file.name;
    setMsg($("bookMsg"), "Cover added. Save the book to keep it.", true);
  } catch (err) {
    setMsg($("bookMsg"), "The cover could not be uploaded. " + err.message);
  }
  e.target.value = "";
});

// ---- Website text, pictures and colours ----
// Changes are saved as drafts first; "Publish website changes" copies every draft to the live site.
const LABELS = { h1: "Heading", h2: "Heading", h3: "Heading", h4: "Heading", p: "Paragraph", li: "List item", figcaption: "Caption", blockquote: "Quote" };
let pageName = "index";
let pageDoc = null;
let liveRows = new Map();
let draftRows = new Map();
let pending = new Map(); // key -> value, not yet saved as drafts

const parseJSON = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};
const svgOf = (el) => el.querySelector("svg")?.outerHTML || "";
const htmlWithoutSvg = (el) => {
  const copy = el.cloneNode(true);
  copy.querySelectorAll("svg").forEach((s) => s.remove());
  return copy.innerHTML.trim();
};

async function loadSiteRows() {
  const [live, drafts] = await Promise.all([
    sb.from("site_content").select("key,value"),
    sb.from("site_content_draft").select("key,value"),
  ]);
  const err = live.error || drafts.error;
  if (err) {
    setMsg($("siteMsg"), "Website changes could not be loaded. " + err.message);
    return false;
  }
  liveRows = new Map(live.data.map((r) => [r.key, r.value]));
  draftRows = new Map(drafts.data.map((r) => [r.key, r.value]));
  return true;
}

const savedValue = (key) => draftRows.get(key) ?? liveRows.get(key) ?? null;

async function savePending() {
  if (!pending.size) return setMsg($("siteMsg"), "Nothing new to save.", true);
  const entries = [...pending.entries()];
  const now = new Date().toISOString();
  const { error } = await sb
    .from("site_content_draft")
    .upsert(entries.map(([key, value]) => ({ key, value, updated_at: now })));
  if (error) return setMsg($("siteMsg"), "Could not save. " + error.message);
  for (const [key, value] of entries) {
    draftRows.set(key, value);
    pending.delete(key);
  }
  setMsg($("siteMsg"), "Saved. Press Publish website changes to show it on the live site.", true);
}

async function loadPage(name) {
  pageName = name;
  $("pageItems").replaceChildren();
  setMsg($("siteMsg"), "Loading…");
  try {
    const html = await fetch(`${name}.html`, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("the page could not be found");
      return r.text();
    });
    pageDoc = new DOMParser().parseFromString(html, "text/html");
  } catch (err) {
    return setMsg($("siteMsg"), "This page could not be opened. " + err.message);
  }
  if (!(await loadSiteRows())) return;
  renderPage();
  setMsg($("siteMsg"), "");
}

function textItem(el, i) {
  const key = `t:${pageName}:${i}`;
  const orig = el.textContent.trim();
  const originalHtml = htmlWithoutSvg(el);
  const svg = svgOf(el);
  const saved = parseJSON(savedValue(key));
  const shown = saved?.html ? saved.html.replace(/<svg[\s\S]*?<\/svg>/g, "").trim() : originalHtml;

  const wrap = document.createElement("div");
  wrap.className = "page-item";
  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = `${LABELS[el.tagName.toLowerCase()] || "Text"}: ${orig.slice(0, 70)}`;
  const ta = document.createElement("textarea");
  ta.rows = Math.min(8, Math.max(2, Math.ceil(shown.length / 70)));
  ta.value = shown;
  ta.setAttribute("aria-label", label.textContent);
  ta.addEventListener("input", () => {
    pending.set(key, JSON.stringify({ orig, html: ta.value.trim() + (svg ? " " + svg : "") }));
  });
  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "btn-ghost";
  restore.textContent = "Restore original";
  restore.addEventListener("click", () => {
    ta.value = originalHtml;
    pending.set(key, JSON.stringify({ orig, html: el.innerHTML }));
  });
  wrap.append(label, ta, restore);
  return wrap;
}

function imageItem(img, i) {
  const key = `i:${pageName}:${i}`;
  const orig = img.getAttribute("src");
  const saved = parseJSON(savedValue(key));
  const wrap = document.createElement("div");
  wrap.className = "page-item";
  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = `Picture: ${img.getAttribute("alt") || orig}`;
  const thumb = document.createElement("img");
  thumb.src = saved?.src || orig;
  thumb.alt = "";
  const row = document.createElement("div");
  row.className = "admin-row";
  const pick = document.createElement("label");
  pick.className = "btn-ghost";
  pick.textContent = "Replace picture";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*";
  file.hidden = true;
  pick.append(file);
  file.addEventListener("change", async () => {
    const f = file.files[0];
    if (!f) return;
    setMsg($("siteMsg"), "Uploading picture…");
    try {
      const url = await upload(f);
      pending.set(key, JSON.stringify({ orig, src: url }));
      thumb.src = url;
      setMsg($("siteMsg"), "Picture ready. Press Save changes to keep it.", true);
    } catch (err) {
      setMsg($("siteMsg"), "The picture could not be uploaded. " + err.message);
    }
    file.value = "";
  });
  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "btn-ghost";
  restore.textContent = "Restore original";
  restore.addEventListener("click", () => {
    thumb.src = orig;
    pending.set(key, JSON.stringify({ orig, src: orig }));
  });
  row.append(pick, restore);
  wrap.append(label, thumb, row);
  return wrap;
}

function renderPage() {
  const box = $("pageItems");
  box.replaceChildren();
  editableTexts(pageDoc).forEach((el, i) => box.append(textItem(el, i)));
  editableImages(pageDoc).forEach((img, i) => box.append(imageItem(img, i)));
  if (!box.children.length) setMsg($("siteMsg"), "Nothing on this page can be edited yet.");
}

$("pageSelect").addEventListener("change", (e) => {
  if (pending.size && !confirm("You have changes that are not saved. Leave this page without saving?")) {
    e.target.value = pageName;
    return;
  }
  pending.clear();
  loadPage(e.target.value);
});
$("savePage").addEventListener("click", savePending);

function loadTheme() {
  loadSiteRows().then((ok) => {
    if (!ok) return;
    const saved = parseJSON(savedValue("theme")) || {};
    fillThemeFields({ ...DEFAULT_THEME, ...saved });
  });
}

function fillThemeFields(values) {
  const box = $("themeFields");
  box.replaceChildren();
  for (const [name, value] of Object.entries(DEFAULT_THEME)) {
    const row = document.createElement("label");
    row.className = "color-field";
    const input = document.createElement("input");
    input.type = "color";
    input.value = values[name];
    input.dataset.name = name;
    const text = document.createElement("span");
    text.textContent = THEME_LABELS[name] || name;
    row.append(input, text);
    box.append(row);
  }
}

const THEME_LABELS = {
  "--black": "Main dark colour (headings, dark sections)",
  "--gold": "Gold (buttons, accents)",
  "--gold-ink": "Gold for text on light backgrounds",
  "--ivory": "Light background",
  "--champagne": "Soft gold highlight",
  "--linen": "Alternate light background",
  "--muted": "Body text colour",
};

$("saveTheme").addEventListener("click", () => {
  const values = {};
  document.querySelectorAll("#themeFields input[type=color]").forEach((i) => (values[i.dataset.name] = i.value));
  pending.set("theme", JSON.stringify(values));
  savePending();
});

$("resetTheme").addEventListener("click", () => fillThemeFields(DEFAULT_THEME));

$("publishSite").addEventListener("click", async () => {
  if (pending.size) return setMsg($("siteMsg"), "Please press Save changes first, then publish.");
  const { error } = await sb.rpc("publish_site_content");
  if (error) return setMsg($("siteMsg"), "Could not publish. " + error.message);
  setMsg($("siteMsg"), "Published. The website now shows your latest changes.", true);
});

init();
