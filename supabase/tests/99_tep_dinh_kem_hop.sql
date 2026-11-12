-- Kiểm thử cột tệp đính kèm của hồ sơ cuộc họp (bucket Storage chỉ có trên Supabase thật).
\set ON_ERROR_STOP 1
\set bgh '''20000000-0000-0000-0000-000000000001'''

reset role;
insert into public.meeting_items (source_id, event_key, meeting_starts_at, kind, url, file_path, file_name, file_size)
values (:bgh, 'tep1', now(), 'pre', '/hop/tep?p=20000000-0000-0000-0000-000000000001/2026-11/abc/BaoCao.pdf',
        '20000000-0000-0000-0000-000000000001/2026-11/abc/BaoCao.pdf', 'Báo cáo.pdf', 1024);
select t.ok((select count(*) from public.meeting_items where event_key = 'tep1') = 1, 'gắn tệp tải lên với link trong ứng dụng');
select t.denied($$insert into public.meeting_items (source_id, event_key, meeting_starts_at, kind, file_path)
  values ('20000000-0000-0000-0000-000000000001', 'tep2', now(), 'pre', 'khac/abc.pdf')$$, 'đường dẫn tệp không thuộc lịch của buổi họp');
select t.denied($$insert into public.meeting_items (source_id, event_key, meeting_starts_at, kind, url)
  values ('20000000-0000-0000-0000-000000000001', 'tep3', now(), 'pre', 'http://x.com/a')$$, 'link không phải https');
select t.denied($$insert into public.meeting_items (source_id, event_key, meeting_starts_at, kind, url)
  values ('20000000-0000-0000-0000-000000000001', 'tep4', now(), 'pre', '/hop/khac')$$, 'đường dẫn nội bộ khác');
select t.ok(private.storage_source_id('20000000-0000-0000-0000-000000000001/x/y.pdf') = '20000000-0000-0000-0000-000000000001', 'đọc mã lịch từ đường dẫn tệp');
select t.ok(private.storage_source_id('../x/y.pdf') is null, 'đường dẫn sai dạng không có mã lịch');
delete from public.meeting_items where event_key = 'tep1';
