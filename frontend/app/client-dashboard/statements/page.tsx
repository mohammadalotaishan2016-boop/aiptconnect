'use client';
import ClientStatementsPage from '../../../src/components/ClientStatementsTablePage';
import dynamic from 'next/dynamic';
const AdminStatementsPage = dynamic(() => import('../../../src/components/AdminStatementsPage'));
import ClientManagement from '../../../src/components/ClientManagement';
import '../requirements/client-requirements.css';
export default function StatementsPage() { return <ClientManagement manager={<AdminStatementsPage />}><ClientStatementsPage /></ClientManagement>; }