const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let state = null;
let activeSearch = "";
let activeType = "all";
let activeFolder = "all";
let activeUnit = "all";
let activeTeacher = "all";
let activeSemester = "all";
let toastTimer = null;
let autoRefreshTimer = null;
let lastSyncAt = null;

const icons = {
  file: "File",
  text: "Text",
  prompt: "Prompt",
  link: "Link",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (path.startsWith("/api/download/")) return response;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function refresh() {
  state = await api("/api/state");
  lastSyncAt = new Date();
  renderDashboardData();
}

function canAutoRefresh() {
  if (!state?.user || document.hidden) return false;
  if ([...document.querySelectorAll("dialog")].some((dialog) => dialog.open)) return false;
  const active = document.activeElement;
  if (!active) return true;
  return !active.matches("input, textarea, select, button, [contenteditable='true']");
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(async () => {
    if (!canAutoRefresh()) return;
    try {
      await refresh();
    } catch {
      updateSyncStatus("Trying to reconnect");
    }
  }, 4000);
  updateSyncStatus("Live sync on");
}

function stopAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

function updateSyncStatus(message = "") {
  const status = document.querySelector("#sync-status");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  status.textContent = lastSyncAt
    ? `Synced ${lastSyncAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "Live sync on";
}

function dateLabel(iso) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function fileSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function normalizeFolderName(name) {
  return String(name || "General").replace(/\s+/g, " ").trim() || "General";
}

function folderKey(name) {
  return normalizeFolderName(name).toLowerCase();
}

function cleanFilterValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function folderMatches(item) {
  return activeFolder === "all" || folderKey(item.subject) === folderKey(activeFolder);
}

function metaMatches(item) {
  return (activeUnit === "all" || cleanFilterValue(item.unit) === activeUnit)
    && (activeTeacher === "all" || cleanFilterValue(item.teacher) === activeTeacher)
    && (activeSemester === "all" || cleanFilterValue(item.semester) === activeSemester);
}

function currentTheme() {
  return localStorage.getItem("classHubTheme") || "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("classHubTheme", theme);
}

function template(id) {
  return document.querySelector(id).content.cloneNode(true);
}

async function boot() {
  applyTheme(currentTheme());
  try {
    state = await api("/api/session");
    if (state.user) renderDashboard();
    else renderSignin();
  } catch (error) {
    app.innerHTML = `<p class="empty-state is-visible">${escapeHtml(error.message)}</p>`;
  }
}

function renderSignin() {
  stopAutoRefresh();
  app.replaceChildren(template("#signin-template"));
  document.querySelector("#signin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      state = await api("/api/signup", {
        method: "POST",
        body: {
          name: form.get("name"),
          inviteCode: form.get("inviteCode"),
        },
      });
      showToast("Welcome in.");
      renderDashboard();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderDashboard() {
  app.replaceChildren(template("#dashboard-template"));
  wireDashboardEvents();
  lastSyncAt = new Date();
  renderDashboardData();
  startAutoRefresh();
}

function wireDashboardEvents() {
  document.querySelector("#welcome-title").textContent = `Hi, ${state.user.name}`;
  document.querySelector("#theme-toggle").addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });
  document.querySelector("#logout-btn").addEventListener("click", async () => {
    stopAutoRefresh();
    await api("/api/logout", { method: "POST", body: {} });
    state = null;
    showToast("Signed out.");
    renderSignin();
  });

  document.querySelector("#new-resource-btn").addEventListener("click", () => openResourceDialog());
  document.querySelector("#new-folder-btn").addEventListener("click", () => openDialog("#folder-dialog"));
  document.querySelector("#new-request-btn").addEventListener("click", () => openRequestDialog());
  document.querySelector("#side-request-btn").addEventListener("click", () => openRequestDialog());
  document.querySelector("#new-announcement-btn").addEventListener("click", () => openDialog("#announcement-dialog"));

  document.querySelector("#search-input").addEventListener("input", (event) => {
    activeSearch = event.target.value.trim().toLowerCase();
    renderResources();
  });
  document.querySelector("#type-filter").addEventListener("change", (event) => {
    activeType = event.target.value;
    renderResources();
  });
  document.querySelector("#unit-filter").addEventListener("change", (event) => {
    activeUnit = event.target.value;
    renderResources();
  });
  document.querySelector("#teacher-filter").addEventListener("change", (event) => {
    activeTeacher = event.target.value;
    renderResources();
  });
  document.querySelector("#semester-filter").addEventListener("change", (event) => {
    activeSemester = event.target.value;
    renderResources();
  });

  document.querySelector("#resource-form").addEventListener("submit", saveResource);
  document.querySelector("#folder-form").addEventListener("submit", saveFolder);
  document.querySelector("#request-form").addEventListener("submit", saveRequest);
  document.querySelector("#announcement-form").addEventListener("submit", saveAnnouncement);
  document.querySelector("#chat-form").addEventListener("submit", saveChatMessage);

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  document.querySelector("#resource-form").addEventListener("change", (event) => {
    if (event.target.name === "type") updateResourceFields();
  });

  document.querySelector("#folder-list").addEventListener("click", handleFolderClick);
  document.querySelector("#resource-list").addEventListener("click", handleResourceClick);
  document.querySelector("#resource-list").addEventListener("submit", handleCommentSubmit);
  document.querySelector("#request-list").addEventListener("click", handleRequestClick);
  document.querySelector("#announcement-list").addEventListener("click", handleAnnouncementClick);
  document.querySelector("#chat-list").addEventListener("click", handleChatClick);
}

function renderDashboardData() {
  const insights = state.insights || {};
  const camp = state.camp || { memberCount: insights.memberCount || 0, memberLimit: 11 };
  document.querySelector("#stat-resources").textContent = state.resources.length;
  document.querySelector("#stat-members").textContent = `${camp.memberCount || 0}/${camp.memberLimit || 11}`;
  document.querySelector("#stat-requests").textContent = state.requests.filter((item) => !item.fulfilled).length;
  document.querySelector("#stat-completion").textContent = `${insights.completionRate || 0}%`;
  renderFocus();
  renderCampers();
  renderQuickFind();
  renderChat();
  renderFolders();
  renderFilterOptions();
  renderInsights();
  renderResources();
  renderRequests();
  renderAnnouncements();
  renderPulse();
  renderActivity();
  updateSyncStatus();
}

function renderFocus() {
  const openRequests = state.requests.filter((request) => !request.fulfilled).length;
  const pinned = state.resources.filter((resource) => resource.pinned).length;
  const camp = state.camp || { memberCount: 0, memberLimit: 11 };
  document.querySelector("#focus-title").textContent = openRequests
    ? `${openRequests} camp request${openRequests === 1 ? "" : "s"} need attention`
    : "Camp resources are caught up";
  document.querySelector("#focus-subtitle").textContent = `${camp.memberCount || 0} of ${camp.memberLimit || 11} campers have joined. The hub has ${state.resources.length} resources, ${pinned} pinned, ${state.chatMessages?.length || 0} chat messages, and ${state.comments.length} resource comments.`;
}

function renderCampers() {
  const campers = state.campers || [];
  const camp = state.camp || { memberCount: campers.length, memberLimit: 11 };
  const count = document.querySelector("#camper-count");
  const list = document.querySelector("#camper-list");
  if (count) count.textContent = `${camp.memberCount || campers.length}/${camp.memberLimit || 11}`;
  if (!list) return;
  list.innerHTML = campers.length
    ? campers.map((camper) => `
      <article class="camper-pill">
        <span>${camper.number}</span>
        <strong>${escapeHtml(camper.name || "Camper")}</strong>
      </article>
    `).join("")
    : '<p class="subtle">No campers have joined yet.</p>';
}

function renderQuickFind() {
  renderResourceDirectory();
  renderCamperDirectory();
}

function renderResourceDirectory() {
  const list = document.querySelector("#directory-list");
  if (!list) return;
  const resources = state.resources.slice(0, 10);
  list.innerHTML = resources.length
    ? resources.map((resource) => {
      const details = [
        resource.subject || "General",
        resource.unit,
        resource.teacher,
        resource.semester,
      ].filter(Boolean).join(" | ");
      return `
        <article class="directory-item">
          <span class="pill type-pill">${icons[resource.type] || "Resource"}</span>
          <div>
            <h3>${escapeHtml(resource.title)}</h3>
            <p>${escapeHtml(details || "General")} | ${escapeHtml(resource.author?.name || "Camper")}</p>
          </div>
        </article>
      `;
    }).join("")
    : '<p class="subtle">Resources will appear here as campers add them.</p>';
}

function renderCamperDirectory() {
  const campers = state.campers || [];
  const camp = state.camp || { memberCount: campers.length, memberLimit: 11 };
  const count = document.querySelector("#directory-camper-count");
  const list = document.querySelector("#camper-directory");
  if (count) count.textContent = `${camp.memberCount || campers.length}/${camp.memberLimit || 11}`;
  if (!list) return;
  list.innerHTML = campers.length
    ? campers.map((camper) => `
      <article class="camper-directory-item">
        <span>${camper.number}</span>
        <strong>${escapeHtml(camper.name || "Camper")}</strong>
        <small>Joined ${dateLabel(camper.createdAt)}</small>
      </article>
    `).join("")
    : '<p class="subtle">Camper usernames will appear here after they join.</p>';
}

function renderFolders() {
  const list = document.querySelector("#folder-list");
  const folders = state.folders?.length ? state.folders : [{ name: "General", resourceCount: 0, openRequestCount: 0 }];
  const totalOpenRequests = state.requests.filter((request) => !request.fulfilled).length;
  const cards = [
    folderCard({
      name: "All",
      value: "all",
      resourceCount: state.resources.length,
      openRequestCount: totalOpenRequests,
    }),
    ...folders.map((folder) => folderCard({
      name: folder.name,
      value: folder.name,
      resourceCount: folder.resourceCount || 0,
      openRequestCount: folder.openRequestCount || 0,
    })),
  ];
  list.innerHTML = cards.join("");
}

function folderCard(folder) {
  const isActive = activeFolder === "all"
    ? folder.value === "all"
    : folderKey(folder.value) === folderKey(activeFolder);
  const requestText = `${folder.openRequestCount} open`;
  return `
    <button class="folder-card ${isActive ? "is-active" : ""}" type="button" data-folder="${escapeHtml(folder.value)}">
      <span class="folder-card-title">${escapeHtml(folder.name)}</span>
      <span class="folder-card-meta">${folder.resourceCount} resource${folder.resourceCount === 1 ? "" : "s"} | ${requestText}</span>
    </button>
  `;
}

function handleFolderClick(event) {
  const card = event.target.closest("[data-folder]");
  if (!card) return;
  activeFolder = card.dataset.folder || "all";
  renderDashboardData();
}

function renderFilterOptions() {
  fillFilter("#unit-filter", "All units", activeUnit, metadataValues("unit"), (value) => {
    activeUnit = value;
  });
  fillFilter("#teacher-filter", "All teachers", activeTeacher, metadataValues("teacher"), (value) => {
    activeTeacher = value;
  });
  fillFilter("#semester-filter", "All semesters", activeSemester, metadataValues("semester"), (value) => {
    activeSemester = value;
  });
}

function metadataValues(key) {
  return [...new Set(state.resources.map((resource) => cleanFilterValue(resource[key])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function fillFilter(selector, allLabel, current, values, updateCurrent) {
  const select = document.querySelector(selector);
  if (!select) return;
  const nextValue = current === "all" || values.includes(current) ? current : "all";
  updateCurrent(nextValue);
  select.innerHTML = [
    `<option value="all">${allLabel}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
  ].join("");
  select.value = nextValue;
}

