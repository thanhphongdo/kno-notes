'use client';

import {
  ImageDropzone, ImageGrid, PrioritySegmented, Rail, RailSection, TagInput, TagSuggestions,
} from '@/components/shared';
import { Input } from '@/components/ui';
import { norm } from '@/lib/text';
import type { NoteImage, Priority } from '@/lib/types';
import { useTagDraft } from './use-tag-draft';

export interface EditorPanelProps {
  priority: Priority;
  onPriorityChange: (priority: Priority) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Every tag the user already has, most used first. */
  allTags: readonly string[];
  images: NoteImage[];
  onImagesChange: (images: NoteImage[]) => void;
  changeNote: string;
  onChangeNoteChange: (value: string) => void;
  versionHint: string;
  onAttachFiles: (files: File[]) => void;
}

/** Prototype lines 509-565 — the editor's right-hand panel. No dividers here. */
export function EditorPanel({
  priority, onPriorityChange,
  tags, onTagsChange, allTags,
  images, onImagesChange,
  changeNote, onChangeNoteChange,
  versionHint, onAttachFiles,
}: EditorPanelProps) {
  const tagDraft = useTagDraft({ tags, onChange: onTagsChange });

  const query = norm(tagDraft.value.replace(/^#/, ''));
  const suggestions = allTags.filter((t) => !tags.includes(t) && (!query || norm(t).includes(query)));

  return (
    <Rail basis={280}>
      <RailSection first label="Mức ưu tiên">
        <PrioritySegmented value={priority} onChange={onPriorityChange} />
      </RailSection>

      <RailSection first label="Thẻ">
        <TagInput
          tags={tags}
          value={tagDraft.value}
          onValueChange={tagDraft.setValue}
          onAdd={tagDraft.add}
          onRemove={tagDraft.remove}
          onRemoveLast={tagDraft.removeLast}
        />
        <TagSuggestions tags={suggestions} onAdd={tagDraft.add} />
      </RailSection>

      <RailSection first label="Hình ảnh đính kèm">
        <ImageGrid
          images={images}
          variant="editor"
          onRemove={(id) => onImagesChange(images.filter((im) => im.id !== id))}
        />
        <ImageDropzone onFiles={(files) => onAttachFiles(Array.from(files))} />
      </RailSection>

      <RailSection first label="Ghi chú phiên bản">
        <Input
          value={changeNote}
          placeholder="VD: Cập nhật liều theo ESC 2024"
          aria-label="Ghi chú phiên bản"
          onChange={(e) => onChangeNoteChange(e.target.value)}
        />
        <div className="text-12 leading-[1.5] text-faint">{versionHint}</div>
      </RailSection>
    </Rail>
  );
}
