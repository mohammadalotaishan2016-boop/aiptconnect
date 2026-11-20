import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
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

  return response;
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
