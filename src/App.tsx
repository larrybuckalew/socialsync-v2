import React, { useState } from 'react';
import { LoginPage } from './LoginPage';

interface SimpleUser { uid: string; email: string; displayName: string; }

function App() {
  const [user, setUser] = useState<SimpleUser | null>(null);

  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-gray-900">SocialSync</h1>
        <p className="text-gray-600 mt-2">Welcome, {user.email}!</p>
        <p className="mt-4 text-gray-500">Dashboard coming soon...</p>
      </div>
    </div>
  );
}

export default App;
