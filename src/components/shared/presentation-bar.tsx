'use client';

import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Popover } from '@/components/ui/popover';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import type { BrandKit, PresentationMotion } from '@/lib/presentation/schema';
import {
  BACKGROUND_LABEL, BRAND_KIT_LABEL, BRAND_KITS_UI, EDGE_BACKGROUNDS, FIELD_BACKGROUNDS,
  MOTION_LABEL, MOTIONS, slideNumber, type BackgroundName, type ResolvedView,
} from '@/lib/presentation/view';
import type { Theme } from '@/lib/theme';

const MOTION_OPTIONS: readonly SegmentedOption<PresentationMotion>[] = MOTIONS.map((m) => ({
  value: m,
  label: MOTION_LABEL[m],
}));

const BACKGROUND_GROUPS: readonly { label: string; items: readonly BackgroundName[] }[] = [
  { label: 'Không nền', items: ['none'] },
  { label: 'Chỉ chạm ở rìa', items: EDGE_BACKGROUNDS },
  { label: 'Phủ toàn trang', items: FIELD_BACKGROUNDS },
];

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-7">
      <span className="text-12 text-muted">{label}</span>
      {children}
    </div>
  );
}

export interface PresentationBarProps {
  index: number;
  total: number;
  view: ResolvedView;
  /** `true` khi `localStorage` đang giữ một lựa chọn cá nhân nào đó. */
  prefsStored: boolean;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onStep: (delta: number) => void;
  onExit: () => void;
  onBrandKit: (kit: BrandKit) => void;
  onPattern: (pattern: BackgroundName) => void;
  onMotion: (motion: PresentationMotion) => void;
  onResetToNoteDefaults: () => void;
  /** Sáng/tối vẫn là thiết lập của app, nên thanh chỉ nhận vào và báo ra. */
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  className?: string;
}

/**
 * Thanh điều khiển dưới sân khấu. Người xem đổi được **bộ màu / nền / mức
 * chuyển động** — ba thứ không chạm vào bố cục. **Mẫu thì không**: người soạn
 * chọn `clinical` vì bài là phác đồ nhiều bảng, và đặt bài đó sang bố cục khác
 * thì vỡ (xem `docs/presentation.md`).
 *
 * Cả ba lựa chọn nằm trong đúng MỘT bảng, cho cả desktop lẫn điện thoại. Mockup
 * để hàng bộ màu nằm thẳng trên thanh ở desktop và chuyển nó vào bảng dưới
 * 820px; dựng cả hai nghĩa là hai bản markup cho cùng một hàng nút.
 */
