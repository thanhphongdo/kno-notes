'use client';

import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';

export type EditorCommand =
  | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'formatBlock'
  | 'insertUnorderedList' | 'insertOrderedList' | 'insertHorizontalRule' | 'undo' | 'redo';

export interface EditorTool {
  /** Typographic glyph, never an emoji (Design Spec §05). */
  label: string;
  title: string;
  command: EditorCommand;
  value?: string;
  fontWeight?: 500 | 700;
  italic?: boolean;
  textDecoration?: 'underline' | 'line-through';
  serif?: boolean;
}

/** Exactly the prototype's four groups. All labels are typographic glyphs, not emoji. */
export const EDITOR_TOOL_GROUPS: readonly (readonly EditorTool[])[] = [
  [
    { label: 'B', title: 'Đậm', command: 'bold', fontWeight: 700, serif: true },
    { label: 'I', title: 'Nghiêng', command: 'italic', italic: true, serif: true },
    { label: 'U', title: 'Gạch chân', command: 'underline', textDecoration: 'underline', serif: true },
    { label: 'S', title: 'Gạch ngang', command: 'strikeThrough', textDecoration: 'line-through', serif: true },
  ],
  [
    { label: 'H2', title: 'Tiêu đề lớn', command: 'formatBlock', value: '<h2>' },
    { label: 'H3', title: 'Tiêu đề nhỏ', command: 'formatBlock', value: '<h3>' },
    { label: '¶', title: 'Đoạn văn', command: 'formatBlock', value: '<p>' },
  ],
  [
    { label: '•', title: 'Danh sách', command: 'insertUnorderedList', fontWeight: 700 },
    { label: '1.', title: 'Danh sách số', command: 'insertOrderedList' },
    { label: '❝', title: 'Trích dẫn', command: 'formatBlock', value: '<blockquote>', serif: true },
    { label: '—', title: 'Đường kẻ', command: 'insertHorizontalRule' },
  ],
  [
    { label: '↶', title: 'Hoàn tác', command: 'undo' },
    { label: '↷', title: 'Làm lại', command: 'redo' },
  ],
];

export interface EditorToolbarProps {
  onCommand: (command: EditorCommand, value?: string) => void;
  onPickImage: () => void;
  className?: string;
}

/** sticky top 64 · z5 · gap 6 · py 8 px 10 · border-bottom --line · r 14 14 0 0. */
export function EditorToolbar({ onCommand, onPickImage, className }: EditorToolbarProps) {
  return (
    <div
      className={cn(
        'sticky top-64 flex flex-wrap items-center gap-6 rounded-t-14 border-b border-line bg-surface py-8 px-10',
        className,
      )}
      style={{ zIndex: Z.toolbar }}
    >
      {EDITOR_TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="flex gap-2 border-r border-line pr-6">
          {group.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              // onMouseDown + preventDefault keeps the editor selection alive.
              onMouseDown={(e) => {
                e.preventDefault();
                onCommand(tool.command, tool.value);
              }}
              className={cn(
                'h-32 min-w-32 rounded-7 border-0 bg-transparent px-6 text-14 text-text hover:bg-surface2',
                tool.serif ? 'font-serif' : 'font-sans',
                tool.fontWeight === 700 ? 'font-bold' : 'font-medium',
                tool.italic && 'italic',
                tool.textDecoration === 'underline' && 'underline',
                tool.textDecoration === 'line-through' && 'line-through',
              )}
            >
              {tool.label}
            </button>
          ))}
        </div>
      ))}

      <button
        type="button"
        title="Chèn ảnh vào nội dung"
        aria-label="Chèn ảnh vào nội dung"
        onMouseDown={(e) => {
          e.preventDefault();
          onPickImage();
        }}
        className="flex h-32 items-center gap-6 rounded-7 border-0 bg-transparent px-10 text-13 text-text hover:bg-surface2"
      >
        <Icon name="image" size={16} />
        Ảnh
      </button>
    </div>
  );
}
