'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret, hashSyncKey, newSyncKey, syncFromServer } from '@/lib/jira/server';
import type { FormState } from '@/components/FormMessage';

const now = () => new Date().toISOString();

// Tạo (hoặc thay) mã đồng bộ cho nút trên trang Jira. Chỉ lưu bản băm; mã gốc trả về một lần để dựng nút.
export async function createSyncKey(): Promise<{ key?: string; error?: string }> {
  const { userId } = await requireSession();
  const key = newSyncKey();
  const admin = createAdminClient();
  const { error } = await admin.from('jira_secrets').upsert({ user_id: userId, sync_key_hash: hashSyncKey(key), updated_at: now() }, { onConflict: 'user_id' });
  if (error) return { error: 'Không tạo được mã đồng bộ.' };
  await admin.from('jira_accounts').upsert({ user_id: userId, has_sync_key: true, updated_at: now() }, { onConflict: 'user_id' });
  revalidatePath('/jira');
  return { key };
}

export async function saveToken(_prev: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireSession();
  const token = String(form.get('token') || '').trim();
  if (token.length < 20 || token.length > 400 || /\s/.test(token)) return { error: 'Token không hợp lệ. Hãy dán đúng Personal Access Token tạo trong Jira.' };
  let enc: string;
  try {
    enc = encryptSecret(token);
  } catch {
    return { error: 'Máy chủ chưa cấu hình khóa mã hóa (TOKEN_ENCRYPTION_KEY). Báo quản trị hệ thống.' };
  }
  const admin = createAdminClient();
  const { error } = await admin.from('jira_secrets').upsert({ user_id: userId, token_enc: enc, updated_at: now() }, { onConflict: 'user_id' });
  if (error) return { error: 'Không lưu được token.' };
  await admin.from('jira_accounts').upsert({ user_id: userId, has_token: true, updated_at: now() }, { onConflict: 'user_id' });
  const r = await syncFromServer(userId);
  revalidatePath('/jira');
  return r.ok ? { ok: `Đã lưu token và đồng bộ ${r.issues} mã việc.` } : { ok: `Đã lưu token (mã hóa). Chưa đồng bộ được: ${r.error}` };
}

export async function syncNow(_prev: FormState): Promise<FormState> {
  const { userId } = await requireSession();
  const r = await syncFromServer(userId);
  revalidatePath('/jira');
  return r.ok ? { ok: `Đã đồng bộ ${r.issues} mã việc.` } : { error: r.error };
}

// Xóa token, mã đồng bộ và toàn bộ dữ liệu Jira đã lưu của chính mình.
export async function disconnectJira() {
  const { userId } = await requireSession();
  const admin = createAdminClient();
  await Promise.all([
    admin.from('jira_secrets').delete().eq('user_id', userId),
    admin.from('jira_issues').delete().eq('user_id', userId),
    admin.from('jira_worklogs').delete().eq('user_id', userId),
    admin.from('jira_mentions').delete().eq('user_id', userId),
  ]);
  await admin.from('jira_accounts').delete().eq('user_id', userId);
  revalidatePath('/jira');
}

// Chủ tài khoản chọn chia sẻ báo cáo Jira với người liên quan (không / Trưởng nhóm, Văn thư / mọi thành viên nhóm chung).
export async function setJiraShare(form: FormData) {
  const { supabase } = await requireSession();
  const scope = String(form.get('scope') || 'none');
  const { error } = await supabase.rpc('jira_set_share', { p_scope: scope });
  revalidatePath('/jira');
  if (error) redirect(`/jira?muc=bao-cao&loi=${encodeURIComponent(error.message || 'Không lưu được lựa chọn chia sẻ.')}`);
  redirect('/jira?muc=bao-cao&ok=chia-se');
}
