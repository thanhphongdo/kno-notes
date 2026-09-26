'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { DeleteConfirmBanner } from '@/components/shared';
import { Button, buttonVariants, Icon, IconButton, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { noteEditPath, notePath } from '@/lib/nav/paths';

export interface DetailActionsProps {
  noteId: string;
  fav: boolean;
  /** `rel(note.updated)` — "2 giờ trước". */
  updatedLabel: string;
  /** "v3" — always the latest version, even while an old one is displayed. */
  versionLabel: string;
  /** True while an old version is displayed: every mutation is off. */
  disabled: boolean;
  onStartQuiz: () => void;
}

/**
 * Prototype lines 354-369: the meta row (update time + version on the left, the
 * four actions on the right) plus the inline delete confirmation underneath it.
 */
export function DetailActions({
  noteId, fav: initialFav, updatedLabel, versionLabel, disabled, onStartQuiz,
}: DetailActionsProps) {
  const router = useRouter();
  const { flash } = useToast();
  const [fav, setFav] = useState(initialFav);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleFav = useCallback(async () => {
    const next = !fav;
    setFav(next);
    const res = await fetch(`${apiNote(noteId)}/favorite`, { method: 'POST' });
    if (!res.ok) {
      setFav(!next);
      flash('Không cập nhật được yêu thích');
      return;
    }
    router.refresh();
  }, [fav, flash, noteId, router]);

  const remove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(apiNote(noteId), { method: 'DELETE' });
      if (!res.ok) {
        flash('Không xoá được ghi chú');
        return;
      }
      flash('Đã xoá ghi chú');
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, flash, noteId, router]);

  return (
    <>
      <div className="mb-28 flex flex-wrap items-center gap-12 border-b border-line pb-20">
        <div className="min-w-180 flex-1 text-13 text-faint">
          {`Cập nhật ${updatedLabel} · `}
          <span className="font-mono">{versionLabel}</span>
        </div>
        <div className="flex flex-wrap gap-6">
          <Button variant="secondary" onClick={() => void toggleFav()} disabled={disabled}>
            <Icon name="star" size={16} filled={fav} className={fav ? 'text-med' : 'text-muted'} />
            {fav ? 'Đã yêu thích' : 'Yêu thích'}
          </Button>
          <IconButton
            icon="trash"
            label="Xoá"
            variant="bordered"
            size={36}
            radius="9"
            tone="muted"
            hoverTone="hi"
            disabled={disabled}
            onClick={() => setConfirming(true)}
          />
          <Button
            variant="secondary"
            onClick={onStartQuiz}
            disabled={disabled}
            className="hover:border-accent hover:text-accent"
          >
            <Icon name="quiz" size={15} />
            Trắc nghiệm
          </Button>
          <Link href={noteEditPath(noteId)} className={cn(buttonVariants({ variant: 'ink' }), 'px-14')}>
            <Icon name="edit" size={15} />
            Chỉnh sửa
          </Link>
        </div>
      </div>

      {confirming ? (
        <DeleteConfirmBanner
          className="mb-24"
          onCancel={() => setConfirming(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </>
  );
}

/** `notePath` is the in-app URL; the API lives under the same shape. */
const apiNote = (id: string) => `/api${notePath(id)}`;
