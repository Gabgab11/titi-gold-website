// Admin page for Titi Gold: sign in by email link, then write, upload, publish and share posts.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from "./supabase-config.js";
import { editableTexts, editableImages, DEFAULT_THEME } from "./editable.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
// An invite or password-reset link brings the person here with a token in the address.
let inviteFlow = /type=(invite|recovery)/.test(location.hash);
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
  if (inviteFlow) return showSetPassword();
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

// Set to false when posting should be allowed again.
const POSTING_PAUSED = false;

async function save(status) {
  if (POSTING_PAUSED) return setMsg($("formMsg"), "Posting is paused for now. Please try again later.");
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
  if (name === "team") loadTeam();
  $("teamPanel").hidden = name !== "team";
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

// Whole-site seasonal themes. Each one sets all of the site's main colours.
const THEMES = {
  gold: { name: "Original gold", note: "The website as it was designed.", colours: { ...DEFAULT_THEME } },
  spring: { name: "Spring", note: "Fresh greens and soft cream.", colours: { "--black": "#22301f", "--gold": "#8fb36b", "--gold-ink": "#4f6b35", "--ivory": "#f8faf3", "--champagne": "#d9e8c5", "--linen": "#eef3e6", "--muted": "#55604d" } },
  summer: { name: "Summer", note: "Sea blue, sunshine and warm sand.", colours: { "--black": "#1d3340", "--gold": "#e0a458", "--gold-ink": "#9a5f14", "--ivory": "#fdf9f1", "--champagne": "#f6dfb8", "--linen": "#f3ecdc", "--muted": "#5a5a57" } },
  autumn: { name: "Autumn", note: "Rust, amber and warm earth.", colours: { "--black": "#2e1a12", "--gold": "#b8662e", "--gold-ink": "#8a4417", "--ivory": "#faf3ea", "--champagne": "#ecd3b0", "--linen": "#f1e4d2", "--muted": "#61503f" } },
  winter: { name: "Winter", note: "Icy blue and soft silver.", colours: { "--black": "#142030", "--gold": "#9fb6cf", "--gold-ink": "#3e5a78", "--ivory": "#f5f8fb", "--champagne": "#d6e2ee", "--linen": "#e8eef5", "--muted": "#4c5866" } },
  festive: { name: "Festive", note: "Deep green, red and gold for the holidays.", colours: { "--black": "#1b1f1a", "--gold": "#c6a04a", "--gold-ink": "#6b1d1d", "--ivory": "#fbf7f0", "--champagne": "#e8d8b0", "--linen": "#f2ebdc", "--muted": "#4f4a44" } },
};

let selectedKey = "gold";
let current = { ...DEFAULT_THEME };

function previewTheme(values) {
  for (const [name, value] of Object.entries(values)) {
    document.documentElement.style.setProperty(name, value);
  }
}

function renderCards() {
  const box = $("themeCards");
  box.replaceChildren();
  for (const [key, t] of Object.entries(THEMES)) {
    const selected = selectedKey === key;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-card" + (selected ? " selected" : "");
    b.setAttribute("aria-pressed", selected ? "true" : "false");
    const swatches = document.createElement("span");
    swatches.className = "theme-swatches";
    for (const name of ["--black", "--gold", "--ivory", "--champagne"]) {
      const dot = document.createElement("i");
      dot.style.background = t.colours[name];
      swatches.append(dot);
    }
    const title = document.createElement("strong");
    title.textContent = t.name;
    const note = document.createElement("span");
    note.className = "muted";
    note.textContent = t.note;
    b.append(swatches, title, note);
    b.addEventListener("click", () => chooseTheme(key, t.colours));
    box.append(b);
  }
}

function chooseTheme(key, values) {
  selectedKey = key;
  current = { ...DEFAULT_THEME, ...values };
  previewTheme(current);
  renderCards();
  fillThemeFields(current);
}

function loadTheme() {
  loadSiteRows().then((ok) => {
    if (!ok) return;
    const saved = { ...DEFAULT_THEME, ...(parseJSON(savedValue("theme")) || {}) };
    const match = Object.entries(THEMES).find(([, t]) =>
      Object.keys(DEFAULT_THEME).every((n) => t.colours[n] === saved[n])
    );
    chooseTheme(match ? match[0] : "custom", saved);
  });
}

function fillThemeFields(values) {
  const box = $("themeFields");
  box.replaceChildren();
  for (const name of Object.keys(DEFAULT_THEME)) {
    const row = document.createElement("label");
    row.className = "color-field";
    const input = document.createElement("input");
    input.type = "color";
    input.value = values[name];
    input.dataset.name = name;
    input.addEventListener("input", () => {
      current[name] = input.value;
      selectedKey = "custom";
      previewTheme({ [name]: input.value });
      renderCards();
    });
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
  pending.set("theme", JSON.stringify(current));
  savePending();
});

$("resetTheme").addEventListener("click", () => chooseTheme("gold", DEFAULT_THEME));

$("publishSite").addEventListener("click", async () => {
  if (pending.size) return setMsg($("siteMsg"), "Please press Save changes first, then publish.");
  const { error } = await sb.rpc("publish_site_content");
  if (error) return setMsg($("siteMsg"), "Could not publish. " + error.message);
  setMsg($("siteMsg"), "Published. The website now shows your latest changes.", true);
});

// ---- Invites and passwords ----
function showSetPassword() {
  $("authPanel").hidden = true;
  $("editorPanel").hidden = true;
  $("setPasswordPanel").hidden = false;
}

$("setPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = $("newPassword").value;
  if (password.length < 8) return setMsg($("setPasswordMsg"), "Please use at least 8 characters.");
  const { error } = await sb.auth.updateUser({ password });
  if (error) return setMsg($("setPasswordMsg"), "The password could not be saved. " + error.message);
  inviteFlow = false;
  history.replaceState(null, "", location.pathname);
  $("newPassword").value = "";
  $("setPasswordPanel").hidden = true;
  init();
});

