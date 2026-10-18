import { esES } from '@clerk/localizations';

/**
 * clerkLocalization — Clerk's screens (sign-in, sign-up, user menu) in Spanish.
 *
 * Clerk ships no voseo variant, so we start from es-ES (the most complete one)
 * and override the strings users see most with the app's voseo. Nested keys are
 * spread level by level so the rest of es-ES survives.
 */
export const clerkLocalization = {
  ...esES,
  formFieldInputPlaceholder__emailAddress: 'Ingresá tu correo electrónico',
  formFieldInputPlaceholder__password: 'Ingresá tu contraseña',
  signIn: {
    ...esES.signIn,
    start: {
      ...esES.signIn?.start,
      title: 'Ingresá a {{applicationName}}',
      subtitle: '¡Hola de nuevo! Ingresá para continuar',
      actionText: '¿No tenés cuenta?',
      actionLink: 'Registrate',
    },
    password: {
      ...esES.signIn?.password,
      title: 'Ingresá tu contraseña',
      subtitle: 'Ingresá la contraseña de tu cuenta',
      actionLink: 'Usar otro método',
    },
  },
  signUp: {
    ...esES.signUp,
    start: {
      ...esES.signUp?.start,
      title: 'Creá tu cuenta',
      subtitle: 'Completá tus datos para empezar',
      actionText: '¿Ya tenés cuenta?',
      actionLink: 'Ingresá',
    },
  },
  userButton: {
    ...esES.userButton,
    action__addAccount: 'Agregar cuenta',
  },
};
