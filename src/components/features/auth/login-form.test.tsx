import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_ERROR, LoginForm } from './login-form';

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => search,
}));

const okResponse = { ok: true, status: 200, json: async () => ({ user: { id: 'u1' } }) };
const badResponse = {
  ok: false,
  status: 401,
  json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: LOGIN_ERROR } }),
};

describe('LoginForm', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    refresh.mockClear();
    search = new URLSearchParams();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the exact prototype copy', () => {
    render(<LoginForm appName="Kno-Notes" showDemoHint />);
    expect(screen.getByText('Kno-Notes')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(
      screen.getByText('Sổ tay kiến thức cá nhân. Đăng nhập để tiếp tục.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Demo · bacsi / 123456')).toBeInTheDocument();
  });

  it('shows the exact error copy on bad credentials and clears it when the user retypes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badResponse));
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Sai tên đăng nhập hoặc mật khẩu.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Mật khẩu'), 'x');
    expect(screen.queryByText('Sai tên đăng nhập hoặc mật khẩu.')).toBeNull();
  });

  it('submits on Enter and navigates to the dashboard on success', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
    await user.type(screen.getByLabelText('Mật khẩu'), '123456{Enter}');

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1].body))).toEqual({
      username: 'bacsi',
      password: '123456',
    });
    expect(replace).toHaveBeenCalledWith('/');
    expect(refresh).toHaveBeenCalled();
  });

  it('trims the username but never the password', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), '  bacsi  ');
    await user.type(screen.getByLabelText('Mật khẩu'), ' 123456 {Enter}');

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1].body))).toEqual({
      username: 'bacsi',
      password: ' 123456 ',
    });
  });

  it('shows the same message when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
    await user.type(screen.getByLabelText('Mật khẩu'), '123456{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(LOGIN_ERROR);
  });

  it('returns the visitor to the page the middleware bounced them off', async () => {
    search = new URLSearchParams('next=/notes/n1?v=2');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse));
    const user = userEvent.setup();
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
    await user.type(screen.getByLabelText('Mật khẩu'), '123456{Enter}');

    expect(replace).toHaveBeenCalledWith('/notes/n1?v=2');
  });

  it('refuses an off-site next parameter and falls back to the dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse));
    const user = userEvent.setup();

    for (const hostile of ['https://evil.test/steal', '//evil.test/steal', 'javascript:alert(1)']) {
      search = new URLSearchParams();
      search.set('next', hostile);
      replace.mockClear();
      const view = render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);

      await user.type(screen.getByLabelText('Tên đăng nhập'), 'bacsi');
      await user.type(screen.getByLabelText('Mật khẩu'), '123456{Enter}');

      expect(replace, hostile).toHaveBeenCalledWith('/');
      view.unmount();
    }
  });

  it('hides the demo hint outside development', () => {
    render(<LoginForm appName="Kno-Notes" showDemoHint={false} />);
    expect(screen.queryByText(/Demo ·/)).toBeNull();
  });
});
