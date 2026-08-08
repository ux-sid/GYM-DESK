import React, { useState, useEffect } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Shield, Search, LayoutGrid, List, MapPin, Phone, Mail, Calendar, Building2 } from 'lucide-react';
import type { Gym } from '../../types';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onNavigate: (tab: string) => void;
}

export const SuperAdminDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { selectGym } = useAuth();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const handleGymClick = async (gymId: string) => {
    await selectGym(gymId);
    onNavigate('dashboard');
  };

  useEffect(() => {
    const fetchAllGyms = async () => {
      try {
        const q = query(collection(db, 'gyms')); // Assuming open read access for now
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Gym));
        
        // Sort manually if index missing
        data.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });

        setGyms(data);
      } catch (err) {
        console.error('Error fetching gyms for super admin', err);
        alert('Failed to load gyms. Ensure Firebase Rules permit reading the gyms collection.');
      } finally {
        setLoading(false);
      }
    };
    fetchAllGyms();
  }, []);

  const filtered = gyms.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase()) || 
    g.email.toLowerCase().includes(search.toLowerCase()) ||
    g.phone.includes(search)
  );

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-full">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="border-b border-border-dark pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-red-500 text-white p-2 rounded-xl">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Master Admin Portal</h1>
            <p className="text-sm text-muted-gray mt-1">Monitor and manage all registered gyms</p>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 text-primary p-3 rounded-full">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-gray">Total Registered Gyms</p>
              <h2 className="text-3xl font-extrabold text-text-main m-0">{gyms.length}</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-gray" />
          <input
            type="text"
            placeholder="Search gyms by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border-muted rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-main outline-none focus:border-primary transition-colors shadow-sm"
          />
        </div>

        <div className="flex bg-surface border border-border-muted p-1 rounded-xl shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-muted-gray hover:bg-surface-light'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-muted-gray hover:bg-surface-light'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid / List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border-muted rounded-2xl">
          <p className="text-muted-gray">No gyms found matching your search.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(g => (
            <div 
              key={g.id} 
              onClick={() => handleGymClick(g.id)}
              className="bg-surface border border-border-muted p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-primary transition-all cursor-pointer group"
            >
              <h3 className="font-bold text-lg text-text-main m-0 mb-4 truncate group-hover:text-primary transition-colors">{g.name}</h3>
              
              <div className="space-y-2 text-sm text-muted-gray">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{g.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <span>{g.phone}</span>
                </div>
                {g.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span className="line-clamp-2">{g.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-border-dark mt-2">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>
                    Registered: {g.createdAt ? format(g.createdAt.toDate ? g.createdAt.toDate() : new Date(g.createdAt), 'PP') : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-border-muted rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-surface-light text-muted-gray border-b border-border-dark">
                <tr>
                  <th className="px-6 py-4 font-semibold">Gym Name</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Phone</th>
                  <th className="px-6 py-4 font-semibold">Registration Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {filtered.map(g => (
                  <tr 
                    key={g.id} 
                    onClick={() => handleGymClick(g.id)}
                    className="hover:bg-surface-light transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-bold text-text-main group-hover:text-primary transition-colors">{g.name}</td>
                    <td className="px-6 py-4 text-muted-gray">{g.email}</td>
                    <td className="px-6 py-4 text-muted-gray">{g.phone}</td>
                    <td className="px-6 py-4 text-muted-gray">
                      {g.createdAt ? format(g.createdAt.toDate ? g.createdAt.toDate() : new Date(g.createdAt), 'PP') : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
