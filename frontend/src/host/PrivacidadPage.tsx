import { CUIT, Lista, P, RESPONSABLE, Seccion, mail, useNoIndex } from './legal';
import { ScreenHeader } from './ui/ScreenHeader';

/**
 * Política de privacidad pública (`/privacidad`, sin sesión y fuera del layout).
 * Google la pide para publicar el login con Google. A pedido del dueño no se
 * enlaza desde ninguna pantalla y lleva noindex. Si la app empieza a guardar
 * un dato nuevo, este texto se actualiza en el mismo PR.
 */

const VIGENCIA = '30 de octubre de 2026';

export default function PrivacidadPage() {
  useNoIndex();
  return (
    <main className="min-h-[100dvh] bg-bg">
      <article className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-6">
        <ScreenHeader variant="place" title="Política de privacidad" />
        <p className="m-0 text-body-s text-ink-muted">Vigente desde el {VIGENCIA}.</p>

        <P>
          Neggo es una app para que los comercios lleven la libreta de fiado de sus clientes. Acá
          explicamos qué datos guarda, para qué los usa y cómo podés pedir que se corrijan o se
          borren.
        </P>

        <Seccion titulo="Quién es el responsable">
          <P>
            {RESPONSABLE}, CUIT {CUIT}. Contacto: {mail}.
          </P>
        </Seccion>

        <Seccion titulo="Qué datos guardamos">
          <P>Del comercio que usa la app:</P>
          <Lista
            items={[
              'El email con el que se registra. Si entra con Google, también recibimos su nombre y foto de perfil.',
              'El nombre del comercio, el alias para cobrar, los textos de los mensajes y, si los usa, las condiciones del recargo por atraso.',
              'La fecha en que aceptó los términos del recargo por atraso, si lo activa.',
              'Cómo usa la app: qué pantallas abre y cuándo, si envió un comprobante por WhatsApp, si la instaló y si la usa desde el celular o la compu. Esto no incluye datos de sus clientes.',
            ]}
          />
          <P>De los clientes que el comercio carga en su libreta:</P>
          <Lista
            items={[
              'Nombre y, si el comercio lo agrega, teléfono, una etiqueta, un límite de fiado y la fecha del próximo cobro.',
              'Cada fiado, pago, recargo o corrección, con su monto, una nota opcional y la fecha.',
              'La fecha de cada recordatorio de pago que el comercio prepara y de cada aviso de las condiciones de recargo, con el texto que se le informó.',
            ]}
          />
          <P>
            No guardamos contraseñas (de eso se encarga Clerk, nuestro proveedor de inicio de
            sesión), ni datos de tarjetas, ni la ubicación.
          </P>
        </Seccion>

        <Seccion titulo="Para qué los usamos">
          <P>
            Para que la app funcione: mostrarle al comercio sus clientes, sus saldos y su historial,
            y armar los mensajes de comprobante y recordatorio. No vendemos datos, no los usamos
            para publicidad y no los compartimos con otros comercios: cada comercio ve únicamente su
            propia libreta.
          </P>
          <P>
            Para mejorar la app: medimos qué funciones se usan y cuáles no (por ejemplo, cuántos
            comercios anotan pagos o mandan recordatorios). Para eso miramos cantidades por
            comercio, nunca los nombres, teléfonos ni montos de sus clientes. Esta medición la
            hacemos nosotros, sin herramientas de analítica de terceros, y guardamos el registro de
            uso por hasta 400 días.
          </P>
          <P>
            Los movimientos no se pueden borrar ni editar. Si hubo un error, se registra una
            corrección visible. Así nadie puede hacer desaparecer una deuda o un pago a escondidas.
          </P>
        </Seccion>

        <Seccion titulo="Los datos de los clientes del comercio">
          <P>
            Los datos de sus clientes los carga el comercio, que es responsable de tenerlos por su
            relación comercial con ellos. Neggo los guarda por cuenta del comercio y solo para
            prestarle el servicio.
          </P>
          <P>
            Los mensajes por WhatsApp los arma la app, pero los envía el comercio desde su propio
            WhatsApp. Neggo no envía mensajes ni lee conversaciones.
          </P>
        </Seccion>

        <Seccion titulo="Con quién trabajamos">
          <P>
            Para funcionar usamos estos proveedores, que pueden guardar datos fuera de la Argentina,
            en Estados Unidos:
          </P>
          <Lista
            items={[
              'Clerk: inicio de sesión y cuentas.',
              'Railway: servidores y base de datos.',
              'Google: solo si el comercio elige entrar con su cuenta de Google.',
              'Cloudflare: el dominio neggo.com.ar.',
            ]}
          />
        </Seccion>

        <Seccion titulo="Cookies">
          <P>
            Usamos solo las cookies necesarias para mantener la sesión iniciada. No usamos cookies
            de publicidad ni de analítica: la medición de uso no usa cookies.
          </P>
        </Seccion>

        <Seccion titulo="Seguridad y conservación">
          <P>
            Toda la comunicación viaja cifrada (HTTPS) y para ver los datos hay que iniciar sesión.
            Hacemos copias de seguridad de la base de datos.
          </P>
          <P>
            Guardamos los datos mientras la cuenta esté activa. Si el comercio pide la baja,
            borramos su cuenta y todos los datos de su libreta dentro de los 30 días, salvo que una
            ley nos obligue a conservarlos. Las copias de seguridad se renuevan y los datos borrados
            dejan de estar en ellas con el tiempo.
          </P>
        </Seccion>

        <Seccion titulo="Tus derechos">
          <P>
            Podés pedir acceso a tus datos, corregirlos, actualizarlos o pedir que los borremos,
            escribiendo a {mail}. Es gratis. Respondemos los pedidos de acceso dentro de los 10 días
            corridos y los de corrección o borrado dentro de los 5 días hábiles, como indica la Ley
            25.326 de Protección de Datos Personales.
          </P>
          <P>
            Si sos cliente de un comercio que usa Neggo, podés pedírselo al comercio o escribirnos:
            lo resolvemos con él.
          </P>
          <P>
            La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la
            Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan
            quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en
            materia de protección de datos personales.
          </P>
        </Seccion>

        <Seccion titulo="Menores de edad">
          <P>La app está pensada para comercios y la deben usar personas mayores de 18 años.</P>
        </Seccion>

        <Seccion titulo="Cambios">
          <P>
            Si cambiamos esta política, actualizamos la fecha de arriba. Si el cambio es importante,
            lo avisamos dentro de la app.
          </P>
        </Seccion>
      </article>
    </main>
  );
}
