// Thu thập dữ liệu Jira CỦA CHÍNH NGƯỜI ĐANG ĐĂNG NHẬP Jira, qua Jira REST API v2 (Jira Server/Data Center).
//
// Hàm này chạy ở HAI nơi:
//   1. Máy chủ web (gọi Jira bằng Personal Access Token).
//   2. Trình duyệt, ngay trên trang Jira (bookmarklet): mã nguồn hàm được gửi xuống bằng
//      collectMyJira.toString(), nên hàm phải TỰ ĐỦ: không dùng biến, hàm hay import nào ở ngoài thân hàm
//      (chỉ được import kiểu dữ liệu, vì kiểu bị xóa khi biên dịch).
//
// Chỉ lấy dữ liệu gắn với chính mình: mã việc mình được giao, tạo, theo dõi, đã log work, hoặc comment nhắc tên mình;
// worklog của chính mình; comment nhắc tên mình. Không lấy worklog hay comment của người khác.
import type { JiraSnapshot } from './types';

export async function collectMyJira(
  baseUrl: string,
  opts: { headers?: Record<string, string>; days?: number; onProgress?: (msg: string) => void; timeoutMs?: number } = {},
): Promise<JiraSnapshot> {
  const base = baseUrl.replace(/\/+$/, '');
  const days = Math.max(30, Math.min(opts.days ?? 400, 1500));
  const MAX_ISSUES = 2000;
  const say = (m: string) => {
    if (opts.onProgress) opts.onProgress(m);
  };

  async function get(path: string, params?: Record<string, string>): Promise<any> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000) : null;
    try {
      const res = await fetch(base + path + qs, {
        headers: { Accept: 'application/json', 'X-Atlassian-Token': 'no-check', ...(opts.headers || {}) },
        credentials: 'include',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (res.status === 401 || res.status === 403) throw new Error(`Jira từ chối quyền truy cập (HTTP ${res.status}). Kiểm tra đăng nhập hoặc token.`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Jira trả lỗi HTTP ${res.status} khi gọi ${path}: ${text.slice(0, 200)}`);
        (err as any).status = res.status;
        throw err;
      }
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const str = (v: any): string | null => (v === null || v === undefined || v === '' ? null : String(v));
  const same = (a: any, me: { name: string; key: string }) =>
    Boolean(a) && ((a.name && a.name === me.name) || (a.key && a.key === me.key));
  // Giá trị trường tùy chỉnh dạng đơn giản (số, chữ, lựa chọn); bỏ qua giá trị phức tạp hoặc quá dài.
  function simpleValue(v: any): any {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.length <= 300 ? v : undefined;
    if (Array.isArray(v)) {
      const parts = v.map((x) => simpleValue(x)).filter((x) => x !== undefined && typeof x !== 'object');
      return parts.length ? parts.join(', ').slice(0, 300) : undefined;
    }
    if (typeof v === 'object') {
      const s = v.value ?? v.name ?? v.displayName;
      return typeof s === 'string' || typeof s === 'number' ? s : undefined;
    }
    return undefined;
  }

  say('Đang đọc thông tin tài khoản Jira…');
  const myself = await get('/rest/api/2/myself');
  const me = { name: String(myself.name ?? ''), key: String(myself.key ?? myself.name ?? '') };
  const displayName = str(myself.displayName);
  const quoted = '"' + me.name.replace(/["\\]/g, '\\$&') + '"';

  async function search(jql: string, fields: string, expand?: string) {
    const out: any[] = [];
    let names: Record<string, string> = {};
    for (let startAt = 0; startAt < MAX_ISSUES; ) {
      const params: Record<string, string> = { jql, startAt: String(startAt), maxResults: '100', fields };
      if (expand) params.expand = expand;
      const page = await get('/rest/api/2/search', params);
      if (page.names) names = { ...names, ...page.names };
      const issues: any[] = page.issues || [];
      out.push(...issues);
      startAt += issues.length;
      say(`Đã đọc ${out.length}/${Math.min(page.total ?? out.length, MAX_ISSUES)} mã việc…`);
      if (!issues.length || startAt >= (page.total ?? 0)) break;
    }
    return { issues: out, names };
  }

  const mine = 'assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser() OR worklogAuthor = currentUser()';
  const recent = `updated >= -${days}d`;
  const tail = ' OR (assignee = currentUser() AND resolution = Unresolved) ORDER BY updated DESC';
  let main;
  try {
    main = await search(`((${mine} OR comment ~ ${quoted}) AND ${recent})${tail}`, '*all', 'names,changelog');
  } catch (e: any) {
    // Một số Jira không cho tìm chữ trong comment: bỏ điều kiện đó.
    if (e && e.status === 400) main = await search(`((${mine}) AND ${recent})${tail}`, '*all', 'names,changelog');
    else throw e;
  }
  // Đơn nghỉ phép / đăng ký làm ngoài giờ của mình (cho bảng chấm công): đơn thường do người khác tạo hộ
  // và giao cho người duyệt, nên tìm thêm theo tên đăng nhập ghi trong đơn (trường "Người viết đơn").
  try {
    say('Đang tìm đơn nghỉ phép, làm ngoài giờ của bạn…');
    const have = new Set(main.issues.map((i: any) => i.key));
    const extra = await search(
      `text ~ ${quoted} AND (summary ~ "nghỉ" OR summary ~ "ngoài giờ" OR summary ~ "làm thêm" OR issuetype in ("Chuyên viên/ Giảng viên nghỉ phép")) AND ${recent}`,
      '*all', 'names,changelog',
    ).catch(() => search(`text ~ ${quoted} AND (summary ~ "nghỉ" OR summary ~ "ngoài giờ" OR summary ~ "làm thêm") AND ${recent}`, '*all', 'names,changelog'));
    for (const it of extra.issues) if (!have.has(it.key)) main.issues.push(it);
    main.names = { ...extra.names, ...main.names };
  } catch {
    // Jira không cho tìm theo nội dung: chỉ dùng các đơn đã có ở trên.
  }
  // Nhóm trạng thái (Cần làm / Đang làm / Xong) của mọi trạng thái, để đọc lịch sử chuyển trạng thái.
  const statusCat: Record<string, string> = {};
  try {
    for (const st of (await get('/rest/api/2/status')) || []) {
      if (st && st.name && st.statusCategory) statusCat[String(st.name).toLowerCase()] = st.statusCategory.key;
    }
  } catch {
    // Không đọc được danh sách trạng thái: bỏ qua phần đếm số lần bị trả lại.
  }
  say('Đang tìm các mã việc có worklog của bạn…');
  const wlKeys = new Set((await search(`worklogAuthor = currentUser() AND ${recent}`, 'key')).issues.map((i) => i.key));

  const customNames = new Set<string>();
  const issues: JiraSnapshot['issues'] = [];
  const worklogs: JiraSnapshot['worklogs'] = [];
  const mentions: JiraSnapshot['mentions'] = [];
  const mentionTags = [`[~${me.name}]`.toLowerCase(), `[~${me.key}]`.toLowerCase()];
  const fieldName = (id: string) => (main.names && main.names[id]) || id;
  const isField = (id: string, re: RegExp) => re.test(fieldName(id).normalize('NFC').toLowerCase());
  const day = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  // Tên sprint: Jira Server trả dạng "com.atlassian.greenhopper…[id=1,name=Đợt 3,…]" hoặc đối tượng {name}.
  function sprintName(v: any): string | null {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    const names = arr
      .map((x: any) => (typeof x === 'string' ? (x.match(/name=([^,\]]*)/) || [])[1] : x && x.name))
      .filter(Boolean);
    return names.length ? String(names[names.length - 1]) : null;
  }

  for (const it of main.issues) {
    const f = it.fields || {};
    // Worklog: trang tìm kiếm chỉ trả tối đa 20 dòng, lấy đủ khi cần.
    let wl: any[] = (f.worklog && f.worklog.worklogs) || [];
    if (wlKeys.has(it.key) && f.worklog && f.worklog.total > wl.length) {
      say(`Đang đọc worklog của ${it.key}…`);
      const full = await get(`/rest/api/2/issue/${encodeURIComponent(it.key)}/worklog`);
      wl = full.worklogs || [];
    }
    let mySeconds = 0;
    for (const w of wl) {
      if (!same(w.author, me)) continue;
      mySeconds += Number(w.timeSpentSeconds) || 0;
      worklogs.push({
        id: String(w.id),
        issueKey: it.key,
        started: w.started,
        seconds: Number(w.timeSpentSeconds) || 0,
        comment: str(w.comment) ? String(w.comment).slice(0, 1000) : null,
      });
    }
    let mentionsMe = false;
    let comments: any[] = (f.comment && f.comment.comments) || [];
    // Comment của mình quyết định mã việc có được tính là sản phẩm không: đọc đủ khi trang tìm kiếm trả thiếu.
    if (wlKeys.has(it.key) && f.comment && f.comment.total > comments.length) {
      say(`Đang đọc comment của ${it.key}…`);
      const full = await get(`/rest/api/2/issue/${encodeURIComponent(it.key)}/comment`, { maxResults: '1000' }).catch(() => null);
      if (full && Array.isArray(full.comments)) comments = full.comments;
    }
    let myLastCommentAt: string | null = null;
    for (const c of comments) if (same(c.author, me) && (!myLastCommentAt || c.created > myLastCommentAt)) myLastCommentAt = c.created;
    for (const c of comments) {
      const body = String(c.body || '');
      if (same(c.author, me) || !mentionTags.some((t) => body.toLowerCase().includes(t))) continue;
      mentionsMe = true;
      mentions.push({
        id: String(c.id), issueKey: it.key, author: str(c.author && c.author.displayName), body: body.slice(0, 2000), created: c.created,
        answered: Boolean(myLastCommentAt && myLastCommentAt > c.created),
      });
    }
    const lc = comments.length ? comments[comments.length - 1] : null;
    // File sản phẩm chính mình đính kèm (quy định: mã có log work phải có comment và file đính kèm).
    const myAttachmentCount = ((f.attachment as any[]) || []).filter((a) => same(a && a.author, me)).length;
    const custom: Record<string, any> = {};
    let startDate: string | null = null;
    let epicKey: string | null = null;
    let sprint: string | null = null;
    for (const [id, v] of Object.entries(f)) {
      if (!id.startsWith('customfield_')) continue;
      if (isField(id, /^sprint$/)) sprint = sprintName(v);
      else if (isField(id, /^epic link$|^liên kết epic$/)) epicKey = str(typeof v === 'string' ? v : v && (v as any).key);
      else if (!startDate && isField(id, /start date|ngày bắt đầu|begin date/)) startDate = day(v);
      const val = simpleValue(v);
      if (val === undefined) continue;
      const name = fieldName(id);
      custom[name] = val;
      customNames.add(name);
    }
    // Liên kết giữa các mã việc (chặn, liên quan…).
    const links = ((f.issuelinks as any[]) || []).slice(0, 50).map((l: any) => {
      const other = l.inwardIssue || l.outwardIssue || {};
      const of = other.fields || {};
      return {
        type: str(l.type && l.type.name),
        dir: (l.inwardIssue ? 'inward' : 'outward') as 'inward' | 'outward',
        rel: str(l.type && (l.inwardIssue ? l.type.inward : l.type.outward)),
        key: str(other.key),
        summary: str(of.summary),
        statusCategory: str(of.status && of.status.statusCategory && of.status.statusCategory.key),
      };
    });
    // Lịch sử chuyển trạng thái (cũ trước).
    const histories: any[] = (it.changelog && it.changelog.histories) || [];
    const transitions: { at: string; from: string | null; to: string | null; by: string | null }[] = [];
    for (const h of histories) {
      for (const item of h.items || []) {
        if (item.field !== 'status') continue;
        transitions.push({ at: h.created, from: str(item.fromString), to: str(item.toString), by: str(h.author && h.author.displayName) });
      }
    }
    transitions.sort((a, b) => (a.at < b.at ? -1 : 1));
    const reopenCount = transitions.filter(
      (t) => t.from && t.to && statusCat[t.from.toLowerCase()] === 'done' && statusCat[t.to.toLowerCase()] !== 'done',
    ).length;
    const subtasks: any[] = f.subtasks || [];
    const tt = f.timetracking || {};
    issues.push({
      key: it.key,
      summary: String(f.summary || ''),
      status: str(f.status && f.status.name),
      statusCategory: str(f.status && f.status.statusCategory && f.status.statusCategory.key),
      issueType: str(f.issuetype && f.issuetype.name),
      projectKey: str(f.project && f.project.key),
      projectName: str(f.project && f.project.name),
      priority: str(f.priority && f.priority.name),
      assignee: str(f.assignee && f.assignee.displayName),
      reporter: str(f.reporter && f.reporter.displayName),
      isAssignee: same(f.assignee, me),
      isReporter: same(f.reporter, me),
      isWatcher: Boolean(f.watches && f.watches.isWatching),
      hasMyWorklog: mySeconds > 0 || wlKeys.has(it.key),
      mentionsMe,
      created: str(f.created),
      updated: str(f.updated),
      resolved: str(f.resolutiondate),
      due: str(f.duedate),
      mySeconds,
      custom,
      priorityRank: f.priority && f.priority.id ? Number(f.priority.id) || null : null,
      startDate,
      originalEstimate: num(f.timeoriginalestimate ?? tt.originalEstimateSeconds),
      remainingEstimate: num(f.timeestimate ?? tt.remainingEstimateSeconds),
      timeSpent: num(f.timespent ?? tt.timeSpentSeconds),
      parentKey: str(f.parent && f.parent.key),
      parentSummary: str(f.parent && f.parent.fields && f.parent.fields.summary),
      epicKey,
      subtaskTotal: subtasks.length,
      subtaskDone: subtasks.filter((x) => x.fields && x.fields.status && x.fields.status.statusCategory && x.fields.status.statusCategory.key === 'done').length,
      links,
      transitions: transitions.slice(-30),
      statusSince: transitions.length ? transitions[transitions.length - 1].at : str(f.created),
      reopenCount,
      sprint,
      fixVersions: ((f.fixVersions as any[]) || []).map((v) => String(v.name)).slice(0, 10),
      labels: ((f.labels as any[]) || []).map(String).slice(0, 20),
      components: ((f.components as any[]) || []).map((c) => String(c.name)).slice(0, 10),
      lastComment: lc ? { author: str(lc.author && lc.author.displayName), isMe: same(lc.author, me), created: lc.created, body: String(lc.body || '').slice(0, 300) } : null,
      myLastCommentAt,
      myAttachmentCount,
    });
  }
  say(`Xong: ${issues.length} mã việc, ${worklogs.length} worklog, ${mentions.length} comment nhắc tên bạn.`);
  return {
    me: { name: me.name, key: me.key, displayName },
    issues,
    worklogs,
    mentions,
    customFieldNames: Array.from(customNames).sort(),
    fetchedAt: new Date().toISOString(),
  };
}
