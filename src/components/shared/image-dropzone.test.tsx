import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageDropzone } from './image-dropzone';
import { ImageGrid } from './image-grid';

function fileList(files: File[]): FileList {
  const dt = { files, items: files, length: files.length } as unknown as DataTransfer;
  const list = files as unknown as FileList;
  Object.defineProperty(list, 'item', { value: (i: number) => files[i], configurable: true });
  void dt;
  return list;
}

describe('ImageDropzone', () => {
  it('shows the two-line Vietnamese copy', () => {
    render(<ImageDropzone onFiles={() => {}} />);
    expect(screen.getByText(/Kéo thả ảnh vào đây/)).toBeInTheDocument();
    expect(screen.getByText('hoặc chọn từ máy')).toBeInTheDocument();
  });

  it('uses the dashed line2 frame at rest', () => {
    render(<ImageDropzone onFiles={() => {}} />);
    const zone = screen.getByRole('button', { name: /Kéo thả ảnh vào đây/ });
    expect(zone.className).toContain('border-dashed');
    expect(zone.className).toContain('border-line2');
    expect(zone.className).toContain('rounded-10');
    expect(zone.className).toContain('py-20');
    expect(zone.className).toContain('px-16');
  });

  it('switches to accent border and accent-soft fill while dragging', () => {
    render(<ImageDropzone onFiles={() => {}} />);
    const zone = screen.getByRole('button', { name: /Kéo thả ảnh vào đây/ });
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('border-accent');
    expect(zone.className).toContain('bg-accent-soft');
    fireEvent.dragLeave(zone);
    expect(zone.className).toContain('border-line2');
  });

  it('emits dropped files and resets the drag state', () => {
    const onFiles = vi.fn();
    render(<ImageDropzone onFiles={onFiles} />);
    const zone = screen.getByRole('button', { name: /Kéo thả ảnh vào đây/ });
    const files = fileList([new File(['x'], 'a.png', { type: 'image/png' })]);
    fireEvent.drop(zone, { dataTransfer: { files } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(zone.className).toContain('border-line2');
  });

  it('accepts multiple images through the hidden file input', () => {
    const onFiles = vi.fn();
    const { container } = render(<ImageDropzone onFiles={onFiles} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, { target: { files: fileList([new File(['x'], 'b.png', { type: 'image/png' })]) } });
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});

describe('ImageGrid / ImageThumb', () => {
  const IMAGES = [
    { id: 'i1', label: 'ECG mẫu', src: '' },
    { id: 'i2', label: 'X-quang', src: '' },
  ];

  it('renders nothing when there are no images', () => {
    const { container } = render(<ImageGrid images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('emits a data-image-thumb hook per image and the detail grid template', () => {
    const { container } = render(<ImageGrid images={IMAGES} onOpen={() => {}} />);
    expect(container.querySelectorAll('[data-image-thumb]')).toHaveLength(2);
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns)
      .toBe('repeat(auto-fill, minmax(160px, 1fr))');
  });

  it('uses three fixed columns in editor mode and offers a remove button', () => {
    const onRemove = vi.fn();
    const { container } = render(<ImageGrid images={IMAGES} variant="editor" onRemove={onRemove} />);
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns)
      .toBe('repeat(3, minmax(0, 1fr))');
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh ECG mẫu' }));
    expect(onRemove).toHaveBeenCalledWith('i1');
  });

  it('opens a detail thumb by index', () => {
    const onOpen = vi.fn();
    render(<ImageGrid images={IMAGES} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh X-quang' }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