$("forgotPassword").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  if (!email) return setMsg($("loginMsg"), "Type your email address above first, then press Forgot password.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL + "/admin" });
  setMsg($("loginMsg"), error ? "The email could not be sent. " + error.message : "If that email has an account, a link to choose a new password is on its way.", !error);
});

// ---- Team ----
async function callTeam(body) {
  const { data, error } = await sb.functions.invoke("invite-admin", { body });
  if (error) {
    let message = error.message;
    try { message = (await error.context.json()).error || message; } catch {}
    throw new Error(message);
  }
  return data;
}

async function loadTeam() {
  const list = $("teamList");
  list.replaceChildren();
  try {
    const { admins } = await callTeam({ action: "list" });
    const me = (await sb.auth.getUser()).data.user?.email?.toLowerCase();
    for (const email of admins) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = email + (email === me ? " (you)" : "");
      li.append(name);
      if (email !== me) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn-ghost danger";
        remove.textContent = "Remove";
        remove.addEventListener("click", async () => {
          if (!confirm(`Remove ${email}? They will no longer be able to sign in to the admin page.`)) return;
          try {
            const r = await callTeam({ action: "remove", email });
            setMsg($("teamMsg"), r.message, true);
            loadTeam();
          } catch (err) {
            setMsg($("teamMsg"), err.message);
          }
        });
        li.append(remove);
      }
      list.append(li);
    }
  } catch (err) {
    setMsg($("teamMsg"), "The team could not be loaded. " + err.message);
  }
}

$("inviteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("inviteEmail").value.trim();
  if (!email) return setMsg($("teamMsg"), "Please type the email address to invite.");
  $("sendInvite").disabled = true;
  try {
    const r = await callTeam({ action: "invite", email });
    setMsg($("teamMsg"), r.message, true);
    $("inviteEmail").value = "";
    loadTeam();
  } catch (err) {
    setMsg($("teamMsg"), err.message);
  } finally {
    $("sendInvite").disabled = false;
  }
});

init();