function filteredResources() {
  return state.resources.filter((resource) => {
    if (!folderMatches(resource)) return false;
    if (!metaMatches(resource)) return false;
    if (activeType === "bookmarks" && !resource.bookmarked) return false;
    if (activeType !== "all" && activeType !== "bookmarks" && resource.type !== activeType) return false;
    if (!activeSearch) return true;
    const haystack = [
      resource.title,
      resource.subject,
      resource.unit,
      resource.teacher,
      resource.semester,
      resource.description,
      resource.author?.name,
      resource.content,
      resource.url,
      ...(resource.tags || []),
    ].join(" ").toLowerCase();
    return haystack.includes(activeSearch);
  });
}

function renderResources() {
  const list = document.querySelector("#resource-list");
  const empty = document.querySelector("#empty-resources");
  const resources = filteredResources();
  list.innerHTML = resources.map(resourceCard).join("");
  empty.classList.toggle("is-visible", resources.length === 0);
}

function resourceCard(resource) {
  const comments = state.comments.filter((comment) => comment.resourceId === resource.id);
  const tagHtml = (resource.tags || []).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
  const preview = previewHtml(resource);
  const fileMeta = resource.type === "file" ? `${escapeHtml(resource.fileName || "file")} ${resource.fileSize ? `| ${fileSize(resource.fileSize)}` : ""}` : "";
  const editActions = resource.isMine
    ? `<button class="action-btn" data-action="edit" data-id="${resource.id}" type="button">Edit</button>
       <button class="action-btn danger-btn" data-action="delete" data-id="${resource.id}" type="button">Delete</button>`
    : "";
  const metaItems = [
    ["Subject", resource.subject || "General"],
    ["Unit", resource.unit],
    ["Teacher", resource.teacher],
    ["Semester", resource.semester],
  ].filter((item) => item[1]);

  return `
    <article class="resource-card" data-resource-id="${resource.id}">
      <div class="resource-top">
        <div>
          <div class="resource-title-line">
            <span class="pill type-pill">${icons[resource.type] || "Resource"}</span>
            ${resource.pinned ? '<span class="pill pin-pill">Pinned</span>' : ""}
            <h3>${escapeHtml(resource.title)}</h3>
          </div>
          <p class="resource-meta">
            ${escapeHtml(resource.author?.name || "Classmate")} | ${dateLabel(resource.createdAt)}${fileMeta ? ` | ${fileMeta}` : ""}
          </p>
        </div>
        <div class="resource-actions">
          ${mainAction(resource)}
          <button class="action-btn" data-action="helpful" data-id="${resource.id}" type="button">${resource.helpfulByMe ? "Helpful" : "Mark Helpful"} (${resource.helpfulCount || 0})</button>
          <button class="action-btn" data-action="bookmark" data-id="${resource.id}" type="button">${resource.bookmarked ? "Saved" : "Save"}</button>
          ${editActions}
        </div>
      </div>
      ${metaItems.length ? `<div class="meta-grid">${metaItems.map(([label, value]) => `<span><strong>${label}</strong>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
      ${resource.description ? `<p class="resource-body">${escapeHtml(resource.description)}</p>` : ""}
      ${preview}
      ${tagHtml ? `<div class="tag-row">${tagHtml}</div>` : ""}
      <section class="comments" aria-label="Comments">
        <div class="subtle">${comments.length} comment${comments.length === 1 ? "" : "s"}</div>
        ${comments.map(commentHtml).join("")}
        <form class="comment-form" data-resource-id="${resource.id}">
          <input name="body" placeholder="Add a comment" maxlength="1200" required>
          <button class="ghost-btn small" type="submit">Comment</button>
        </form>
      </section>
    </article>
  `;
}

function mainAction(resource) {
  if (resource.type === "file") {
    return `<a class="action-btn link-action" href="/api/download/${resource.id}">Download</a>`;
  }
  if (resource.type === "link") {
    return `<a class="action-btn link-action" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Open</a>`;
  }
  return `<button class="action-btn" data-action="copy" data-id="${resource.id}" type="button">Copy</button>`;
}

function previewHtml(resource) {
  if (resource.type === "text" || resource.type === "prompt") {
    const text = resource.content || "";
    return `<pre class="resource-preview">${escapeHtml(text.length > 900 ? `${text.slice(0, 900)}...` : text)}</pre>`;
  }
  if (resource.type === "link") {
    return `<p class="resource-preview">${escapeHtml(resource.url)}</p>`;
  }
  return "";
}

function commentHtml(comment) {
  return `
    <div class="comment-row">
      <div>
        <strong>${escapeHtml(comment.author?.name || "Classmate")}</strong>
        <span class="subtle"> | ${dateLabel(comment.createdAt)}</span>
        <p>${escapeHtml(comment.body)}</p>
      </div>
      ${comment.isMine ? `<button class="action-btn danger-btn" data-action="delete-comment" data-id="${comment.id}" type="button">Delete</button>` : ""}
    </div>
  `;
}

function renderInsights() {
  const insights = state.insights || {};
  const tags = insights.topTags || [];
  document.querySelector("#top-tags").innerHTML = tags.length
    ? tags.map((tag) => `<span class="tag">#${escapeHtml(tag.name)} ${tag.count}</span>`).join("")
    : '<span class="subtle">No tags yet.</span>';
  const subjects = insights.topSubjects || [];
  const max = Math.max(1, ...subjects.map((subject) => subject.count || 0));
  document.querySelector("#top-subjects").innerHTML = subjects.length
    ? subjects.map((subject) => `
      <div class="meter-row">
        <span>${escapeHtml(subject.name)}</span>
        <i style="--size:${Math.max(8, Math.round((subject.count / max) * 100))}%"></i>
        <strong>${subject.count}</strong>
      </div>
    `).join("")
    : '<p class="subtle">No subjects yet.</p>';
  const top = insights.topResource;
  document.querySelector("#top-resource").textContent = top
    ? `${top.title} in ${top.subject} (${top.helpfulCount} helpful)`
    : "No helpful marks yet.";
}

function renderPulse() {
  const insights = state.insights || {};
  const bookmarks = state.resources.filter((resource) => resource.bookmarked).length;
  const items = [
    ["Campers joined", `${insights.memberCount || state.camp?.memberCount || 0}/${insights.memberLimit || state.camp?.memberLimit || 11}`],
    ["Chat messages", state.chatMessages?.length || 0],
    ["Pinned resources", insights.pinnedResources || 0],
    ["Saved by you", bookmarks],
    ["Fulfilled requests", insights.fulfilledRequests || 0],
    ["Comments", state.comments.length],
  ];
  document.querySelector("#pulse-list").innerHTML = items.map(([label, value]) => `
    <div class="pulse-item">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join("");
}

function renderChat() {
  const list = document.querySelector("#chat-list");
  const messages = state.chatMessages || [];
  list.innerHTML = messages.length
    ? messages.map((message) => `
      <article class="chat-message ${message.isMine ? "is-mine" : ""}">
        <div>
          <strong>${escapeHtml(message.author?.name || "Camper")}</strong>
          <span>${dateLabel(message.createdAt)}</span>
        </div>
        <p>${escapeHtml(message.body)}</p>
        ${message.isMine ? `<button class="chat-delete" data-action="delete-chat" data-id="${message.id}" type="button">Delete</button>` : ""}
      </article>
    `).join("")
    : '<p class="subtle">No camp messages yet.</p>';
  list.scrollTop = list.scrollHeight;
}

function renderActivity() {
  const activity = state.insights?.recentActivity || [];
  document.querySelector("#activity-list").innerHTML = activity.length
    ? activity.map((item) => `
      <article class="mini-item activity-item">
        <span class="pill">${escapeHtml(item.type)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.subject)} | ${dateLabel(item.createdAt)}</p>
      </article>
    `).join("")
    : '<p class="subtle">No activity yet.</p>';
}

function renderRequests() {
  const list = document.querySelector("#request-list");
  const requests = state.requests.filter((request) => folderMatches(request) && metaMatches(request));
  list.innerHTML = requests.length
    ? requests.map((request) => {
      const meta = [
        request.subject || "General",
        request.unit,
        request.teacher,
        request.semester,
      ].filter(Boolean).join(" | ");
      return `
        <article class="mini-item">
          <h3>${escapeHtml(request.title)}</h3>
          <p>${escapeHtml(meta)} | ${escapeHtml(request.author?.name || "Classmate")} | ${dateLabel(request.createdAt)}</p>
          ${request.details ? `<p>${escapeHtml(request.details)}</p>` : ""}
          <div class="request-actions">
            <span class="pill ${request.fulfilled ? "" : "type-pill"}">${request.fulfilled ? "Fulfilled" : "Open"}</span>
            ${request.isMine ? `
              <span>
                <button class="action-btn" data-action="toggle-request" data-id="${request.id}" data-fulfilled="${request.fulfilled ? "false" : "true"}" type="button">${request.fulfilled ? "Reopen" : "Done"}</button>
                <button class="action-btn danger-btn" data-action="delete-request" data-id="${request.id}" type="button">Delete</button>
              </span>
            ` : ""}
          </div>
        </article>
      `;
    }).join("")
    : '<p class="subtle">No requests in this view.</p>';
}

function renderAnnouncements() {
  const list = document.querySelector("#announcement-list");
  list.innerHTML = state.announcements.length
    ? state.announcements.map((announcement) => `
      <article class="mini-item">
        <p>${escapeHtml(announcement.text)}</p>
        <p>${escapeHtml(announcement.author?.name || "Class Hub")} | ${dateLabel(announcement.createdAt)}</p>
        ${announcement.isMine ? `<button class="action-btn danger-btn" data-action="delete-announcement" data-id="${announcement.id}" type="button">Delete</button>` : ""}
      </article>
    `).join("")
    : '<p class="subtle">No announcements yet.</p>';
}

function openDialog(selector) {
  const dialog = document.querySelector(selector);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function populateSubjectSelect(select, selected = "General") {
  const selectedName = normalizeFolderName(selected);
  const names = new Map();
  for (const folder of state.folders || []) {
    names.set(folderKey(folder.name), folder.name);
  }
  if (!names.size) names.set("general", "General");
  if (!names.has(folderKey(selectedName))) names.set(folderKey(selectedName), selectedName);
  select.innerHTML = [...names.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  select.value = selectedName;
}

function openResourceDialog(resource = null) {
  const form = document.querySelector("#resource-form");
  form.reset();
  form.elements.id.value = resource?.id || "";
  document.querySelector("#resource-dialog-title").textContent = resource ? "Edit Resource" : "Add Resource";
  form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.checked = radio.value === (resource?.type || "file");
    radio.disabled = Boolean(resource);
  });
  form.elements.title.value = resource?.title || "";
  populateSubjectSelect(form.elements.subject, resource?.subject || (activeFolder === "all" ? "General" : activeFolder));
  form.elements.unit.value = resource?.unit || (activeUnit === "all" ? "" : activeUnit);
  form.elements.teacher.value = resource?.teacher || (activeTeacher === "all" ? "" : activeTeacher);
  form.elements.semester.value = resource?.semester || (activeSemester === "all" ? "" : activeSemester);
  form.elements.tags.value = (resource?.tags || []).join(", ");
  form.elements.description.value = resource?.description || "";
  form.elements.url.value = resource?.url || "";
  form.elements.content.value = resource?.content || "";
  form.elements.pinned.checked = Boolean(resource?.pinned);
  updateResourceFields(Boolean(resource));
  openDialog("#resource-dialog");
}

function openRequestDialog() {
  const form = document.querySelector("#request-form");
  form.reset();
  populateSubjectSelect(form.elements.subject, activeFolder === "all" ? "General" : activeFolder);
  form.elements.unit.value = activeUnit === "all" ? "" : activeUnit;
  form.elements.teacher.value = activeTeacher === "all" ? "" : activeTeacher;
  form.elements.semester.value = activeSemester === "all" ? "" : activeSemester;
  openDialog("#request-dialog");
}

function updateResourceFields(isEdit = Boolean(document.querySelector("#resource-form").elements.id.value)) {
  const form = document.querySelector("#resource-form");
  const type = getResourceType(form);
  const fileField = form.querySelector(".field-file");
  const urlField = form.querySelector(".field-url");
  const contentField = form.querySelector(".field-content");
  fileField.classList.toggle("is-hidden", type !== "file" || isEdit);
  urlField.classList.toggle("is-hidden", type !== "link");
  contentField.classList.toggle("is-hidden", type !== "text" && type !== "prompt");
  form.elements.file.required = type === "file" && !isEdit;
  form.elements.url.required = type === "link";
  form.elements.content.required = type === "text" || type === "prompt";
}

function getResourceType(form) {
  const id = form.elements.id.value;
  if (id) {
    return state.resources.find((resource) => resource.id === id)?.type || "file";
  }
  return form.querySelector('input[name="type"]:checked')?.value || "file";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function saveFolder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = normalizeFolderName(form.elements.name.value);
  try {
    state = await api("/api/folders", {
      method: "POST",
      body: { name },
    });
    activeFolder = name;
    form.reset();
    form.closest("dialog").close();
    showToast("Subject created.");
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function saveResource(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const type = getResourceType(form);
  const payload = {
    type,
    title: form.elements.title.value,
    subject: form.elements.subject.value,
    unit: form.elements.unit.value,
    teacher: form.elements.teacher.value,
    semester: form.elements.semester.value,
    tags: form.elements.tags.value,
    description: form.elements.description.value,
    pinned: form.elements.pinned.checked,
  };

  if (type === "link") payload.url = form.elements.url.value;
  if (type === "text" || type === "prompt") payload.content = form.elements.content.value;
  if (!id && type === "file") {
    const file = form.elements.file.files[0];
    if (!file) {
      showToast("Choose a file.");
      return;
    }
    payload.file = {
      name: file.name,
      mime: file.type || "application/octet-stream",
      data: await fileToBase64(file),
    };
  }

  try {
    state = await api(id ? `/api/resources/${id}` : "/api/resources", {
      method: id ? "PUT" : "POST",
      body: payload,
    });
    activeFolder = normalizeFolderName(payload.subject);
    activeUnit = cleanFilterValue(payload.unit) || "all";
    activeTeacher = cleanFilterValue(payload.teacher) || "all";
    activeSemester = cleanFilterValue(payload.semester) || "all";
    form.closest("dialog").close();
    showToast(id ? "Resource updated." : "Resource added.");
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleResourceClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  const resource = state.resources.find((item) => item.id === id);

  try {
    if (action === "copy") {
      await navigator.clipboard.writeText(resource.content || "");
      showToast("Copied.");
      return;
    }
    if (action === "bookmark") {
      state = await api(`/api/resources/${id}/bookmark`, { method: "POST", body: {} });
      renderDashboardData();
      return;
    }
    if (action === "helpful") {
      state = await api(`/api/resources/${id}/helpful`, { method: "POST", body: {} });
      renderDashboardData();
      return;
    }
    if (action === "edit") {
      openResourceDialog(resource);
      return;
    }
    if (action === "delete") {
      if (!confirm("Delete this resource?")) return;
      state = await api(`/api/resources/${id}`, { method: "DELETE", body: {} });
      showToast("Resource deleted.");
      renderDashboardData();
      return;
    }
    if (action === "delete-comment") {
      state = await api(`/api/comments/${id}`, { method: "DELETE", body: {} });
      renderDashboardData();
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();
  const form = event.target.closest(".comment-form");
  if (!form) return;
  const resourceId = form.dataset.resourceId;
  const body = form.elements.body.value;
  try {
    state = await api(`/api/resources/${resourceId}/comments`, {
      method: "POST",
      body: { body },
    });
    form.reset();
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function saveChatMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = form.elements.body.value;
  try {
    state = await api("/api/chat", {
      method: "POST",
      body: { body },
    });
    form.reset();
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleChatClick(event) {
  const button = event.target.closest("[data-action='delete-chat']");
  if (!button) return;
  try {
    state = await api(`/api/chat/${button.dataset.id}`, { method: "DELETE", body: {} });
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function saveRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    state = await api("/api/requests", {
      method: "POST",
      body: {
        title: form.elements.title.value,
        subject: form.elements.subject.value,
        unit: form.elements.unit.value,
        teacher: form.elements.teacher.value,
        semester: form.elements.semester.value,
        details: form.elements.details.value,
      },
    });
    activeFolder = normalizeFolderName(form.elements.subject.value);
    activeUnit = cleanFilterValue(form.elements.unit.value) || "all";
    activeTeacher = cleanFilterValue(form.elements.teacher.value) || "all";
    activeSemester = cleanFilterValue(form.elements.semester.value) || "all";
    form.reset();
    form.closest("dialog").close();
    showToast("Request posted.");
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleRequestClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === "toggle-request") {
      state = await api(`/api/requests/${id}`, {
        method: "PATCH",
        body: { fulfilled: button.dataset.fulfilled === "true" },
      });
      renderDashboardData();
    }
    if (action === "delete-request") {
      if (!confirm("Delete this request?")) return;
      state = await api(`/api/requests/${id}`, { method: "DELETE", body: {} });
      renderDashboardData();
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function saveAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    state = await api("/api/announcements", {
      method: "POST",
      body: { text: form.elements.text.value },
    });
    form.reset();
    form.closest("dialog").close();
    showToast("Announcement posted.");
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleAnnouncementClick(event) {
  const button = event.target.closest("[data-action='delete-announcement']");
  if (!button) return;
  if (!confirm("Delete this announcement?")) return;
  try {
    state = await api(`/api/announcements/${button.dataset.id}`, { method: "DELETE", body: {} });
    renderDashboardData();
  } catch (error) {
    showToast(error.message);
  }
}

boot();
