/**
 * FBITI SYS – Backend (Google Apps Script, bound to the Google Sheet)
 * Sheets are created automatically: USERS, STUDENTS, FEES PAYMENT, EXPENDITURE, RECYCLE BIN, AUDIT LOG
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone
 */
const CFG = {
  INSTITUTION: 'FutureBridge Institute of Technology & Innovation (FBITI)',
  SESSION_SECONDS: 21600, // 6 hours (max allowed by CacheService)
  BIN_DAYS: 30            // days a deleted record stays restorable
};

const STUDENT_FIELDS = ['StudentID','AcademicYear','FullName','Gender','DOB','Age','Nationality','MaritalStatus',
  'HomeAddress','District','Chiefdom','Mobile','AltMobile','Email','NationalID','Qualification','LastSchool',
  'YearCompleted','ProgrammeLevel','Programmes','StudyPeriod','GuardianName','GuardianRelation','GuardianAddress',
  'GuardianContact','GuardianEmail','EmergencyName','EmergencyRelation','EmergencyAddress','EmergencyPhone',
  'MedicalCondition','MedicalDetails','HeardAbout','HeardOther','RecordedBy','ClientRef','CreatedAt','UpdatedAt'];
const PAY_FIELDS = [];
for (let i = 1; i <= 5; i++) PAY_FIELDS.push('P' + i + '_Amount', 'P' + i + '_Date', 'P' + i + '_Bank', 'P' + i + '_Slip');

const SCHEMA = {
  'USERS': ['UserID','FullName','Email','Username','PasswordHash','Salt','Role','Status','CreatedAt','UpdatedAt'],
  'STUDENTS': STUDENT_FIELDS,
  'FEES PAYMENT': ['FeeID','StudentID','Name','Program','TotalFees'].concat(PAY_FIELDS,
    ['TotalPaid','Balance','RecordedBy','Status','VoidReason','VoidedBy','ClientRef','CreatedAt','UpdatedAt','P1_By','P2_By','P3_By','P4_By','P5_By']),
  'EXPENDITURE': ['ExpID','Date','Name','Description','Amount','RecordedBy','Status','VoidReason','VoidedBy','ClientRef','CreatedAt','AcademicYear'],
  'RECYCLE BIN': ['BinID','Type','OriginalID','Label','DeletedBy','DeletedAt','Data'],
  'AUDIT LOG': ['Time','User','Action','Detail']
};

/* ---------- Entry points ---------- */
function setup() { Object.keys(SCHEMA).forEach(sh); }   // optional: run once manually

function doGet() { return out({ ok: true, data: 'FBITI API is running' }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const req = JSON.parse(e.postData.contents);
    const fn = ACTIONS[req.action];
    if (!fn) throw new Error('Unknown action');
    const user = PUBLIC[req.action] ? null : session(req.token);
    return out({ ok: true, data: fn(req.data || {}, user, req.token) });
  } catch (err) {
    return out({ ok: false, error: err.message });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

/* ---------- Sheet helpers ---------- */
function sh(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name) || ss.insertSheet(name);
  const h = SCHEMA[name];
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0b2a5b').setFontColor('#ffffff');
    s.setFrozenRows(1);
    s.getRange(2, 1, Math.max(1, s.getMaxRows() - 1), h.length).setNumberFormat('@'); // keep text as text
  } else if (s.getLastColumn() < h.length) {            // older sheet: add any new header columns automatically
    const from = s.getLastColumn() + 1;
    s.getRange(1, from, 1, h.length - from + 1).setValues([h.slice(from - 1)]).setFontWeight('bold').setBackground('#0b2a5b').setFontColor('#ffffff');
    s.getRange(2, from, Math.max(1, s.getMaxRows() - 1), h.length - from + 1).setNumberFormat('@');
  }
  return s;
}
function rows(name) {
  const v = sh(name).getDataRange().getValues();
  const h = v[0];
  return v.slice(1).map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; })
    .filter(o => h.some(k => o[k] !== ''));
}
function toRow(name, obj) { return SCHEMA[name].map(k => obj[k] === undefined ? '' : obj[k]); }
function addRow(name, obj) {
  const s = sh(name), r = s.getLastRow() + 1, n = SCHEMA[name].length;
  s.getRange(r, 1, 1, n).setNumberFormat('@').setValues([toRow(name, obj)]);
}
function setRow(name, row, obj) {
  const n = SCHEMA[name].length;
  sh(name).getRange(row, 1, 1, n).setNumberFormat('@').setValues([toRow(name, obj)]);
}
const clean = o => { const c = Object.assign({}, o); delete c._row; return c; };
const now = () => new Date().toISOString();
const today = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
const num = v => Number(v) || 0;
const uid8 = () => Utilities.getUuid().slice(0, 8).toUpperCase();
function audit(u, action, detail) { addRow('AUDIT LOG', { Time: now(), User: u ? u.username : '-', Action: action, Detail: detail || '' }); }
function need(u, role) { if (u.role !== role) throw new Error('You do not have permission for this action'); }

