import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CUIT, Lista, P, RESPONSABLE, Seccion, mail, useNoIndex } from './legal';
import { ScreenHeader } from './ui/ScreenHeader';

/**
 * Términos y condiciones públicos (`/terminos`, sin sesión y fuera del layout).
 * Se enlazan desde el diálogo que activa los recargos por atraso, que los
 * hace aceptar. La fecha de vigencia es la versión que guarda el backend
 * (`TERMINOS_RECARGO_VERSION`): si la sección de recargos cambia de fondo,
 * se actualizan las dos en el mismo PR y se vuelve a pedir la aceptación.
 */

const VIGENCIA = '30 de octubre de 2026';

/** Con `#recargos` en la URL, baja hasta esa sección (el router no lo hace solo). */
function useScrollAlAncla() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
}

export default function TerminosPage() {
  useNoIndex();
  useScrollAlAncla();
  return (
    <main className="min-h-[100dvh] bg-bg">
      <article className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-6">
        <ScreenHeader variant="place" title="Términos y condiciones" />
        <p className="m-0 text-body-s text-ink-muted">Vigentes desde el {VIGENCIA}.</p>

        <P>
          Estos términos regulan el uso de Neggo, una app para que los comercios lleven la libreta
          de fiado de sus clientes. Al usar la app los aceptás. Si no estás de acuerdo, no la uses.
        </P>

        <Seccion titulo="Quién presta el servicio">
          <P>
            {RESPONSABLE}, CUIT {CUIT}. Contacto: {mail}.
          </P>
        </Seccion>

        <Seccion titulo="Tu cuenta">
          <Lista
            items={[
              'La app la deben usar personas mayores de 18 años, para su comercio.',
              'Sos responsable de cuidar el acceso a tu cuenta y de lo que se haga con ella.',
              'Si notás un uso que no reconocés, escribinos.',
            ]}
          />
        </Seccion>

        <Seccion titulo="Tu libreta y tus clientes">
          <P>
            Los clientes, fiados y pagos los cargás vos. Neggo es una herramienta para anotarlos: no
            es parte de las operaciones entre vos y tus clientes, no presta dinero, no cobra deudas
            y no garantiza que tus clientes paguen.
          </P>
          <P>
            Sos responsable de que lo que anotás sea correcto y de tener los datos de tus clientes
            por tu relación comercial con ellos. Cómo los guardamos lo explica la{' '}
            <a className="text-ink underline" href="/privacidad">
              Política de privacidad
            </a>
            .
          </P>
        </Seccion>

        <Seccion titulo="Mensajes por WhatsApp">
          <P>
            La app arma comprobantes, recordatorios y avisos, pero los mandás vos desde tu propio
            WhatsApp. Sos responsable de lo que enviás y de respetar las reglas de WhatsApp. No uses
            la app para mandar mensajes que tus clientes no esperan.
          </P>
        </Seccion>

        <Seccion id="recargos" titulo="Recargo por atraso">
          <P>
            Es una función opcional y viene apagada. Si la activás, Neggo calcula y te sugiere
            recargos para los fiados atrasados según las condiciones que vos configurás. Nada se
            suma a la cuenta de un cliente sin que lo confirmes.
          </P>
          <P>Al activarla aceptás que:</P>
          <Lista
            items={[
              'Las condiciones (porcentaje o monto, esquema y días de gracia) las fijás vos. Sos el único responsable de que sean legales y razonables, y de cumplir las normas que correspondan, como las de defensa del consumidor. Los jueces pueden reducir recargos o intereses que consideren desproporcionados.',
              'Antes de cobrarle un recargo a un cliente tenés que informarle las condiciones, y volver a hacerlo cada vez que las cambies en su contra. La app te pide registrar ese aviso, por WhatsApp o con “Cambio informado”. Ese registro es una declaración tuya: Neggo no verifica que el cliente lo haya recibido ni aceptado.',
              'Los recargos son sugerencias calculadas con las reglas que muestra la app. Revisá cada uno antes de sumarlo: podés no cobrarlo o perdonarlo después. Si encontrás un error, avisanos.',
              'Neggo no da asesoramiento legal, contable ni impositivo. Si tenés dudas sobre qué recargo podés cobrar, consultá con un profesional.',
              'Neggo no responde por reclamos, multas ni sanciones que surjan de los recargos que cobres. Si un cliente le reclama a Neggo por un recargo tuyo, te hacés cargo de ese reclamo.',
            ]}
          />
          <P>
            Guardamos la fecha en que aceptás estos términos y cada aviso de condiciones que
            registrás, con el texto que se le informó al cliente.
          </P>
        </Seccion>

        <Seccion titulo="Uso permitido">
          <P>
            No uses Neggo para actividades ilegales, para intentar ver datos de otros comercios ni
            para afectar el funcionamiento del servicio. Podemos suspender una cuenta que incumpla
            estos términos.
          </P>
        </Seccion>

        <Seccion titulo="Disponibilidad y responsabilidad">
          <P>
            Hacemos lo posible para que la app funcione bien y sin cortes, pero puede haber
            interrupciones o errores. En la medida en que la ley lo permita, Neggo no responde por
            daños indirectos ni por decisiones que tomes con la información de la app.
          </P>
        </Seccion>

        <Seccion titulo="Baja">
          <P>
            Podés dejar de usar la app cuando quieras y pedir que borremos tu cuenta escribiendo a{' '}
            {mail}.
          </P>
        </Seccion>

        <Seccion titulo="Cambios">
          <P>
            Si cambiamos estos términos, actualizamos la fecha de arriba. Si el cambio es
            importante, lo avisamos dentro de la app. Si cambia la sección de recargo por atraso, te
            vamos a pedir que la aceptes de nuevo.
          </P>
        </Seccion>

        <Seccion titulo="Ley aplicable">
          <P>Estos términos se rigen por las leyes de la República Argentina.</P>
        </Seccion>
      </article>
    </main>
  );
}
