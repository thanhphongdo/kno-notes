'use client';

import { Button, Icon, Input, Textarea } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useNoteEditor, type EditorDraft } from '@/hooks/use-note-editor';
import { EditorCanvas } from './editor-canvas';
import { EditorPanel } from './editor-panel';

export type { EditorDraft };

export interface EditorClientProps {
  draft: EditorDraft;
  /** The version this save will create — `latest + 1`, or 1 for a new note. */
  nextVersion: number;
  allTags: readonly string[];
}

/** Prototype lines 482-568 — the editor screen. */
export function EditorClient({ draft: initial, nextVersion, allTags }: EditorClientProps) {
  const isMobile = useIsMobile();
  const editor = useNoteEditor({ initial, nextVersion });
  const { draft, patch } = editor;

  return (
    <div className="mx-auto flex w-full max-w-1120 flex-col gap-20 px-16 pt-20 pb-80 min-[820px]:px-40 min-[820px]:pt-36">
      <div className="flex flex-wrap items-center gap-10">
        <Button variant="ghost" size="32" radius="8" onClick={editor.cancel} className="-ml-4 pr-10 pl-4">
          <Icon name="chevron-left" size={16} />
          Huỷ
        </Button>
        <span className="text-13 text-faint">{draft.id ? 'Chỉnh sửa ghi chú' : 'Ghi chú mới'}</span>
        <span className="flex-1" />
        <Button variant="primary" size="38" onClick={() => void editor.save()} disabled={editor.saving}>
          {editor.saveLabel}
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-40">
        <div className="flex min-w-0 flex-[1_1_600px] flex-col gap-14">
          <Input
            tone="ghost"
            value={draft.title}
            placeholder="Tiêu đề ghi chú"
            aria-label="Tiêu đề ghi chú"
            onChange={(e) => patch({ title: e.target.value })}
            className="h-auto font-serif text-28 font-semibold tracking-[-.02em] min-[820px]:text-38"
          />
          <Textarea
            tone="desc"
            value={draft.desc}
            rows={2}
            placeholder="Mô tả ngắn — giúp tìm kiếm nhanh hơn"
            aria-label="Mô tả ngắn"
            onChange={(e) => patch({ desc: e.target.value })}
          />
          <EditorCanvas
            initialHtml={initial.content}
            isMobile={isMobile}
            handleRef={editor.handleRef}
            onPickFiles={editor.pickFiles}
          />
        </div>

        <EditorPanel
          priority={draft.priority}
          onPriorityChange={(priority) => patch({ priority })}
          tags={draft.tags}
          onTagsChange={(tags) => patch({ tags })}
          allTags={allTags}
          images={draft.images}
          onImagesChange={(images) => patch({ images })}
          changeNote={draft.changeNote}
          onChangeNoteChange={(changeNote) => patch({ changeNote })}
          versionHint={editor.versionHint}
          onAttachFiles={(files) => void editor.attachFiles(files)}
        />
      </div>
    </div>
  );
}
