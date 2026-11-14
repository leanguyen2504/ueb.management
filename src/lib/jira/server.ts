import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { features, serverEnv } from '@/lib/env';
import { collectMyJira } from './collect';
import type { JiraSnapshot } from './types';

// --- Mã hóa token Jira (AES-256-GCM) bằng TOKEN_ENCRYPTION_KEY ---
function key(): Buffer {
  const raw = serverEnv.tokenEncryptionKey().trim();
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY phải là 32 byte (base64 hoặc 64 ký tự hex).');
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(':');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Token đã lưu không đọc được.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

// --- Mã đồng bộ cho nút trên trang Jira: chỉ lưu bản băm ---
export const hashSyncKey = (k: string) => createHash('sha256').update(k).digest('hex');
export const newSyncKey = () => 'ueb_jira_' + randomBytes(24).toString('base64url');

export async function userIdForSyncKey(k: string): Promise<string | null> {
  if (!/^ueb_jira_[A-Za-z0-9_-]{20,64}$/.test(k)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('jira_secrets').select('user_id').eq('sync_key_hash', hashSyncKey(k)).maybeSingle();
  if (!data) return null;
  await admin.from('jira_secrets').update({ sync_key_used_at: new Date().toISOString() }).eq('user_id', data.user_id);
  return data.user_id as string;
}

// Kiểm tra sơ bộ dữ liệu gửi lên (từ trình duyệt nên không tin tưởng hoàn toàn).
export function parseSnapshot(body: unknown): JiraSnapshot | null {
  if (!body || typeof body !== 'object') return null;
  const s = body as Partial<JiraSnapshot>;
  if (!s.me || typeof s.me.name !== 'string' || !Array.isArray(s.issues) || !Array.isArray(s.worklogs) || !Array.isArray(s.mentions)) return null;
  if (s.issues.length > 3000 || s.worklogs.length > 20000 || s.mentions.length > 5000) return null;
  return {
    me: { name: s.me.name, key: String(s.me.key ?? s.me.name), displayName: s.me.displayName ?? null },
    issues: s.issues,
    worklogs: s.worklogs,
    mentions: s.mentions,
    customFieldNames: Array.isArray(s.customFieldNames) ? s.customFieldNames.slice(0, 300) : [],
    tree: Array.isArray(s.tree) ? s.tree.slice(0, 5000) : [],
    fetchedAt: String(s.fetchedAt ?? new Date().toISOString()),
  };
}

export async function saveSnapshot(userId: string, source: 'bookmarklet' | 'server', snap: JiraSnapshot) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('jira_save_snapshot', { p_user: userId, p_source: source, p_snap: snap });
  if (error) throw new Error(`Không lưu được dữ liệu Jira: ${error.message}`);
  // Cây công việc dùng chung: lỗi (ví dụ chưa chạy SQL tạo bảng jira_tree) không làm hỏng lần đồng bộ.
  if (snap.tree?.length) {
    const tree = await admin.rpc('jira_save_tree', { p_user: userId, p_tree: snap.tree });
    if (tree.error) console.error('jira_save_tree', tree.error.message);
  }
}

async function recordError(userId: string, message: string) {
  const admin = createAdminClient();
  await admin.from('jira_accounts').upsert({ user_id: userId, last_error: message.slice(0, 500), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// Máy chủ web tự gọi Jira bằng token của người dùng. Chỉ chạy được khi Jira mở ra Internet.
export async function syncFromServer(userId: string): Promise<{ ok: true; issues: number } | { ok: false; error: string }> {
  const base = serverEnv.jiraBaseUrl();
  if (!features.jiraServerSync() || !base) return { ok: false, error: 'Máy chủ web chưa được bật đồng bộ Jira tự động (FEATURE_JIRA, JIRA_BASE_URL).' };
  const admin = createAdminClient();
  const { data } = await admin.from('jira_secrets').select('token_enc').eq('user_id', userId).maybeSingle();
  if (!data?.token_enc) return { ok: false, error: 'Bạn chưa lưu Personal Access Token.' };
  try {
    const snap = await collectMyJira(base, { headers: { Authorization: `Bearer ${decryptSecret(data.token_enc)}` }, timeoutMs: 20000 });
    await saveSnapshot(userId, 'server', snap);
    return { ok: true, issues: snap.issues.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /fetch failed|abort|ECONN|ETIMEDOUT|ENOTFOUND/i.test(msg)
      ? 'Máy chủ web không kết nối được tới Jira (Jira có thể chỉ mở trong mạng trường). Hãy dùng nút "Đồng bộ Jira" trên trang Jira.'
      : msg;
    await recordError(userId, friendly);
    return { ok: false, error: friendly };
  }
}

// Cron hằng ngày: đồng bộ mọi người đã lưu token.
export async function syncAllFromServer() {
  const admin = createAdminClient();
  const { data } = await admin.from('jira_secrets').select('user_id').not('token_enc', 'is', null);
  const results = [];
  for (const r of data ?? []) results.push(await syncFromServer(r.user_id as string));
  return results;
}
