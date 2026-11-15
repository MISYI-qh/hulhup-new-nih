import { Skeleton } from '@/components/ui';
export default function Loading() { return <div className="app"><div className="topbar"><div className="ibtn" /><div className="mid"><div className="sk" style={{ width: 120, height: 22 }} /></div><div className="ibtn" /></div><Skeleton n={3} /></div>; }
