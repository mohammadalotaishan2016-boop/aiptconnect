import { notFound } from 'next/navigation';
import ClientPoaRoute from '../../client-dashboard/poa/page';

export const metadata = { title: 'POA visual test fixture' };

export default function PoaPreviewTestPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <div className="poa-dev-preview"><ClientPoaRoute /></div>;
}