export function PresentationBar({
  index, total, view, prefsStored, optionsOpen, onOptionsOpenChange,
  onStep, onExit, onBrandKit, onPattern, onMotion, onResetToNoteDefaults,
  theme, onThemeChange, className,
}: PresentationBarProps) {
  return (
    <div className={cn('kn-bar', className)}>
      <div className="flex items-center gap-8">
        <IconButton
          icon="arrow-left"
          label="Thoát trình chiếu, về chế độ đọc"
          size={36}
          radius="9"
          iconSize={20}
          onClick={onExit}
        />
        <div className="flex items-center gap-4">
          <IconButton
            icon="chevron-left"
            label="Slide trước"
            variant="bordered"
            size={36}
            radius="9"
            iconSize={20}
            disabled={index === 0}
            className="disabled:text-faint disabled:opacity-35"
            onClick={() => onStep(-1)}
          />
          <IconButton
            icon="chevron-right"
            label="Slide sau"
            variant="bordered"
            size={36}
            radius="9"
            iconSize={20}
            disabled={index >= total - 1}
            className="disabled:text-faint disabled:opacity-35"
            onClick={() => onStep(1)}
          />
        </div>
        <span className="kn-counter" data-testid="kn-counter">
          <b>{slideNumber(index)}</b>
          {` / ${total}`}
        </span>
      </div>

      <span className="flex-1" />
      <span className="kn-hint text-12 whitespace-nowrap text-faint">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        {' chuyển slide · '}
        <Kbd>Esc</Kbd>
        {' thoát'}
      </span>
      <span className="flex-1" />

      <Popover
        open={optionsOpen}
        onOpenChange={onOptionsOpenChange}
        align="end"
        placement="above"
        offset={10}
        backdropZ={Z.presentBackdrop}
        panelZ={Z.presentPanel}
        panelLabel="Bộ màu, nền và mức chuyển động"
        // Trừ 64px: đúng bằng chỗ nút mở bảng và nút sáng/tối chiếm ở mép
        // phải, nên bảng luôn còn lề trái ở mọi bề ngang màn hình.
        panelClassName="flex w-[min(352px,calc(100vw-64px))] flex-col gap-14 p-14"
        wrapperClassName="shrink-0"
        trigger={
          <IconButton
            icon="sliders"
            label="Bộ màu, nền và mức chuyển động"
            size={36}
            radius="9"
            iconSize={20}
            aria-expanded={optionsOpen}
            tone={view.hasOverride ? 'accent' : 'muted'}
            onClick={() => onOptionsOpenChange(!optionsOpen)}
          />
        }
      >
        <OptionRow label="Bộ màu">
          <div className="flex items-center gap-6">
            {BRAND_KITS_UI.map((kit) => (
              <button
                key={kit}
                type="button"
                className="kn-kit"
                data-kit={kit}
                aria-pressed={view.brandKit === kit}
                title={`Bộ màu ${BRAND_KIT_LABEL[kit]}`}
                aria-label={`Bộ màu ${BRAND_KIT_LABEL[kit]}`}
                onClick={() => onBrandKit(kit)}
              >
                <i />
              </button>
            ))}
          </div>
        </OptionRow>

        <OptionRow label="Nền">
          <div className="flex max-h-248 flex-col gap-10 overflow-y-auto pr-2">
            {BACKGROUND_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-6">
                <span className="text-11 text-faint">{group.label}</span>
                <div className="grid grid-cols-3 gap-x-6 gap-y-8">
                  {group.items.map((name) => (
                    <div key={name} className="flex min-w-0 flex-col gap-3">
                      <button
                        type="button"
                        className="kn-bg-swatch"
                        aria-pressed={view.pattern === name}
                        aria-label={`Nền ${BACKGROUND_LABEL[name]}`}
                        onClick={() => onPattern(name)}
                      >
                        {name === 'none' ? null : (
                          <span className="kn-bg" data-pattern={name} aria-hidden="true" />
                        )}
                      </button>
                      {/* Ô xem trước co lại chỉ còn ~100px nên hoa văn rất khó
                          thấy; tên viết ra là thứ dùng được, nhất là trên điện
                          thoại nơi không có hover để đọc `title`. */}
                      <span
                        className={cn(
                          'truncate text-center text-11',
                          view.pattern === name ? 'text-accent' : 'text-faint',
                        )}
                      >
                        {BACKGROUND_LABEL[name]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </OptionRow>

        <OptionRow label="Chuyển động">
          <Segmented
            options={MOTION_OPTIONS}
            value={view.motionChoice}
            onChange={onMotion}
            ariaLabel="Mức chuyển động"
            columns={3}
          />
          {view.reducedMotionWins ? (
            <span className="text-11 leading-[1.5] text-faint">
              Hệ điều hành đang bật chế độ giảm chuyển động, nên mọi hiệu ứng đã tắt.
            </span>
          ) : null}
        </OptionRow>

        {prefsStored ? (
          <div className="flex flex-col gap-8 border-t border-line pt-12">
            {view.hasOverride ? (
              <span className="text-11 leading-[1.5] text-muted">
                Đang hiển thị theo lựa chọn của bạn, không phải lựa chọn của người soạn bài.
              </span>
            ) : null}
            <button
              type="button"
              onClick={onResetToNoteDefaults}
              className="flex items-center gap-8 self-start border-0 bg-transparent p-0 text-13 text-muted hover:text-text"
            >
              <Icon name="history" size={15} />
              Về mặc định của bài
            </button>
          </div>
        ) : null}
      </Popover>

      {theme && onThemeChange ? (
        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
          size={36}
          radius="9"
          iconSize={20}
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
        />
      ) : null}
    </div>
  );
}
