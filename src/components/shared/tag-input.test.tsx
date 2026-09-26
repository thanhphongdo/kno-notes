import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagInput } from './tag-input';
import { MAX_TAG_SUGGESTIONS, TagSuggestions } from './tag-suggestions';

function renderInput(overrides: Partial<ComponentProps<typeof TagInput>> = {}) {
  const props: ComponentProps<typeof TagInput> = {
    tags: ['Tim mạch'],
    value: '',
    onValueChange: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onRemoveLast: vi.fn(),
    ...overrides,
  };
  render(<TagInput {...props} />);
  return props;
}

describe('TagInput', () => {
  it('uses the 44px-minimum bordered field with 8px padding', () => {
    const { container } = render(
      <TagInput tags={[]} value="" onValueChange={() => {}} onAdd={() => {}} onRemove={() => {}} onRemoveLast={() => {}} />,
    );
    const field = container.firstElementChild as HTMLElement;
    expect(field.className).toContain('min-h-44');
    expect(field.className).toContain('p-8');
    expect(field.className).toContain('gap-6');
    expect(field.className).toContain('rounded-10');
    expect(field.className).toContain('border-line');
  });

  it('renders each tag as an accent-soft chip with a remove button', async () => {
    const onRemove = vi.fn();
    renderInput({ onRemove });
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ thẻ Tim mạch' }));
    expect(onRemove).toHaveBeenCalledWith('Tim mạch');
  });

  it('adds on Enter', async () => {
    const onAdd = vi.fn();
    renderInput({ value: 'Nội tiết', onAdd });
    screen.getByPlaceholderText('Thêm thẻ…').focus();
    await userEvent.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Nội tiết');
  });

  it('adds when the value ends with a comma', async () => {
    const onAdd = vi.fn();
    const onValueChange = vi.fn();
    renderInput({ value: 'Nội tiết', onAdd, onValueChange });
    await userEvent.type(screen.getByPlaceholderText('Thêm thẻ…'), ',');
    expect(onAdd).toHaveBeenCalledWith('Nội tiết,');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace in an empty field', async () => {
    const onRemoveLast = vi.fn();
    renderInput({ value: '', onRemoveLast });
    screen.getByPlaceholderText('Thêm thẻ…').focus();
    await userEvent.keyboard('{Backspace}');
    expect(onRemoveLast).toHaveBeenCalledTimes(1);
  });

  it('does not remove the last tag when the field has text', async () => {
    const onRemoveLast = vi.fn();
    renderInput({ value: 'Nội', onRemoveLast });
    screen.getByPlaceholderText('Thêm thẻ…').focus();
    await userEvent.keyboard('{Backspace}');
    expect(onRemoveLast).not.toHaveBeenCalled();
  });
});

describe('TagSuggestions', () => {
  it('caps the list at six', () => {
    expect(MAX_TAG_SUGGESTIONS).toBe(6);
  });

  it('renders nothing when empty', () => {
    const { container } = render(<TagSuggestions tags={[]} onAdd={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prefixes each suggestion with a plus and adds it', async () => {
    const onAdd = vi.fn();
    render(<TagSuggestions tags={['Hô hấp']} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Hô hấp' }));
    expect(onAdd).toHaveBeenCalledWith('Hô hấp');
  });

  it('never renders more than six chips', () => {
    render(<TagSuggestions tags={['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']} onAdd={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });
});
