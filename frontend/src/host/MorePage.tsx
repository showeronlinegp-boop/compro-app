import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import type { AppModule } from './contract';
import { useActiveModule } from './nav/ActiveModule';
import { splitNavItems } from './nav/BottomNav';
import { Button } from './ui/Button';
import { ScreenHeader } from './ui/ScreenHeader';
import { IconChevron } from './ui/icons';
import { Card, List, ListRow, Pill, Section } from './ui/surfaces';

/**
 * Pantalla "Más" del host (guía §3.1): atajos del módulo que no entraron en
 * la barra, cambio de módulo (con más de uno) y cuenta.
 */
export function MorePage({ modules }: { modules: readonly AppModule[] }) {
  const navigate = useNavigate();
  const { module: active, items } = useActiveModule();
  const { overflow } = splitNavItems(items);

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <ScreenHeader variant="place" title="Más" />

      {active && overflow.length > 0 && (
        <Section title={active.label}>
          <List>
            {overflow.map((item) => (
              <ListRow
                key={item.id}
                leading={
                  <span className="text-ink" aria-hidden="true">
                    {item.icon}
                  </span>
                }
                title={item.label}
                trailing={<IconChevron size={20} className="text-ink-muted" />}
                onClick={() => navigate(item.to)}
              />
            ))}
          </List>
        </Section>
      )}

      {modules.length > 1 && (
        <Section title="Herramientas">
          <List>
            {modules.map((m) => (
              <ListRow
                key={m.id}
                title={m.label}
                trailing={
                  m === active ? (
                    <Pill>Estás acá</Pill>
                  ) : (
                    <IconChevron size={20} className="text-ink-muted" />
                  )
                }
                onClick={() => navigate(m.basePath)}
              />
            ))}
          </List>
        </Section>
      )}

      <Section title="Cuenta">
        <Card>
          <SignedIn>
            <div className="flex items-center gap-3">
              <UserButton afterSignOutUrl="/" />
              <span className="text-body text-ink">Tu cuenta</span>
            </div>
          </SignedIn>
          <SignedOut>
            <p className="m-0 mb-3 text-body-s text-ink-muted">
              Ingresá para guardar tus datos en tu cuenta.
            </p>
            <SignInButton mode="modal">
              <Button variant="primary" size="m" block>
                Ingresar
              </Button>
            </SignInButton>
          </SignedOut>
        </Card>
      </Section>
    </div>
  );
}
