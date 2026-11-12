'use client';

import { createContext, useContext } from 'react';
import type { CalItem } from './types';

// Thông tin lịch truyền cho biểu mẫu tạo / sửa đang mở trong lịch:
// - start, end, allDay: khung giờ người dùng vừa kéo chọn trên lịch (để điền sẵn);
// - edit: mục đang sửa (biểu mẫu chuyển sang chế độ sửa);
// - close: đóng hộp thoại sau khi lưu xong.
// Biểu mẫu dùng ngoài lịch (ví dụ trong trang nhóm) nhận giá trị rỗng.
export type CalDraft = { start?: string; end?: string; allDay?: boolean; edit?: CalItem; close?: () => void };

export const CalDraftContext = createContext<CalDraft>({});
export const useCalDraft = () => useContext(CalDraftContext);

const OFFSET_MS = 7 * 3600 * 1000;
// "YYYY-MM-DDTHH:mm" theo giờ Việt Nam, dùng cho <input type="datetime-local">.
export const vnLocalInput = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16);
// "YYYY-MM-DD" theo giờ Việt Nam.
export const vnDateInput = (iso: string) => vnLocalInput(iso).slice(0, 10);
// Ngày cuối (bao gồm) của một mục cả ngày kết thúc lúc 00:00 ngày sau.
export const vnLastDay = (startIso: string, endIso: string) => {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  return vnDateInput(new Date(e > s ? e - 1 : s).toISOString());
};

// Chọn biểu mẫu sửa theo loại mục: editId có dạng "loai:id", ví dụ "event:…" hoặc "personal:…".
export function EditSwitch({ forms }: { forms: Record<string, React.ReactNode> }) {
  const { edit } = useCalDraft();
  const kind = edit?.editId?.split(':')[0] ?? '';
  return <>{forms[kind] ?? null}</>;
}
