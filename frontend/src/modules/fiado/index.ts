import { createElement } from 'react';
import type { AppModule, NavItem } from '../../host/contract';
import { IconClients, IconHome, IconSettings } from '../../host/ui/icons';
import { AnotarFiado, RegistrarPago } from './pages/Anotar';
import Ajustes from './pages/Ajustes';
import Clientes from './pages/Clientes';
import Ficha from './pages/Ficha';
import Inicio from './pages/Inicio';
import Listo from './pages/Listo';
import NuevoCliente from './pages/NuevoCliente';
import Recordar from './pages/Recordar';
import { BASE, RUTAS } from './rutas';

const nav: NavItem[] = [
  { id: 'inicio', to: RUTAS.inicio, label: 'Inicio', icon: createElement(IconHome), end: true },
  { id: 'clientes', to: RUTAS.clientes, label: 'Clientes', icon: createElement(IconClients) },
  { id: 'ajustes', to: RUTAS.ajustes, label: 'Ajustes', icon: createElement(IconSettings) },
];

/**
 * Manifest de Fiado: libreta de fiado del comercio (openspec/changes/fiado).
 * Sin `headerActions`: cada pantalla trae su propio encabezado (guía §3.1).
 * Todas las rutas piden sesión: los datos son del comercio.
 */
export const fiado: AppModule = {
  id: 'fiado',
  label: 'Fiado',
  basePath: BASE,
  routes: [
    { id: 'inicio', path: '', component: Inicio, auth: 'required', title: 'Inicio' },
    { id: 'clientes', path: 'clientes', component: Clientes, auth: 'required', title: 'Clientes' },
    {
      id: 'nuevo-cliente',
      path: 'clientes/nuevo',
      component: NuevoCliente,
      auth: 'required',
      title: 'Nuevo cliente',
      chrome: 'task',
    },
    { id: 'ficha', path: 'clientes/:id', component: Ficha, auth: 'required', title: 'Cliente' },
    {
      id: 'anotar',
      path: 'anotar',
      component: AnotarFiado,
      auth: 'required',
      title: 'Anotar fiado',
      chrome: 'task',
    },
    {
      id: 'pago',
      path: 'pago',
      component: RegistrarPago,
      auth: 'required',
      title: 'Registrar pago',
      chrome: 'task',
    },
    {
      id: 'listo',
      path: 'listo',
      component: Listo,
      auth: 'required',
      title: 'Listo',
      chrome: 'task',
    },
    {
      id: 'recordar',
      path: 'recordar/:id',
      component: Recordar,
      auth: 'required',
      title: 'Recordar pago',
      chrome: 'task',
    },
    { id: 'ajustes', path: 'ajustes', component: Ajustes, auth: 'required', title: 'Ajustes' },
  ],
  useNav: () => nav,
};
