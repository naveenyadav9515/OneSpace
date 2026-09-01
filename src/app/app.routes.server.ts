import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'expenses/edit/:id',
    renderMode: RenderMode.Client
  },
  {
    path: 'expenses/pending/:id/review',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
