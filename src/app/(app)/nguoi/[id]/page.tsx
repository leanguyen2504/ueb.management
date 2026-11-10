import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { ProfileCard } from '@/components/ProfileCard';
import { loadProfileExtras } from '@/lib/profile-data';
import type { Profile } from '@/lib/types';

export const metadata: Metadata = { title: 'Hồ sơ' };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, userId } = await requireSession();
  const { data: person } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle<Profile>();
  if (!person) notFound();
  const extras = await loadProfileExtras(supabase, id);
  const isMe = id === userId;
  return (
    <>
      <PageHead title="Hồ sơ" actions={isMe ? <Link href="/tai-khoan" className="btn-secondary">Sửa hồ sơ của tôi</Link> : undefined} />
      <div className="max-w-3xl"><ProfileCard profile={person} isMe={isMe} {...extras} /></div>
    </>
  );
}
