import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Factory function that creates a role-based route guard.
 * Checks if the authenticated user has at least one of the required roles.
 * Redirects to /dashboard if user lacks required roles.
 *
 * @param allowedRoles - Array of role names that are permitted to access the route
 */
export function roleGuard(...allowedRoles: string[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    if (authService.hasAnyRole(allowedRoles)) {
      return true;
    }

    return router.createUrlTree(['/dashboard']);
  };
}

/**
 * Admin-only route guard.
 * Only users with the ADMIN role can access protected routes.
 */
export const adminGuard: CanActivateFn = (route, state) => {
  return roleGuard('ADMIN')(route, state);
};