/* ---------- Security ---------- */
function hash(pw, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function session(token) {
  const raw = token && CacheService.getScriptCache().get('S_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');
  const s = JSON.parse(raw);
  const u = rows('USERS').find(r => r.UserID === s.id);
  if (!u || u.Status !== 'Approved') throw new Error('SESSION_EXPIRED');
  return { id: u.UserID, fullName: u.FullName, username: u.Username, role: u.Role, email: u.Email };
}

/* ---------- Actions ---------- */
const PUBLIC = { register: 1, login: 1 };
const ACTIONS = {

  register(d) {
    const fullName = (d.fullName || '').trim(), email = (d.email || '').trim().toLowerCase();
    const username = (d.username || '').trim(), pw = d.password || '';
    if (!fullName || !email || !username || !pw || !d.role) throw new Error('All fields are required');
    if (['Admin', 'Bursar'].indexOf(d.role) < 0) throw new Error('Invalid role');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address');
    if (pw.length < 6) throw new Error('Password must be at least 6 characters');
    const users = rows('USERS');
    if (users.some(u => String(u.Username).toLowerCase() === username.toLowerCase())) throw new Error('Username already taken');
    if (users.some(u => String(u.Email).toLowerCase() === email)) throw new Error('Email already registered');
    const first = users.length === 0;
    const salt = Utilities.getUuid();
    addRow('USERS', { UserID: 'USR-' + uid8(), FullName: fullName, Email: email, Username: username,
      PasswordHash: hash(pw, salt), Salt: salt, Role: first ? 'Admin' : d.role,
      Status: first ? 'Approved' : 'Pending', CreatedAt: now(), UpdatedAt: now() });
    audit({ username: username }, 'REGISTER', first ? 'First user auto-approved as Admin' : 'Awaiting approval');
    return { autoApproved: first };
  },

  login(d) {
    const u = rows('USERS').find(r => String(r.Username).toLowerCase() === String(d.username || '').trim().toLowerCase());
    if (!u || hash(d.password || '', u.Salt) !== u.PasswordHash) throw new Error('Invalid username or password');
    if (u.Role !== d.role) throw new Error('This account is not registered with the selected role');
    if (u.Status === 'Pending') throw new Error('Your account is awaiting administrator approval');
    if (u.Status === 'Denied') throw new Error('Your registration was denied. Please contact the administrator');
    const token = Utilities.getUuid() + Utilities.getUuid();
    CacheService.getScriptCache().put('S_' + token, JSON.stringify({ id: u.UserID }), CFG.SESSION_SECONDS);
    audit({ username: u.Username }, 'LOGIN', '');
    return { token: token, user: { id: u.UserID, fullName: u.FullName, username: u.Username, role: u.Role, email: u.Email } };
  },

  logout(d, u, token) { CacheService.getScriptCache().remove('S_' + token); return true; },

  me(d, u) { return u; },

  /* ----- Profile ----- */
  updateProfile(d, u) {
    const rec = rows('USERS').find(r => r.UserID === u.id);
    if (d.newUsername && d.newUsername.trim() !== rec.Username) {
      const nu = d.newUsername.trim();
      if (nu.length < 3) throw new Error('Username is too short');
      if (rows('USERS').some(r => r.UserID !== u.id && String(r.Username).toLowerCase() === nu.toLowerCase())) throw new Error('Username already taken');
      rec.Username = nu;
    }
    if (d.newPassword) {
      if (hash(d.oldPassword || '', rec.Salt) !== rec.PasswordHash) throw new Error('Old password is incorrect');
      if (d.newPassword.length < 6) throw new Error('New password must be at least 6 characters');
      rec.Salt = Utilities.getUuid(); rec.PasswordHash = hash(d.newPassword, rec.Salt);
    }
    rec.UpdatedAt = now(); setRow('USERS', rec._row, rec);
    audit(u, 'PROFILE_UPDATE', '');
    return { username: rec.Username };
  },

  /* ----- Admin: users ----- */
  listUsers(d, u) {
    need(u, 'Admin');
    return rows('USERS').map(r => ({ UserID: r.UserID, FullName: r.FullName, Email: r.Email, Username: r.Username,
      Role: r.Role, Status: r.Status, CreatedAt: r.CreatedAt }));
  },

  setUserStatus(d, u) {
    need(u, 'Admin');
    if (['Approved', 'Denied'].indexOf(d.status) < 0) throw new Error('Invalid status');
    const t = rows('USERS').find(r => r.UserID === d.id);
    if (!t) throw new Error('User not found');
    if (t.UserID === u.id) throw new Error('You cannot change your own status');
    t.Status = d.status; t.UpdatedAt = now(); setRow('USERS', t._row, t);
    audit(u, 'USER_' + d.status.toUpperCase(), t.Username);
    let emailed = true;
    try { sendStatusMail(t, d.status === 'Approved'); } catch (e) { emailed = false; }
    return { emailed: emailed };
  },

  deleteUser(d, u) {
    need(u, 'Admin');
    const t = rows('USERS').find(r => r.UserID === d.id);
    if (!t) throw new Error('User not found');
    if (t.UserID === u.id) throw new Error('You cannot delete your own account');
    toBin('User', t.UserID, t.FullName + ' (' + t.Username + ')', clean(t), u);
    sh('USERS').deleteRow(t._row);
    audit(u, 'USER_DELETE', t.Username);
    return true;
  },

  /* ----- Students ----- */
  listStudents() { return rows('STUDENTS').map(clean); },

  saveStudent(d, u) {
    const rec = {};
    STUDENT_FIELDS.forEach(k => rec[k] = d[k] === undefined ? '' : String(d[k]).trim());
    if (!rec.FullName || !rec.Gender) throw new Error('Full name and gender are required');
    if (d.StudentID) {
      const ex = rows('STUDENTS').find(r => r.StudentID === d.StudentID);
      if (!ex) throw new Error('Student not found');
      rec.StudentID = ex.StudentID; rec.RecordedBy = ex.RecordedBy; rec.ClientRef = ex.ClientRef;
      rec.CreatedAt = ex.CreatedAt; rec.UpdatedAt = now();
      setRow('STUDENTS', ex._row, rec);
      rows('FEES PAYMENT').filter(f => f.StudentID === ex.StudentID).forEach(f => {   // keep fee rows in sync
        f.Name = rec.FullName; f.Program = rec.Programmes; setRow('FEES PAYMENT', f._row, f);
      });
      audit(u, 'STUDENT_EDIT', rec.StudentID);
      return rec;
    }
    if (d.ClientRef) { const dup = rows('STUDENTS').find(r => r.ClientRef === d.ClientRef); if (dup) return clean(dup); }
    rec.StudentID = nextStudentId(); rec.RecordedBy = u.fullName; rec.ClientRef = d.ClientRef || '';
    rec.CreatedAt = rec.UpdatedAt = now();
    addRow('STUDENTS', rec);
    audit(u, 'STUDENT_ADD', rec.StudentID);
    return rec;
  },

  deleteStudent(d, u) {
    const ex = rows('STUDENTS').find(r => r.StudentID === d.id);
    if (!ex) throw new Error('Student not found');
    toBin('Student', ex.StudentID, ex.StudentID + ' – ' + ex.FullName, clean(ex), u);
    sh('STUDENTS').deleteRow(ex._row);
    audit(u, 'STUDENT_DELETE', ex.StudentID);
    return { hasFees: rows('FEES PAYMENT').some(f => f.StudentID === ex.StudentID) };
  },

  /* ----- Fees (never erased – voided) ----- */
  listFees() { return rows('FEES PAYMENT').map(clean); },

  saveFee(d, u) {
    const id = String(d.StudentID || '').trim().toUpperCase();
    const st = rows('STUDENTS').find(s => String(s.StudentID).toUpperCase() === id);
    if (!st) throw new Error('Student ID not found');
    const all = rows('FEES PAYMENT');
    const ex = all.find(r => r.StudentID === st.StudentID && r.Status !== 'Voided');
    if (!ex && d.ClientRef) { const dup = all.find(r => r.ClientRef === d.ClientRef); if (dup) return clean(dup); }
    const total = num(d.TotalFees);
    if (total <= 0) throw new Error('Enter the total fees');
    const rec = { FeeID: ex ? ex.FeeID : nextId('PAY-', all.map(r => r.FeeID), 4), StudentID: st.StudentID,
      Name: st.FullName, Program: st.Programmes, TotalFees: total };
    let paid = 0;
    for (let i = 1; i <= 5; i++) {
      const a = num(d['P' + i + '_Amount']);
      rec['P' + i + '_Amount'] = a || '';
      rec['P' + i + '_Date'] = a ? (d['P' + i + '_Date'] || (ex && ex['P' + i + '_Date']) || today()) : '';
      rec['P' + i + '_Bank'] = a ? String(d['P' + i + '_Bank'] || '').trim() : '';
      rec['P' + i + '_Slip'] = a ? String(d['P' + i + '_Slip'] || '').trim() : '';
      // who captured this payment: keep the original person if the amount is unchanged, otherwise the current user
      rec['P' + i + '_By'] = !a ? '' : (ex && num(ex['P' + i + '_Amount']) === a) ? (ex['P' + i + '_By'] || ex.RecordedBy) : u.fullName;
      paid += a;
    }
    if (paid > total) throw new Error('Total paid cannot exceed total fees');
    rec.TotalPaid = paid; rec.Balance = total - paid; rec.Status = 'Active';
    rec.VoidReason = ''; rec.VoidedBy = '';
    if (ex) {
      rec.RecordedBy = ex.RecordedBy; rec.ClientRef = ex.ClientRef; rec.CreatedAt = ex.CreatedAt; rec.UpdatedAt = now();
      setRow('FEES PAYMENT', ex._row, rec);
      audit(u, 'FEE_UPDATE', rec.FeeID + ' paid ' + ex.TotalPaid + ' -> ' + paid + ' by ' + u.fullName);
    } else {
      rec.RecordedBy = u.fullName; rec.ClientRef = d.ClientRef || ''; rec.CreatedAt = rec.UpdatedAt = now();
      addRow('FEES PAYMENT', rec);
      audit(u, 'FEE_ADD', rec.FeeID + ' paid ' + paid);
    }
    return rec;
  },

  voidFee(d, u) {
    if (!String(d.reason || '').trim()) throw new Error('A reason is required to void a payment record');
    const r = rows('FEES PAYMENT').find(x => x.FeeID === d.id);
    if (!r) throw new Error('Record not found');
    r.Status = 'Voided'; r.VoidReason = d.reason.trim(); r.VoidedBy = u.fullName; r.UpdatedAt = now();
    setRow('FEES PAYMENT', r._row, r); audit(u, 'FEE_VOID', r.FeeID + ': ' + d.reason);
    return true;
  },

  reinstateFee(d, u) {
    need(u, 'Admin');
    const all = rows('FEES PAYMENT'), r = all.find(x => x.FeeID === d.id);
    if (!r) throw new Error('Record not found');
    if (all.some(x => x.StudentID === r.StudentID && x.Status !== 'Voided')) throw new Error('This student already has an active fee record');
    r.Status = 'Active'; r.VoidReason = ''; r.VoidedBy = ''; r.UpdatedAt = now();
    setRow('FEES PAYMENT', r._row, r); audit(u, 'FEE_REINSTATE', r.FeeID);
    return true;
  },

  /* ----- Expenditure (never erased – voided) ----- */
  listExpenditure() { return rows('EXPENDITURE').map(clean); },

  saveExpenditure(d, u) {
    const all = rows('EXPENDITURE');
    if (d.ClientRef) { const dup = all.find(r => r.ClientRef === d.ClientRef); if (dup) return clean(dup); }
    const name = String(d.Name || '').trim(), amt = num(d.Amount);
    if (!name) throw new Error('Name is required');
    if (amt <= 0) throw new Error('Enter a valid amount');
    const ay = String(d.AcademicYear || '').trim();
    if (ay && !/^\d{4}\/\d{4}$/.test(ay)) throw new Error('Academic year must look like 2026/2027');
    const rec = { ExpID: nextId('EXP-', all.map(r => r.ExpID), 4), Date: /^\d{4}-\d{2}-\d{2}$/.test(d.Date || '') ? d.Date : today(),
      Name: name, Description: String(d.Description || '').trim(), Amount: amt, RecordedBy: u.fullName, Status: 'Active',
      ClientRef: d.ClientRef || '', CreatedAt: now(), AcademicYear: ay };
    addRow('EXPENDITURE', rec); audit(u, 'EXP_ADD', rec.ExpID + ' ' + amt);
    return rec;
  },

  voidExpenditure(d, u) {
    if (!String(d.reason || '').trim()) throw new Error('A reason is required to void an expenditure record');
    const r = rows('EXPENDITURE').find(x => x.ExpID === d.id);
    if (!r) throw new Error('Record not found');
    r.Status = 'Voided'; r.VoidReason = d.reason.trim(); r.VoidedBy = u.fullName;
    setRow('EXPENDITURE', r._row, r); audit(u, 'EXP_VOID', r.ExpID + ': ' + d.reason);
    return true;
  },

  reinstateExpenditure(d, u) {
    need(u, 'Admin');
    const r = rows('EXPENDITURE').find(x => x.ExpID === d.id);
    if (!r) throw new Error('Record not found');
    r.Status = 'Active'; r.VoidReason = ''; r.VoidedBy = '';
    setRow('EXPENDITURE', r._row, r); audit(u, 'EXP_REINSTATE', r.ExpID);
    return true;
  },

  /* ----- Recycle bin (Admin) ----- */
  listBin(d, u) {
    need(u, 'Admin');
    const limit = Date.now() - CFG.BIN_DAYS * 86400000;
    const s = sh('RECYCLE BIN');
    rows('RECYCLE BIN').filter(r => Date.parse(r.DeletedAt) < limit).map(r => r._row).sort((a, b) => b - a)
      .forEach(r => s.deleteRow(r));                       // auto-purge expired items
    return rows('RECYCLE BIN').map(r => ({ BinID: r.BinID, Type: r.Type, OriginalID: r.OriginalID, Label: r.Label,
      DeletedBy: r.DeletedBy, DeletedAt: r.DeletedAt, ExpiresAt: new Date(Date.parse(r.DeletedAt) + CFG.BIN_DAYS * 86400000).toISOString() }));
  },

  restoreBin(d, u) {
    need(u, 'Admin');
    const b = rows('RECYCLE BIN').find(r => r.BinID === d.id);
    if (!b) throw new Error('Item not found');
    const data = JSON.parse(b.Data);
    if (b.Type === 'Student') {
      if (rows('STUDENTS').some(r => r.StudentID === data.StudentID)) throw new Error('A student with this ID already exists');
      data.UpdatedAt = now(); addRow('STUDENTS', data);
    } else if (b.Type === 'User') {
      const us = rows('USERS');
      if (us.some(r => String(r.Username).toLowerCase() === String(data.Username).toLowerCase() || String(r.Email).toLowerCase() === String(data.Email).toLowerCase()))
        throw new Error('Username or email is already in use');
      data.UpdatedAt = now(); addRow('USERS', data);
    }
    sh('RECYCLE BIN').deleteRow(b._row);
    audit(u, 'RESTORE', b.Type + ' ' + b.OriginalID);
    return true;
  },

  purgeBin(d, u) {
    need(u, 'Admin');
    const b = rows('RECYCLE BIN').find(r => r.BinID === d.id);
    if (!b) throw new Error('Item not found');
    sh('RECYCLE BIN').deleteRow(b._row); audit(u, 'PURGE', b.Type + ' ' + b.OriginalID);
    return true;
  }
};

/* ---------- Internal helpers ---------- */
function toBin(type, id, label, data, u) {
  addRow('RECYCLE BIN', { BinID: 'BIN-' + uid8(), Type: type, OriginalID: id, Label: label,
    DeletedBy: u.fullName, DeletedAt: now(), Data: JSON.stringify(data) });
}
function nextId(prefix, ids, pad) {
  let max = 0; ids.forEach(i => max = Math.max(max, parseInt(String(i).replace(/\D/g, '')) || 0));
  return prefix + String(max + 1).padStart(pad, '0');
}
function nextStudentId() {   // FBITI-001, 002 … never re-used, even after deletion
  const ids = rows('STUDENTS').map(r => r.StudentID)
    .concat(rows('RECYCLE BIN').filter(r => r.Type === 'Student').map(r => r.OriginalID));
  return nextId('FBITI-', ids, 3);
}

function sendStatusMail(user, approved) {
  const color = approved ? '#16833a' : '#b42318';
  const title = approved ? 'Your account has been approved' : 'Your registration was not approved';
  const msg = approved
    ? 'Good news! The administrator has approved your account. You can now sign in with your username and password.'
    : 'We regret to inform you that your registration request was not approved. If you believe this is a mistake, please contact the administrator.';
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e3e8f0;border-radius:12px;overflow:hidden">' +
    '<div style="background:#0b2a5b;color:#fff;padding:24px;text-align:center"><div style="font-size:13px;letter-spacing:2px;color:#f2b705">FBITI</div>' +
    '<div style="font-size:16px;margin-top:6px">' + CFG.INSTITUTION + '</div></div>' +
    '<div style="padding:28px;color:#10213f"><div style="display:inline-block;background:' + color + ';color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:bold">' +
    (approved ? 'APPROVED' : 'DENIED') + '</div><h2 style="margin:16px 0 8px">' + title + '</h2>' +
    '<p>Dear ' + user.FullName + ',</p><p style="line-height:1.6">' + msg + '</p>' +
    '<p style="margin-top:24px;color:#5b6b86;font-size:13px">Username: <b>' + user.Username + '</b> &nbsp;|&nbsp; Role: <b>' + user.Role + '</b></p></div>' +
    '<div style="background:#f4f6fa;padding:14px;text-align:center;font-size:12px;color:#5b6b86">This is an automated message – please do not reply.</div></div>';
  MailApp.sendEmail({ to: user.Email, subject: 'FBITI – ' + title, htmlBody: html, name: 'FBITI System' });
}
