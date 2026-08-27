import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7yOpsjoUr2As3bolEyxB6DNQGOj8xNPU",
  authDomain: "homework-ac523.firebaseapp.com",
  projectId: "homework-ac523",
  storageBucket: "homework-ac523.firebasestorage.app",
  messagingSenderId: "1078534206598",
  appId: "1:1078534206598:web:0cc8b1334851c3cc4f8d07",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s || "").replace(
    /[&<>'"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[c],
  );

let user,
  group,
  tasks = [],
  currentActivities = [],
  activeFilter = "all",
  selectedTask,
  stopTasks,
  stopComments,
  stopGroups,
  stopActivities,
  toastTimer,
  currCalDate = new Date(),
  selectedCalDate = null,
  registerMode = false;

const today = () => new Date().toISOString().slice(0, 10);
const nameOf = () =>
  user?.displayName || user?.email?.split("@")[0] || "เพื่อน";
const initials = (n) => (n || "?").trim().slice(0, 1).toUpperCase();
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const daysAway = (date) =>
  Math.round(
    (new Date(`${date}T12:00`) - new Date(`${today()}T12:00`)) / 864e5,
  );
const fmt = (date) =>
  new Date(`${date}T12:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });

function toast(text) {
  const t = $("#toast");
  if (!t) return;
  $("#toastText").textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function openModal(id) {
  const el = $(`#${id}`);
  if (el) el.classList.add("open");
}

function closeModal(id) {
  const el = $(`#${id}`);
  if (el) el.classList.remove("open");
}

document.querySelectorAll(".auth-tab").forEach(
  (b) =>
    (b.onclick = () => {
      registerMode = b.dataset.auth === "signup";
      document
        .querySelectorAll(".auth-tab")
        .forEach((x) => x.classList.toggle("active", x === b));
      $(".name-field").classList.toggle("hidden", !registerMode);
      $("#displayName").required = registerMode;
      $("#authSubmit").textContent = registerMode
        ? "สร้างบัญชีและเริ่มกลุ่ม"
        : "เข้าสู่ระบบ";

      // ล้างข้อความและรีเซ็ตสีแจ้งเตือน
      $("#authError").textContent = "";
      $("#authError").style.color = "#f06f68";

      // ซ่อนปุ่มลืมรหัสผ่านเมื่ออยู่ในหน้าสมัครสมาชิก
      $("#forgotPasswordBtn").style.display = registerMode
        ? "none"
        : "inline-block";
    }),
);

$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#authError").textContent = "";
  try {
    if (registerMode) {
      const r = await createUserWithEmailAndPassword(
        auth,
        $("#email").value,
        $("#password").value,
      );
      await updateProfile(r.user, {
        displayName: $("#displayName").value.trim(),
      });
    } else {
      await signInWithEmailAndPassword(
        auth,
        $("#email").value,
        $("#password").value,
      );
    }
  } catch (err) {
    const errMap = {
      "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      "auth/email-already-in-use": "อีเมลนี้ถูกใช้งานแล้ว",
      "auth/weak-password": "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร",
    };
    $("#authError").textContent =
      errMap[err.code] || "เข้าสู่ระบบไม่สำเร็จ โปรดลองใหม่อีกครั้ง";
  }
};

