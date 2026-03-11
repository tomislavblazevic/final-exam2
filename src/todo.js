import { initFirebaseFromWindow, initialized, signInWithGoogle, signOut as fbSignOut, onAuthChange, subscribeToUserTasks, writeTask, deleteTask as fbDeleteTask } from './firebase.js';

const STORAGE_KEY = 'todo.tasks.v1';

let tasks = [];
let currentUser = null;
let unsubscribeRemote = null;
let searchTerm = '';
let sortBy = 'new';
let modalState = { open: false, taskId: null, prevFocus: null };
let inlineState = { editingId: null };
let visibleTasksCache = [];
let selectedIndex = -1;
let selectedId = null;

function load() {
  try {
    tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    tasks = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.id = task.id;
  li.tabIndex = 0;
  if (selectedId === task.id) li.classList.add('selected');

  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = !!task.done;
  chk.addEventListener('change', () => toggleDone(task.id));

  const span = document.createElement('div');
  span.className = 'text' + (task.done ? ' done' : '');
  span.textContent = task.text;
  span.title = 'Double-click to edit';
  span.addEventListener('dblclick', () => openInlineEditor(task.id));
  // click to select
  li.addEventListener('click', (e) => { selectedId = task.id; render(); });
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter') openInlineEditor(task.id); });

  const meta = document.createElement('div');
  meta.className = 'meta';

  if (task.priority) {
    const p = document.createElement('span');
    p.className = 'badge ' + (task.priority === 'high' ? 'priority-high' : task.priority === 'medium' ? 'priority-medium' : 'priority-low');
    p.textContent = task.priority[0].toUpperCase() + task.priority.slice(1);
    meta.appendChild(p);
  }

  if (task.due) {
    const due = document.createElement('span');
    due.className = 'due';
    try {
      due.textContent = new Date(task.due).toLocaleDateString();
    } catch (e) {
      due.textContent = task.due;
    }
    meta.appendChild(due);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openEditModal(task.id));

  const delBtn = document.createElement('button');
  delBtn.className = 'btn';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => deleteTask(task.id));

  li.appendChild(chk);
  const wrap = document.createElement('div');
  wrap.style.flex = '1';
  wrap.appendChild(span);
  wrap.appendChild(meta);
  if (task.notes) {
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.textContent = task.notes;
    wrap.appendChild(notes);
  }
  li.appendChild(wrap);
  li.appendChild(editBtn);
  li.appendChild(delBtn);
  return li;
}

