// Admin page for Titi Gold: sign in by email link, then write, upload, publish and share posts.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from "./supabase-config.js";

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

let pendingEmail = "";

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return setMsg($("loginMsg"), "The code could not be sent. Check the email address and try again.");
  pendingEmail = email;
  $("codeEmail").textContent = email;
  setMsg($("codeMsg"), "");
  $("loginForm").hidden = true;
  $("codeForm").hidden = false;
  $("loginCode").focus();
});

$("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("loginCode").value.replace(/\s/g, "");
  const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
  if (error) return setMsg($("codeMsg"), "That code is not right or has expired. Please try again or request a new one.");
  setMsg($("codeMsg"), "");
  init();
});

$("codeBack").addEventListener("click", () => {
  $("codeForm").hidden = true;
  $("loginForm").hidden = false;
  setMsg($("loginMsg"), "");
});

$("signOut").addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin("You have signed out.");
});

sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN") init();
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

init();
