import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Info, Keyboard, KeyRound, LogOut, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, type ThemeId } from '@/contexts/ThemeContext';
import { roleLabel, initials } from './role-label';

export interface UserMenuUser {
  fullName?: string | null;
  username?: string | null;
  role?: string | null;
}

interface UserMenuProps {
  user: UserMenuUser | null;
  companyName?: string | null;
  onChangePassword: () => void;
  onOpenShortcuts: () => void;
  onOpenAbout: () => void;
  onLogout: () => void;
}

const THEME_OPTIONS: { id: ThemeId; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Terang', icon: Sun },
  { id: 'dark', label: 'Gelap', icon: Moon },
  { id: 'system', label: 'Sistem', icon: Monitor },
];

const contentClass =
  'z-[var(--z-dropdown)] min-w-[14rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-2)] ' +
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

const itemClass =
  'relative flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground outline-none transition-colors ' +
  'data-[highlighted]:bg-accent data-[highlighted]:shadow-[inset_2px_0_0_var(--primary)] data-[state=open]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ' +
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';

const Separator = () => <Menu.Separator className="-mx-1 my-1 h-px bg-border" />;

/** Avatar menu: identity, password, theme, shortcuts, about, sign out. */
export function UserMenu({ user, companyName, onChangePassword, onOpenShortcuts, onOpenAbout, onLogout }: UserMenuProps) {
  const { theme, setTheme } = useTheme();
  const name = user?.fullName || user?.username || 'Pengguna';
  const role = roleLabel(user?.role);
  // Seed/admin accounts are often named after their role; don't print it twice.
  const showRole = role.localeCompare(name, 'id-ID', { sensitivity: 'base' }) !== 0;
  const ThemeIcon = THEME_OPTIONS.find((o) => o.id === theme)?.icon ?? Monitor;

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={`Menu pengguna: ${name}`}
        className={cn(
          'flex h-9 items-center gap-2 rounded-full pr-1 pl-0.5 transition-colors hover:bg-accent xl:rounded-md xl:pr-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          'data-[state=open]:bg-accent',
        )}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-foreground"
        >
          {initials(name)}
        </span>
        <span className="hidden min-w-0 flex-col items-start text-left leading-tight xl:flex">
          <span className="max-w-[10rem] truncate text-sm font-medium text-foreground">{name}</span>
          {showRole && <span className="text-xs text-muted-foreground">{role}</span>}
        </span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={cn(contentClass, 'w-64')}>
          <div className="flex items-center gap-3 px-2.5 py-2">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary-subtle-foreground"
            >
              {initials(name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              {showRole && <p className="truncate text-xs text-muted-foreground">{role}</p>}
              {companyName && <p className="truncate text-xs text-muted-foreground">{companyName}</p>}
            </div>
          </div>
          <Separator />

          <Menu.Item className={itemClass} onSelect={onChangePassword}>
            <KeyRound aria-hidden />
            Ganti Kata Sandi
          </Menu.Item>

          <Menu.Sub>
            <Menu.SubTrigger className={itemClass}>
              <Palette aria-hidden />
              <span className="flex-1">Tema</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ThemeIcon aria-hidden className="!size-3.5" />
                {THEME_OPTIONS.find((o) => o.id === theme)?.label}
              </span>
              <ChevronRight aria-hidden />
            </Menu.SubTrigger>
            <Menu.Portal>
              <Menu.SubContent sideOffset={6} alignOffset={-4} className={cn(contentClass, 'min-w-[10rem]')}>
                <Menu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeId)}>
                  {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
                    <Menu.RadioItem key={id} value={id} className={cn(itemClass, 'pr-8')}>
                      <Icon aria-hidden />
                      {label}
                      <Menu.ItemIndicator className="absolute right-2.5 flex items-center">
                        <Check aria-hidden className="!text-primary" />
                      </Menu.ItemIndicator>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>

          <Menu.Item className={itemClass} onSelect={onOpenShortcuts}>
            <Keyboard aria-hidden />
            <span className="flex-1">Pintasan Keyboard</span>
            <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground">?</kbd>
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={onOpenAbout}>
            <Info aria-hidden />
            Tentang Entaris
          </Menu.Item>
          <Separator />
          <Menu.Item
            className={cn(itemClass, 'text-danger-text data-[highlighted]:bg-danger-subtle [&_svg]:text-danger-text')}
            onSelect={onLogout}
          >
            <LogOut aria-hidden />
            Keluar
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
