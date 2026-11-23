import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const CLIENT_PREFIXES = ['/client-dashboard'];

const PROTECTED_PREFIXES = [
  '/overview',
  '/projects',
  '/clients',
  '/countries',
  '/requirements',
  '/procedure',
  '/services',
  '/fees',
  '/admin',
  '/spreadsheet',
  '/vat',
  '/quotations',
  '/notifications',
  '/customer-service',
  '/users',
  '/roles',
  '/audit-logs',
  '/statements',
  '/poa',
  '/schedule-of-fees',
  '/client-dashboard-cards',
  '/video-tutorials',
  '/admin-account',
  '/client-dashboard',
];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate request ID for correlated logging
  const requestId = crypto.randomUUID();
  request.headers.set('x-request-id', requestId);

  if (!isProtected(pathname)) {
    const res = withSecurityHeaders(NextResponse.next());
    res.headers.set('x-request-id', requestId);
    return res;
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Device session validation for client routes
  const isClientRoute = CLIENT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  if (isClientRoute) {
    const fp = request.cookies.get('aipt-device-fp')?.value;
    if (fp) {
      // Short-lived validation cache cookie (60s) to avoid DB hit on every request
      const cacheKey = `aipt-ds-valid`;
      const cached = request.cookies.get(cacheKey)?.value;
      if (!cached) {
        const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (serviceKey) {
          const admin = createClient(serviceUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          // Check if there's an active device + active device_session for this user+fp
          const { data: device } = await admin
            .from('devices')
            .select('id')
            .eq('user_id', user.id)
            .eq('device_id', fp)
            .eq('status', 'active')
            .maybeSingle();

          if (!device) {
            // Device was revoked — sign out and redirect
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            // Clear the device cookie
            response.cookies.delete('aipt-device-fp');
            return NextResponse.redirect(loginUrl);
          }

          // Set a short-lived cache cookie to avoid repeated DB lookups
          response.cookies.set(cacheKey, '1', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60, // 60 seconds
          });
        }
      }
    }
  }

  response.headers.set('x-request-id', requestId);
  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico, public files
     * - auth and API routes
     */
    '/((?!_next/static|_next/image|favicon.ico|images/|fonts/|api/|login|register|forgot-password|change-password|join|verify-otp).*)',
  ],
};