function openInlineEditor(id) {
  // guard: only one inline editor at a time
  if (inlineState.editingId) return;
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (!li) return;
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const textEl = li.querySelector('.text');
  if (!textEl) return;

  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = t.text || '';
  inlineState.editingId = id;

  // replace text element with input
  textEl.replaceWith(input);
  input.focus();
  input.select();

  function finish(save) {
    inlineState.editingId = null;
    if (save) {
      t.text = input.value.trim() || t.text;
      save();
      // persist remote
      if (currentUser) writeTask(currentUser.uid, t).catch(err => console.error(err));
    }
    render();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function render() {
  const list = document.getElementById('todo-list');
  if (!list) return;
  list.innerHTML = '';
  // apply search filter
  let visible = tasks.filter(t => !searchTerm || (t.text && t.text.toLowerCase().includes(searchTerm)) || (t.notes && t.notes.toLowerCase().includes(searchTerm)));
  // apply sort
  if (sortBy === 'due') {
    visible.sort((a,b) => {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due) - new Date(b.due);
    });
  } else if (sortBy === 'priority') {
    const order = { high: 0, medium: 1, low: 2 };
    visible.sort((a,b) => (order[a.priority]||1) - (order[b.priority]||1));
  } else {
    visible.sort((a,b) => Number(b.id) - Number(a.id));
  }
  visible.forEach(task => list.appendChild(createTaskElement(task)));
  visibleTasksCache = visible;
  // ensure selection stays within visible bounds
  if (selectedId) {
    const idx = visibleTasksCache.findIndex(t => t.id === selectedId);
    if (idx === -1) { selectedId = null; selectedIndex = -1; }
    else selectedIndex = idx;
  } else {
    selectedIndex = -1;
  }
}

function addTask(text, due = '', priority = 'medium', notes = '') {
  const t = { id: Date.now().toString(), text: text.trim(), done: false, due: due || '', priority: priority || 'medium', notes: notes || '' };
  if (!t.text) return;
  tasks.unshift(t);
  save();
  render();
  if (currentUser) writeTask(currentUser.uid, t).catch(err => console.error(err));
}

function toggleDone(id) {
  const i = tasks.findIndex(t => t.id === id);
  if (i === -1) return;
  tasks[i].done = !tasks[i].done;
  save();
  render();
  if (currentUser) writeTask(currentUser.uid, tasks[i]).catch(err => console.error(err));
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  save();
  render();
  if (currentUser) fbDeleteTask(currentUser.uid, id).catch(err => console.error(err));
}

function editTask(id) {
  // fallback: open modal for edit
  openEditModal(id);
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  render();

  const input = document.getElementById('todo-input');
  const form = document.getElementById('todo-form');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    const due = document.getElementById('todo-due').value;
    const priority = document.getElementById('todo-priority').value;
    const notes = document.getElementById('todo-notes').value;
    if (v && v.trim()) addTask(v, due, priority, notes);
    input.value = '';
    document.getElementById('todo-due').value = '';
    document.getElementById('todo-priority').value = 'medium';
    document.getElementById('todo-notes').value = '';
    input.focus();
  });

  // keyboard shortcut: Ctrl+Enter add
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const v = input.value;
      const due = document.getElementById('todo-due').value;
      const priority = document.getElementById('todo-priority').value;
      const notes = document.getElementById('todo-notes').value;
      if (v && v.trim()) addTask(v, due, priority, notes);
      input.value = '';
      document.getElementById('todo-due').value = '';
      document.getElementById('todo-priority').value = 'medium';
      document.getElementById('todo-notes').value = '';
    }
  });

  // Sync buttons
  const pushBtn = document.getElementById('sync-push');
  const pullBtn = document.getElementById('sync-pull');
  if (pushBtn) pushBtn.addEventListener('click', pushSync);
  if (pullBtn) pullBtn.addEventListener('click', pullSync);

  // Search and sort
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-by');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => { searchTerm = (e.target.value || '').toLowerCase(); render(); });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => { sortBy = e.target.value; render(); });
  }

  // Modal elements
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalSave = document.getElementById('modal-save');
  const modalTitleInput = document.getElementById('modal-title-input');
  const modalDue = document.getElementById('modal-due');
  const modalPriority = document.getElementById('modal-priority');
  const modalNotes = document.getElementById('modal-notes');

  function openEditModal(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    modalState.prevFocus = document.activeElement;
    modalState.open = true;
    modalState.taskId = id;
    modalTitleInput.value = t.text || '';
    modalDue.value = t.due || '';
    modalPriority.value = t.priority || 'medium';
    modalNotes.value = t.notes || '';
    modalOverlay.hidden = false;
    setTimeout(() => modalTitleInput.focus(), 50);
  }

  function closeModal() {
    modalState.open = false;
    modalState.taskId = null;
    modalOverlay.hidden = true;
    if (modalState.prevFocus) modalState.prevFocus.focus();
  }

  function saveModal() {
    const id = modalState.taskId;
    if (!id) return closeModal();
    const t = tasks.find(x => x.id === id);
    if (!t) return closeModal();
    t.text = modalTitleInput.value.trim();
    t.due = modalDue.value || '';
    t.priority = modalPriority.value || 'medium';
    t.notes = modalNotes.value || '';
    save();
    render();
    if (currentUser) writeTask(currentUser.uid, t).catch(err => console.error(err));
    closeModal();
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalCancel) modalCancel.addEventListener('click', closeModal);
  if (modalSave) modalSave.addEventListener('click', saveModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  // Keyboard shortcuts and navigation
  function focusSearchInput() {
    if (searchInput) { searchInput.focus(); searchInput.select(); }
  }
  function focusNewInput() { input.focus(); }

  function selectAtIndex(i) {
    if (!visibleTasksCache || visibleTasksCache.length === 0) { selectedId = null; selectedIndex = -1; render(); return; }
    if (i < 0) i = 0;
    if (i >= visibleTasksCache.length) i = visibleTasksCache.length - 1;
    selectedIndex = i;
    selectedId = visibleTasksCache[i].id;
    render();
    const el = document.querySelector(`li[data-id="${selectedId}"]`);
    if (el) el.focus();
  }
  function selectNext() { selectAtIndex((selectedIndex === -1 ? 0 : selectedIndex + 1)); }
  function selectPrev() { selectAtIndex((selectedIndex === -1 ? 0 : selectedIndex - 1)); }
  function toggleSelectedDone() { if (!selectedId) return; toggleDone(selectedId); }
  function deleteSelected() { if (!selectedId) return; if (confirm('Delete selected task?')) deleteTask(selectedId); }
  function openSelectedInline() { if (!selectedId) return; openInlineEditor(selectedId); }

  document.addEventListener('keydown', (e) => {
    // modal has priority
    if (modalState.open) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveModal(); }
      if (e.key === 'Escape') closeModal();
      return;
    }
    // inline editor handles its own keys
    if (inlineState.editingId) return;

    // Global shortcuts
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); focusSearchInput(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearchInput(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); focusNewInput(); return; }

    // navigation
    if (e.key === 'j') { e.preventDefault(); selectNext(); return; }
    if (e.key === 'k') { e.preventDefault(); selectPrev(); return; }

    // actions
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); toggleSelectedDone(); return; }
    if (e.key === 'e') { e.preventDefault(); openSelectedInline(); return; }
    if (e.key === 'd' || e.key === 'Delete') { e.preventDefault(); deleteSelected(); return; }
    if (e.key === 'Enter' && selectedId) { e.preventDefault(); openSelectedInline(); return; }
  });

  // Help overlay (toggle with ?)
  let helpOverlay = null;
  function openHelp() {
    if (helpOverlay) return;
    const hintBtn = document.getElementById('shortcut-hint');
    if (hintBtn) hintBtn.setAttribute('aria-expanded', 'true');
    helpOverlay = document.createElement('div');
    helpOverlay.className = 'help-overlay';
    helpOverlay.tabIndex = -1;
    helpOverlay.innerHTML = `
      <div class="help-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <h3 id="help-title">Keyboard Shortcuts</h3>
        <div class="help-list">
          <div class="help-item"><span class="help-key">/</span> Focus search</div>
          <div class="help-item"><span class="help-key">Ctrl+N</span> Focus new task</div>
          <div class="help-item"><span class="help-key">j / k</span> Next / previous</div>
          <div class="help-item"><span class="help-key">Space</span> Toggle done</div>
          <div class="help-item"><span class="help-key">e</span> Edit inline</div>
          <div class="help-item"><span class="help-key">d</span> Delete</div>
          <div class="help-item"><span class="help-key">Enter</span> Edit / open</div>
          <div class="help-item"><span class="help-key">?</span> Toggle help</div>
        </div>
        <div class="help-close"><button id="help-close" class="btn" aria-label="Close help">Close</button></div>
      </div>`;
    document.body.appendChild(helpOverlay);
    const closeBtn = document.getElementById('help-close');
    closeBtn.addEventListener('click', closeHelp);
    helpOverlay.addEventListener('click', (ev) => { if (ev.target === helpOverlay) closeHelp(); });
    // focus trap: if focus leaves the overlay, bring it back to the close button
    function focusTrap(e) {
      if (!helpOverlay) return;
      if (!helpOverlay.contains(e.target)) {
        if (closeBtn) closeBtn.focus();
      }
    }
    document.addEventListener('focusin', focusTrap);
    helpOverlay._trap = focusTrap;
    // set initial focus to close button
    setTimeout(() => { if (closeBtn) closeBtn.focus(); }, 10);
  }

  function closeHelp() {
    if (!helpOverlay) return;
    const hintBtn = document.getElementById('shortcut-hint');
    if (hintBtn) hintBtn.setAttribute('aria-expanded', 'false');
    if (helpOverlay._trap) document.removeEventListener('focusin', helpOverlay._trap);
    helpOverlay.remove();
    helpOverlay = null;
    // restore focus to hint button
    const hint = document.getElementById('shortcut-hint');
    if (hint) hint.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '?') { e.preventDefault(); if (helpOverlay) closeHelp(); else openHelp(); }
  });

  // Firebase initialization (if user provided config in index.html as window.FIREBASE_CONFIG)
  const signInBtn = document.getElementById('sign-in');
  const signOutBtn = document.getElementById('sign-out');
  const userInfo = document.getElementById('user-info');

  if (initFirebaseFromWindow()) {
    // wire auth
    if (signInBtn) signInBtn.addEventListener('click', () => signInWithGoogle().catch(err => alert(err.message)));
    if (signOutBtn) signOutBtn.addEventListener('click', () => fbSignOut().catch(err => alert(err.message)));

    onAuthChange(user => {
      currentUser = user;
      if (user) {
        if (signInBtn) signInBtn.style.display = 'none';
        if (signOutBtn) signOutBtn.style.display = '';
        if (userInfo) userInfo.textContent = user.email || user.uid;
        // subscribe to remote tasks
        if (unsubscribeRemote) unsubscribeRemote();
        unsubscribeRemote = subscribeToUserTasks(user.uid, remoteTasks => {
          // Replace local tasks with remote, but keep localStorage backup
          tasks = remoteTasks || [];
          save();
          render();
        });
      } else {
        if (signInBtn) signInBtn.style.display = '';
        if (signOutBtn) signOutBtn.style.display = 'none';
        if (userInfo) userInfo.textContent = '';
        if (unsubscribeRemote) { unsubscribeRemote(); unsubscribeRemote = null; }
        // keep local-only tasks
      }
    });
  } else {
    // Firebase not configured — leave local-only behavior
    if (signInBtn) signInBtn.style.display = 'none';
  }
});

export {};

async function pushSync() {
  const url = prompt('Enter server base URL (example: https://example.com)');
  if (!url) return;
  const key = prompt('Enter API key (will NOT be saved in this app)');
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key || '',
      },
      body: JSON.stringify(tasks),
    });
    if (!res.ok) throw new Error(await res.text());
    alert('Synced tasks to server successfully');
  } catch (err) {
    alert('Sync failed: ' + err.message);
  }
}

async function pullSync() {
  const url = prompt('Enter server base URL (example: https://example.com)');
  if (!url) return;
  const key = prompt('Enter API key (will NOT be saved in this app)');
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/tasks', {
      method: 'GET',
      headers: { 'x-api-key': key || '' },
    });
    if (!res.ok) throw new Error(await res.text());
    const remote = await res.json();
    if (!Array.isArray(remote)) throw new Error('Invalid data');
    if (!confirm('Replace local tasks with tasks from server?')) return;
    tasks = remote;
    save();
    render();
    alert('Imported tasks from server');
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
}
