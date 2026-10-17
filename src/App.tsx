import { usePreferences } from '@/hooks/usePreferences';
import Dashboard from '@/components/Dashboard';

export default function App() {
  const { preferences, loading, updatePreferences } = usePreferences();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Dashboard
      preferences={preferences}
      updatePreferences={updatePreferences}
    />
  );
}