onAuthStateChanged(auth, async (u) => {
  user = u;
  if (!u) {
    $("#authScreen").classList.remove("hidden");
    $("#appShell").classList.add("hidden");
    if (stopGroups) stopGroups();
    if (stopTasks) stopTasks();
    if (stopComments) stopComments();
    if (stopActivities) stopActivities();
    return;
  }
  $("#authScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  $("#profileName").textContent = nameOf();
  $("#welcomeName").textContent = nameOf();
  ["profileAvatar", "topAvatar"].forEach((id) => {
    const el = $("#" + id);
    if (el) el.textContent = initials(nameOf());
  });
  await loadGroups();
});

async function loadGroups() {
  if (stopGroups) stopGroups();
  const q = query(
    collection(db, "groups"),
    where("memberIds", "array-contains", user.uid),
  );
  stopGroups = onSnapshot(q, async (snap) => {
    if (snap.empty) {
      await createGroup();
      return;
    }
    const preferred = localStorage.getItem("homie-group");
    group = snap.docs.find((d) => d.id === preferred) || snap.docs[0];
    localStorage.setItem("homie-group", group.id);
    renderGroup();
    subscribeTasks();
  });
}

async function createGroup() {
  const inviteCode = code(),
    data = {
      name: `กลุ่มของ ${nameOf()}`,
      inviteCode,
      memberIds: [user.uid],
      members: { [user.uid]: nameOf() },
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  const ref = await addDoc(collection(db, "groups"), data);
  await setDoc(doc(db, "invites", inviteCode), {
    groupId: ref.id,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
  localStorage.setItem("homie-group", ref.id);
}

function renderGroup() {
  if (!group) return;
  const data = group.data();
  ensureInvite(data);
  $("#groupNameSide").textContent = data.name;
  $("#groupNameHeader").textContent = data.name;
  $("#groupInitial").textContent = initials(data.name);
  $("#inviteCode").textContent = data.inviteCode;
  const members = Object.entries(data.members || {});

  // ปรับปรุงตรงนี้: เพิ่ม data-tooltip และ class เพื่อทำ Tooltip สไตล์ Google
  $("#memberAvatars").innerHTML =
    members
      .slice(0, 5)
      .map(
        ([_, n]) =>
          `<span class="avatar-tooltip" title="${esc(n)}" data-tooltip="${esc(n)}">${esc(initials(n))}</span>`,
      )
      .join("") +
    (members.length > 5
      ? `<i class="avatar-tooltip" title="อีก ${members.length - 5} คน" data-tooltip="อีก ${members.length - 5} คน">+${members.length - 5}</i>`
      : "");

  $("#taskAssignee").innerHTML = `<option value="">ทุกคน</option>${members
    .map(
      ([id, n]) =>
        `<option value="${id}">${esc(n)}${id === user.uid ? " (ฉัน)" : ""}</option>`,
    )
    .join("")}`;
}

async function ensureInvite(data) {
  if (data.createdBy !== user.uid || !data.inviteCode) return;
  const inviteRef = doc(db, "invites", data.inviteCode);
  try {
    if (!(await getDoc(inviteRef)).exists()) {
      await setDoc(inviteRef, {
        groupId: group.id,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn("Invite setup error:", error.code);
  }
}

function subscribeTasks() {
  if (stopTasks) stopTasks();
  stopTasks = onSnapshot(
    query(collection(db, "groups", group.id, "tasks"), orderBy("due", "asc")),
    (snap) => {
      tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
  );
  subscribeActivities();
}

async function logActivity(action, taskTitle) {
  if (!group || !group.id || !user) return;
  try {
    await addDoc(collection(db, "groups", group.id, "activities"), {
      userName: nameOf(),
      userId: user.uid,
      action: action,
      taskTitle: taskTitle,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("ไม่สามารถบันทึกกิจกรรมได้:", err);
  }
}

function subscribeActivities() {
  if (stopActivities) stopActivities();
  const q = query(
    collection(db, "groups", group.id, "activities"),
    orderBy("createdAt", "desc"),
    limit(10),
  );

  stopActivities = onSnapshot(q, (snap) => {
    currentActivities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderActivity(currentActivities);
  });
}

function timeAgo(timestamp) {
  if (!timestamp || !timestamp.toDate) return "เมื่อซักครู่";
  const diffSec = Math.floor((new Date() - timestamp.toDate()) / 1000);
  if (diffSec < 60) return "เมื่อซักครู่";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชม. ที่แล้ว`;
  return fmt(timestamp.toDate().toISOString().slice(0, 10));
}

function renderActivity(activities = currentActivities) {
  const container = $("#activityList");
  const fullContainer = $("#fullActivityList");

  let html = "";
  if (!activities || !activities.length) {
    const items = [...(tasks || [])]
      .sort(
        (a, b) => (b?.updatedAt?.seconds || 0) - (a?.updatedAt?.seconds || 0),
      )
      .slice(0, 5);

    html =
      items
        .map((t) => {
          const author = t.updatedByName || t.createdByName || "สมาชิก";
          const isDone = t.completedBy && t.completedBy.length > 0;
          const actionLabel = isDone ? "ทำเสร็จแล้ว" : "อัปเดตงาน";
          const actionClass = isDone ? "act-done" : "act-update";
          const timeText = timeAgo(t.updatedAt);

          return `<div class="activity-row">
            <span class="avatar-sm">${esc(initials(author))}</span>
            <div class="activity-content">
              <div class="activity-header">
                <b>${esc(author)}</b>
                <span class="act-badge ${actionClass}">${actionLabel}</span>
              </div>
              <p class="activity-title">${esc(t.title || "")}</p>
              <small class="activity-time">◷ ${timeText}</small>
            </div>
          </div>`;
        })
        .join("") || '<p class="tiny-empty">รอกิจกรรมแรกของกลุ่ม</p>';
  } else {
    html = activities
      .map((a) => {
        const author = a.userName || "สมาชิก";
        const action = a.action || "อัปเดตงาน";
        let actionClass = "act-update";
        if (action.includes("เสร็จ")) actionClass = "act-done";
        if (action.includes("สร้าง")) actionClass = "act-create";
        if (action.includes("ความเห็น")) actionClass = "act-comment";

        return `<div class="activity-row">
          <span class="avatar-sm">${esc(initials(author))}</span>
          <div class="activity-content">
            <div class="activity-header">
              <b>${esc(author)}</b>
              <span class="act-badge ${actionClass}">${esc(action)}</span>
            </div>
            <p class="activity-title">${esc(a.taskTitle || "")}</p>
            <small class="activity-time">◷ ${timeAgo(a.createdAt)}</small>
          </div>
        </div>`;
      })
      .join("");
  }

  if (container) container.innerHTML = html;
  if (fullContainer) fullContainer.innerHTML = html;
}

function render() {
  // 1. ดึงข้อมูลสมาชิกทั้งหมดในกลุ่ม
  const membersObj = (group && group.data && group.data().members) || {};
  const memberUids = Object.keys(membersObj);
  const totalMembers = memberUids.length || 1; // กันหารด้วย 0
  const done = tasks.filter(
    (t) => t.completedBy && t.completedBy.length > 0,
  ).length;
  // 2. งานทั้งหมดแบบนับทุกคนจริงๆ (จำนวนงาน x จำนวนสมาชิก)
  const totalGroupTasks = tasks.length * totalMembers;

  // 3. นับงานที่สมาชิกทุกคนติ๊กเสร็จแล้วจริงๆ จาก completedBy ของทุก task
  const totalCompleted = tasks.reduce((sum, t) => {
    return sum + (t.completedBy ? t.completedBy.length : 0);
  }, 0);

  // 4. คำนวณเปอร์เซ็นต์ความคืบหน้า
  const progressPercent = totalGroupTasks
    ? Math.round((totalCompleted / totalGroupTasks) * 100)
    : 0;

  // 5. คำนวณงานที่ค้างเฉพาะของ "ผู้ใช้งานปัจจุบัน (User)"
  const myPendingTasks = tasks.filter(
    (t) => !t.completedBy || !t.completedBy.includes(user?.uid),
  ).length;

  // 6. คำนวณงานด่วนเฉพาะของ User (ส่งภายใน 3 วัน)
  const urgent = tasks.filter(
    (t) =>
      (!t.completedBy || !t.completedBy.includes(user?.uid)) &&
      daysAway(t.due) >= 0 &&
      daysAway(t.due) <= 3,
  ).length;

  // --- แสดงผลบน Dashboard ---
  $("#totalCount").textContent = tasks.length;
  $("#urgentCount").textContent = urgent;
  $("#completedCount").textContent = done;
  $("#progressCount").textContent = `${progressPercent}%`;
  $("#sidebarTaskCount").textContent = myPendingTasks;

  $("#motivation").textContent = myPendingTasks
    ? `คุณยังมีงานค้างอยู่อีก ${myPendingTasks} งาน ช่วยกันเคลียร์นะ!`
    : "คุณทำครบทุกงานแล้ว เยี่ยมมาก!";

  renderTasks();
  renderDue();
  renderActivity();
  renderCalendar();
}

function filtered() {
  const term = $("#searchInput").value.toLowerCase();
  return tasks.filter((t) => {
    const isDone = t.completedBy && t.completedBy.length > 0;
    const ok =
      activeFilter === "all" ||
      (activeFilter === "mine" &&
        (t.assigneeId === user.uid ||
          !t.assigneeId ||
          t.assigneeName === "ทุกคน")) ||
      (activeFilter === "week" &&
        daysAway(t.due) >= 0 &&
        daysAway(t.due) <= 7) ||
      (activeFilter === "done" && isDone);
    return (
      ok &&
      `${t.title} ${t.subject} ${t.note || ""}`.toLowerCase().includes(term)
    );
  });
}

function due(t) {
  const d = daysAway(t.due);
  return d === 0
    ? "วันนี้"
    : d === 1
      ? "พรุ่งนี้"
      : d < 0
        ? `เลยกำหนด ${-d} วัน`
        : fmt(t.due);
}

function renderTasks() {
  const list = filtered();
  const members = (group && group.data && group.data().members) || {};

  $("#taskList").innerHTML = list.length
    ? list
        .map((t) => {
          const completedUids = t.completedBy || [];
          const doneNames = completedUids
            .map((uid) => members[uid] || "สมาชิก")
            .join(", ");

          const doneStatusText = doneNames
            ? `<span class="done-by-text">✓ ทำแล้ว: ${esc(doneNames)}</span>`
            : `<span class="pending-text">ยังไม่มีคนทำเสร็จ</span>`;

          const isMyView = activeFilter === "mine";
          const isDoneByMe = completedUids.includes(user?.uid);

          // แท็กแสดงคะแนนและแพลตฟอร์ม
          const platformPill = t.platform
            ? `<span class="subject-pill" style="background: rgba(102, 88, 232, 0.1); color: var(--primary);">📤 ${esc(t.platform)}</span>`
            : "";
          const scorePill =
            t.score !== undefined && t.score !== ""
              ? `<span class="subject-pill" style="background: rgba(243, 173, 76, 0.15); color: #d97706;">💯 ${t.score} คะแนน</span>`
              : "";

          return `
          <article class="task-item ${isDoneByMe ? "done" : ""}" data-id="${t.id}">
            ${isMyView ? `<button class="check-button" data-action="done">${isDoneByMe ? "✓" : ""}</button>` : ""}
            <button class="task-open" data-action="detail">
              <span class="task-title">${esc(t.title)}</span>
              <span class="task-meta">
                <span class="subject-pill subject-cs">${esc(t.subject)}</span>
                ${platformPill}
                ${scorePill}
                <span class="assignee">${esc(t.assigneeName || "ทุกคน")}</span>
                <span class="due-date">◷ ${due(t)}</span>
              </span>
              <div class="task-completed-status">
                ${doneStatusText}
              </div>
            </button>
            <div class="task-actions">
              <span class="priority-dot ${esc(t.priority || "medium")}"></span>
              <button class="edit-task" data-action="edit" title="แก้ไขงาน">✎</button>
            </div>
          </article>
        `;
        })
        .join("")
    : '<div class="empty-list">ยังไม่มีงานในรายการนี้</div>';
}

function renderDue() {
  $("#dueList").innerHTML =
    tasks
      .filter((t) => !t.completedBy || !t.completedBy.includes(user?.uid))
      .slice(0, 4)
      .map(
        (t) =>
          `<button class="due-row" data-task="${t.id}">
            <div class="due-row-main">
              <b class="due-row-title">${esc(t.title)}</b>
              <div class="due-row-meta">
                <span class="subject-pill subject-cs">${esc(t.subject)}</span>
              </div>
            </div>
            <span class="due-tag">◷ ${due(t)}</span>
          </button>`,
      )
      .join("") || '<p class="tiny-empty">ยังไม่มีงานค้าง</p>';
}

function renderCalendar() {
  const year = currCalDate.getFullYear();
  const month = currCalDate.getMonth();

  const monthNames = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  $("#calendarMonthYear").textContent = `${monthNames[month]} ${year + 543}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  let html = "";

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    html += `<div class="cal-day-cell other-month"><span class="cal-day-num">${d}</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayTasks = tasks.filter((t) => t.due === dateStr);
    const isToday = dateStr === today();
    const isSelected = selectedCalDate === dateStr;

    let dotsHtml = "";
    if (dayTasks.length > 0) {
      const hasDone = dayTasks.some(
        (t) => t.completedBy && t.completedBy.length > 0,
      );
      const hasUrgent = dayTasks.some(
        (t) =>
          (!t.completedBy || !t.completedBy.includes(user?.uid)) &&
          daysAway(t.due) <= 3,
      );
      const hasNormal = dayTasks.some(
        (t) =>
          (!t.completedBy || !t.completedBy.includes(user?.uid)) &&
          daysAway(t.due) > 3,
      );

      if (hasUrgent)
        dotsHtml += `<i class="dot peach" title="มีงานด่วน/ใกล้ส่ง"></i>`;
      if (hasNormal) dotsHtml += `<i class="dot lilac" title="มีกำหนดส่ง"></i>`;
      if (hasDone) dotsHtml += `<i class="dot green" title="งานเสร็จแล้ว"></i>`;
    }

    html += `
      <div class="cal-day-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        <div class="cal-day-dots">${dotsHtml}</div>
      </div>
    `;
  }

  const totalCells = firstDay + daysInMonth;
  const nextDays = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= nextDays; i++) {
    html += `<div class="cal-day-cell other-month"><span class="cal-day-num">${i}</span></div>`;
  }

  $("#calendarGrid").innerHTML = html;
  renderCalendarTasks();
}

function renderCalendarTasks() {
  let list = [];
  const members = (group && group.data && group.data().members) || {};

  if (selectedCalDate) {
    list = tasks.filter((t) => t.due === selectedCalDate);
    $("#selectedDateTitle").textContent =
      `งานกำหนดส่งวันที่ ${fmt(selectedCalDate)}`;
    $("#selectedDateSub").textContent = `พบ ${list.length} รายการ`;
  } else {
    const monthStr = `${currCalDate.getFullYear()}-${String(currCalDate.getMonth() + 1).padStart(2, "0")}`;
    list = tasks.filter((t) => t.due && t.due.startsWith(monthStr));
    $("#selectedDateTitle").textContent = "งานทั้งหมดในเดือนนี้";
    $("#selectedDateSub").textContent = `พบ ${list.length} รายการในเดือนนี้`;
  }

  $("#calendarTaskList").innerHTML = list.length
    ? list
        .map((t) => {
          const completedUids = t.completedBy || [];
          const doneNames = completedUids
            .map((uid) => members[uid] || "สมาชิก")
            .join(", ");
          const doneText = doneNames
            ? `<div class="cal-done-users" style="font-size: 11px; color: #44ac82; margin-top: 4px;">✓ ทำแล้ว: ${esc(doneNames)}</div>`
            : "";
          const isDoneByMe = completedUids.includes(user?.uid);

          return `<article class="task-item ${isDoneByMe ? "done" : ""}" data-id="${t.id}">
              <button class="check-button" data-action="done">${isDoneByMe ? "✓" : ""}</button>
              <button class="task-open" data-action="detail">
                <span class="task-title">${esc(t.title)}</span>
                <span class="task-meta">
                  <span class="subject-pill subject-cs">${esc(t.subject)}</span>
                  <span class="assignee">${esc(t.assigneeName || "ทุกคน")}</span>
                  <span class="due-date">◷ ${due(t)}</span>
                </span>
                ${doneText}
              </button>
              <div class="task-actions">
                <span class="priority-dot ${esc(t.priority || "medium")}"></span>
                <button class="edit-task" data-action="edit">✎</button>
              </div>
            </article>`;
        })
        .join("")
    : '<div class="empty-list"><span>☁</span> ไม่มีรายการงานในวันที่เลือก</div>';
}

function openTask(id) {
  const t = id ? tasks.find((x) => x.id === id) : null;
  $("#taskForm").reset();
  $("#taskId").value = t?.id || "";
  $("#taskModalTitle").textContent = t ? "แก้ไขงาน" : "เพิ่มงานใหม่";

  if (t) {
    $("#taskTitle").value = t.title || "";
    $("#taskSubject").value = t.subject || "";
    $("#taskSection").value = t.section || "section650001";
    $("#taskDue").value = t.due || "";
    $("#taskAssignee").value = t.assigneeId || "";
    $("#taskPriority").value = t.priority || "medium";
    $("#taskLink").value = t.link || "";
    $("#taskNote").value = t.note || "";
    $("#taskPlatform").value = t.platform || "MS Teams";
    $("#taskScore").value = t.score !== undefined ? t.score : "";
  } else {
    $("#taskSection").value = "section650001";
    $("#taskDue").value = today();
    $("#taskPlatform").value = "MS Teams";
    $("#taskScore").value = "";
  }
  openModal("taskModal");
}

async function showDetail(id) {
  selectedTask = tasks.find((t) => t.id === id);
  if (!selectedTask) return;
  const t = selectedTask;

  const linkHtml = t.link
    ? `<p class="detail-link"><b>🔗 ลิงก์ประกอบ:</b> <a href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">${esc(t.link)}</a></p>`
    : "";

  const isDoneByMe = (t.completedBy || []).includes(user?.uid);

  // เพิ่มส่วนแสดงผล คะแนน และ ช่องทางการส่งงาน
  const scoreHtml =
    t.score !== undefined && t.score !== ""
      ? `<p class="detail-score"><b>💯 คะแนน:</b> ${t.score} คะแนน</p>`
      : "";
  const platformHtml = t.platform
    ? `<p class="detail-platform"><b>📤 ส่งใน:</b> ${esc(t.platform)}</p>`
    : "";

  $("#taskDetail").innerHTML = `
    <div class="detail-head">
      <span class="subject-pill subject-cs">${esc(t.subject)}</span>
      <span class="subject-pill subject-ba">${esc(t.section || "section650001")}</span>
      <h2>${esc(t.title)}</h2>
      <p>รับผิดชอบโดย <b>${esc(t.assigneeName || "ทุกคน")}</b> · ส่ง ${due(t)}</p>
      ${platformHtml}
      ${scoreHtml}
      ${linkHtml}
      <div class="detail-note">${esc(t.note || "ไม่มีรายละเอียดเพิ่มเติม").replace(/\n/g, "<br>")}</div>
      <button id="detailDone" class="secondary-button">${isDoneByMe ? "ยกเลิกทำเครื่องหมายเสร็จ" : "ทำเครื่องหมายว่าเสร็จ"}</button>
    </div>
  `;

  $("#detailDone").onclick = () => toggleDone(t.id);
  subscribeComments(t.id);
  openModal("detailModal");
}

function subscribeComments(taskId) {
  if (stopComments) stopComments();
  const q = query(
    collection(db, "groups", group.id, "tasks", taskId, "comments"),
    orderBy("createdAt", "asc"),
  );
  stopComments = onSnapshot(q, (snap) => {
    const comments = snap.docs.map((d) => d.data());
    $("#commentList").innerHTML = comments.length
      ? comments
          .map(
            (c) =>
              `<div class="comment"><span>${esc(initials(c.authorName))}</span><p><b>${esc(c.authorName)}</b>${esc(c.text)}</p></div>`,
          )
          .join("")
      : '<p class="tiny-empty">ยังไม่มีความคิดเห็น</p>';
  });
}

async function toggleDone(taskId) {
  const t = tasks.find((x) => x.id === taskId);
  if (!t || !user) return;

  const completedList = t.completedBy || [];
  const isDoneByMe = completedList.includes(user.uid);
  const taskRef = doc(db, "groups", group.id, "tasks", taskId);

  if (isDoneByMe) {
    await updateDoc(taskRef, {
      completedBy: arrayRemove(user.uid),
      updatedAt: serverTimestamp(),
    });
    await logActivity("ยกเลิกการส่งงาน", t.title);
    toast("ยกเลิกทำเครื่องหมายว่าเสร็จแล้ว");
  } else {
    await updateDoc(taskRef, {
      completedBy: arrayUnion(user.uid),
      updatedAt: serverTimestamp(),
    });
    await logActivity("ทำเสร็จแล้ว", t.title);
    toast("เก่งมาก! ทำงานนี้เสร็จแล้ว");
  }
}

function initTheme() {
  const isDark = localStorage.getItem("homie-theme") === "dark";
  document.body.classList.toggle("dark", isDark);
  $("#themeToggle").textContent = isDark ? "☀" : "☾";
}

$("#themeToggle").onclick = () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("homie-theme", isDark ? "dark" : "light");
  $("#themeToggle").textContent = isDark ? "☀" : "☾";
};

const toggleMobileSidebar = (open) => {
  const sidebar = $("#sidebar");
  const overlay = $("#sidebarOverlay");
  const isOpen =
    open !== undefined ? open : !sidebar.classList.contains("open");

  sidebar.classList.toggle("open", isOpen);
  if (overlay) overlay.classList.toggle("show", isOpen);
};

$("#mobileMenu").onclick = () => toggleMobileSidebar(true);
if ($("#sidebarOverlay")) {
  $("#sidebarOverlay").onclick = () => toggleMobileSidebar(false);
}

initTheme();

$("#taskForm").onsubmit = async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "กำลังบันทึก...";

  try {
    if (!group || !group.id) throw new Error("ไม่พบข้อมูลกลุ่ม");

    const id = $("#taskId").value,
      assignee = $("#taskAssignee").value,
      members = (group.data && group.data().members) || {};

    const taskTitle = $("#taskTitle").value.trim();
    const baseData = {
      title: taskTitle,
      subject: $("#taskSubject").value.trim(),
      section: $("#taskSection")
        ? $("#taskSection").value.trim()
        : "section650001",
      due: $("#taskDue").value,
      priority: $("#taskPriority").value,
      link: $("#taskLink") ? $("#taskLink").value.trim() : "",
      platform: $("#taskPlatform").value,
      score: $("#taskScore").value !== "" ? Number($("#taskScore").value) : 0,
      note: $("#taskNote").value.trim(),
      updatedAt: serverTimestamp(),
      updatedByName: nameOf(),
    };

    if (id) {
      // กรณีแก้ไขงานเดิม
      const data = {
        ...baseData,
        assigneeId: assignee || "",
        assigneeName: assignee ? members[assignee] || "" : "ทุกคน",
      };
      await updateDoc(doc(db, "groups", group.id, "tasks", id), data);
      await logActivity("แก้ไขงาน", taskTitle);
      toast("อัปเดตงานแล้ว");
    } else {
    if (!assignee) {
      // --- เลือก "ทุกคน" : ระบบจะวนลูปแจกงานให้สมาชิกทุกคนในกลุ่ม ---
      const memberEntries = Object.entries(members);
      const promises = memberEntries.map(([mUid, mName]) => {
        return addDoc(collection(db, "groups", group.id, "tasks"), {
          ...baseData,
          assigneeId: mUid,
          assigneeName: mName,
          status: "todo",
          completedBy: [],
          createdBy: user ? user.uid : "",
          createdByName: nameOf(),
          createdAt: serverTimestamp(),
        });
      });
      await Promise.all(promises);
      await logActivity("สร้างงานใหม่ (มอบหมายทุกคน)", taskTitle);
      toast(
        `เพิ่มงานให้สมาชิกทุกคน (${memberEntries.length} คน) เรียบร้อยแล้ว`,
      );
    } else {
      // --- เลือกมอบหมายให้คนใดคนหนึ่ง ---
      await addDoc(collection(db, "groups", group.id, "tasks"), {
        ...baseData,
        assigneeId: assignee,
        assigneeName: members[assignee] || "",
        status: "todo",
        completedBy: [],
        createdBy: user ? user.uid : "",
        createdByName: nameOf(),
        createdAt: serverTimestamp(),
      });
      await logActivity("สร้างงานใหม่", taskTitle);
      toast("เพิ่มงานใหม่ให้กลุ่มแล้ว");
    }
  }

    closeModal("taskModal");
    $("#taskForm").reset();
  } catch (err) {
    console.error("Task Form Error:", err);
    alert(
      "เกิดข้อผิดพลาดในการบันทึก: " + (err.message || "กรุณาลองใหม่อีกครั้ง"),
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "บันทึกงาน";
  }
};

$("#commentForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!selectedTask) return;
  const text = $("#commentInput").value.trim();
  if (!text) return;

  await addDoc(
    collection(db, "groups", group.id, "tasks", selectedTask.id, "comments"),
    {
      text,
      authorId: user.uid,
      authorName: nameOf(),
      createdAt: serverTimestamp(),
    },
  );

  await logActivity("แสดงความคิดเห็นใน", selectedTask.title);
  $("#commentInput").value = "";
};

$("#taskList").onclick = (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const id = b.closest(".task-item").dataset.id;
  if (b.dataset.action === "done") toggleDone(id);
  if (b.dataset.action === "edit") openTask(id);
  if (b.dataset.action === "detail") showDetail(id);
};

$("#dueList").onclick = (e) => {
  const row = e.target.closest("[data-task]");
  if (row) showDetail(row.dataset.task);
};

["newTaskButton", "addInlineButton"].forEach((id) => {
  const btn = $("#" + id);
  if (btn) btn.onclick = () => openTask();
});

$("#showAllTasks").onclick = () => {
  activeFilter = "all";
  document
    .querySelectorAll(".filter-tab")
    .forEach((x) => x.classList.toggle("active", x.dataset.filter === "all"));
  renderTasks();
};

document.querySelectorAll(".filter-tab").forEach(
  (b) =>
    (b.onclick = () => {
      activeFilter = b.dataset.filter;
      document
        .querySelectorAll(".filter-tab")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderTasks();
    }),
);

$("#searchInput").oninput = renderTasks;
$("#inviteButton").onclick = () => openModal("inviteModal");
$("#groupSwitcher").onclick = () => openModal("inviteModal");

$("#copyInvite").onclick = async () => {
  await navigator.clipboard.writeText(group.data().inviteCode);
  toast("คัดลอกรหัสเชิญแล้ว");
};

$("#joinForm").onsubmit = async (e) => {
  e.preventDefault();
  const c = $("#joinCode").value.trim().toUpperCase();
  $("#joinError").textContent = "";
  try {
    const invite = await getDoc(doc(db, "invites", c));
    if (!invite.exists()) {
      $("#joinError").textContent =
        "ไม่พบรหัสเชิญนี้ กรุณาตรวจสอบ 6 ตัวอักษรอีกครั้ง";
      return;
    }
    const g = invite.data().groupId;
    await updateDoc(doc(db, "groups", g), {
      memberIds: arrayUnion(user.uid),
      [`members.${user.uid}`]: nameOf(),
      lastJoinCode: c,
      updatedAt: serverTimestamp(),
    });
    localStorage.setItem("homie-group", g);
    closeModal("inviteModal");
    toast("เข้าร่วมกลุ่มสำเร็จแล้ว");
  } catch (error) {
    $("#joinError").textContent =
      error.code === "permission-denied"
        ? "กลุ่มยังไม่ได้อัปเดตกฎ Firestore โปรดให้เจ้าของกลุ่ม Publish กฎล่าสุด"
        : "เข้าร่วมกลุ่มไม่สำเร็จ โปรดลองใหม่";
  }
};

document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => closeModal(b.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(
  (m) =>
    (m.onclick = (e) => {
      if (e.target === m) closeModal(m.id);
    }),
);

document.querySelectorAll(".nav-item").forEach(
  (b) =>
    (b.onclick = () => {
      const v = b.dataset.view;
      document
        .querySelectorAll(".nav-item")
        .forEach((x) => x.classList.toggle("active", x === b));
      $("#viewTitle").textContent =
        {
          board: "ภาพรวม",
          tasks: "งานส่วนตัว",
          calendar: "ปฏิทิน",
          activity: "กิจกรรม",
        }[v] || "ภาพรวม";

      $("#boardView").classList.toggle(
        "hidden",
        !["board", "tasks"].includes(v),
      );
      $("#calendarView").classList.toggle("hidden", v !== "calendar");
      $("#activityView").classList.toggle("hidden", v !== "activity");

      if (v === "tasks") {
        activeFilter = "mine";
        document
          .querySelectorAll(".filter-tab")
          .forEach((x) =>
            x.classList.toggle("active", x.dataset.filter === "mine"),
          );
        renderTasks();
      } else if (v === "board") {
        activeFilter = "all";
        document
          .querySelectorAll(".filter-tab")
          .forEach((x) =>
            x.classList.toggle("active", x.dataset.filter === "all"),
          );
        renderTasks();
      }
      if (v === "calendar") {
        renderCalendar();
      }
      toggleMobileSidebar(false);
    }),
);

$("#logoutButton").onclick = () => signOut(auth);

// ของใหม่ (แสดงชื่อสมาชิกทั้งหมดใน Toast)
$("#openMembers").onclick = () => {
  const membersObj = group?.data()?.members || {};
  const names = Object.values(membersObj).join(", ");
  const count = Object.keys(membersObj).length;

  toast(`สมาชิก (${count} คน): ${names || "ไม่มีข้อมูล"}`);
};

$("#todayLabel").textContent = new Intl.DateTimeFormat("th-TH", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

$("#prevMonth").onclick = () => {
  currCalDate.setMonth(currCalDate.getMonth() - 1);
  selectedCalDate = null;
  renderCalendar();
};

$("#nextMonth").onclick = () => {
  currCalDate.setMonth(currCalDate.getMonth() + 1);
  selectedCalDate = null;
  renderCalendar();
};

$("#todayMonth").onclick = () => {
  currCalDate = new Date();
  selectedCalDate = today();
  renderCalendar();
};

$("#calendarGrid").onclick = (e) => {
  const cell = e.target.closest(".cal-day-cell[data-date]");
  if (!cell) return;
  selectedCalDate = cell.dataset.date;
  renderCalendar();
};

$("#clearDateFilter").onclick = () => {
  selectedCalDate = null;
  renderCalendar();
};

$("#calendarTaskList").onclick = (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const id = b.closest(".task-item").dataset.id;
  if (b.dataset.action === "done") toggleDone(id);
  if (b.dataset.action === "edit") openTask(id);
  if (b.dataset.action === "detail") showDetail(id);
};

// ระบบลืมรหัสผ่าน (Reset Password)
$("#forgotPasswordBtn").onclick = async () => {
  const email = $("#email").value.trim();

  if (!email) {
    $("#authError").textContent = "กรุณากรอกอีเมลก่อนกดลืมรหัสผ่าน";
    $("#email").focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    $("#authError").style.color = "#44ac82"; // เปลี่ยนเป็นสีเขียวแจ้งเตือนความสำเร็จ
    $("#authError").textContent =
      "ส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณแล้ว";
  } catch (err) {
    $("#authError").style.color = "#f06f68"; // สีแดงแจ้งเตือน Error
    const errMap = {
      "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
      "auth/user-not-found": "ไม่พบบัญชีผู้ใช้นี้ในระบบ",
    };
    $("#authError").textContent =
      errMap[err.code] ||
      "ไม่สามารถส่งอีเมลรีเซ็ตรหัสผ่านได้ โปรดลองใหม่อีกครั้ง";
  }
};
