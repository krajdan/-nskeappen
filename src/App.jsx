import React, { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth, googleProvider } from './firebase';

const INITIAL_WISHLIST = {
  title: "Barnens Önskelista",
  children: [],
  items: []
};

const CATEGORIES = [
  { name: "Leksaker", icon: "🧸" },
  { name: "Böcker", icon: "📚" },
  { name: "Kläder", icon: "👕" },
  { name: "Pussel & Spel", icon: "🧩" },
  { name: "Sport & Ute", icon: "⚽" },
  { name: "Kreativt & Skola", icon: "🎨" },
  { name: "Annat", icon: "✨" }
];

export default function App() {
  const [listId, setListId] = useState('');
  const [wishlist, setWishlist] = useState(INITIAL_WISHLIST);
  const [mode, setMode] = useState('view'); // 'edit' (Förälder) eller 'view' (Släkting)
  const [activeTab, setActiveTab] = useState('Alla');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [toasts, setToasts] = useState([]);
  const [user, setUser] = useState(null);
  
  const [reservationModal, setReservationModal] = useState({ show: false, itemId: null, name: '' });
  
  // Nytt state för att hålla koll på redigering
  const [editingId, setEditingId] = useState(null);
  
  const [newWish, setNewWish] = useState({
    child: '',
    name: '',
    link: '',
    price: '',
    priority: 'Medel',
    category: 'Leksaker',
    notes: ''
  });

  // Kontrollera om nuvarande inloggade användare är administratör för denna lista
  const isAdmin = !wishlist.adminIds || (user && wishlist.adminIds.includes(user.uid));

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast("Inloggad med Google!");
    } catch (error) {
      console.error("Inloggningsfel:", error);
      showToast("Kunde inte logga in", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast("Du har loggat ut.");
    } catch (error) {
      console.error("Utloggningsfel:", error);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedId = urlParams.get('listId');
    
    if (sharedId) {
      setListId(sharedId);
      setMode('view');
    } else {
      // Tvingar prototypen att alltid hämta din exakta lista från databasen
      setListId('list-8vg83bmvt');
      setMode('edit');
    }
  }, []);

  useEffect(() => {
    if (!db || !listId) {
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, 'wishlists', listId);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWishlist(data);
        
        // --- LOGIK FÖR INBJUDAN ---
        // Om det finns en inbjudningskod i URL:en och användaren är inloggad
        const urlParams = new URLSearchParams(window.location.search);
        const inviteToken = urlParams.get('invite');
        
        if (inviteToken && user && data.inviteToken === inviteToken) {
          const currentAdmins = data.adminIds || [];
          if (!currentAdmins.includes(user.uid)) {
            const updatedAdmins = [...currentAdmins, user.uid];
            // Lägg till användaren som admin och stäng inbjudningskoden
            setDoc(docRef, { ...data, adminIds: updatedAdmins, inviteToken: null }, { merge: true })
              .then(() => {
                showToast("Inbjudan godkänd! Du är nu med-förälder för denna lista. 🎉");
                // Städa bort inbjudan från URL:en så den blir ren igen
                window.history.replaceState({}, document.title, window.location.pathname + `?listId=${listId}`);
              })
              .catch(err => console.error("Kunde inte registrera admin:", err));
          }
        }
      } else {
        const initialData = {
          ...INITIAL_WISHLIST,
          id: listId,
          createdAt: new Date().toISOString()
        };
        if (user) {
          setDoc(docRef, { ...initialData, adminIds: [user.uid] })
            .then(() => setWishlist(initialData))
            .catch(err => console.error("Kunde inte spara grundlista:", err));
        } else {
           setWishlist(initialData);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [listId, user]);

  const saveWishlist = async (updatedList) => {
    setWishlist(updatedList);
    if (db && listId && user) {
      try {
        const docRef = doc(db, 'wishlists', listId);
        const currentAdmins = updatedList.adminIds || wishlist.adminIds || [user.uid];
        
        await setDoc(docRef, { 
          ...updatedList, 
          adminIds: currentAdmins
        });
      } catch (err) {
        console.error("Kunde inte spara till molnet:", err);
        showToast("Ändringen blockerades. Du saknar administratörsbehörighet!", "error");
      }
    } else {
      localStorage.setItem(`wishlist_offline_${listId}`, JSON.stringify(updatedList));
      if (!user && mode === 'edit') {
        showToast("Du är inte inloggad. Ändringar sparas bara lokalt.", "error");
      }
    }
  };

  const handleCreateInviteLink = async () => {
    if (!user || !isAdmin) {
      showToast("Bara administratörer kan bjuda in andra!", "error");
      return;
    }
    const token = 'inv-' + Math.random().toString(36).substring(2, 11);
    const updatedList = { ...wishlist, inviteToken: token };
    setWishlist(updatedList);
    
    if (db && listId) {
      const docRef = doc(db, 'wishlists', listId);
      await setDoc(docRef, updatedList, { merge: true });
    }
    
    const inviteUrl = `${window.location.origin}${window.location.pathname}?listId=${listId}&invite=${token}`;
    
    const tempInput = document.createElement("input");
    tempInput.value = inviteUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    
    showToast("Inbjudningslänk kopierad! Skicka den till med-föräldern. 👥");
  };

  const handleTitleChange = (e) => {
    const updated = { ...wishlist, title: e.target.value };
    saveWishlist(updated);
  };

  const handleAddChild = (e) => {
    e.preventDefault();
    if (!newChildName.trim()) return;
    
    const name = newChildName.trim();
    if (wishlist.children.includes(name)) {
      showToast(`${name} finns redan i listan!`, 'error');
      return;
    }

    const updatedChildren = [...wishlist.children, name];
    const updated = { ...wishlist, children: updatedChildren };
    
    saveWishlist(updated);
    setNewChildName('');
    setShowAddChild(false);
    showToast(`${name} har lagts till i familjen!`);
    
    if (newWish.child === '') {
      setNewWish(prev => ({ ...prev, child: name }));
    }
  };

  const handleRemoveChild = (childName) => {
    const updatedChildren = wishlist.children.filter(c => c !== childName);
    const updatedItems = wishlist.items.filter(item => item.child !== childName);
    
    saveWishlist({ ...wishlist, children: updatedChildren, items: updatedItems });
    if (activeTab === childName) setActiveTab('Alla');
    showToast(`${childName} raderades.`);
  };

  // Kombinerad submit-funktion för Ny och Redigera
  const handleSubmitWish = (e) => {
    e.preventDefault();
    if (!newWish.name.trim()) {
      showToast("Önskningen måste ha ett namn!", "error");
      return;
    }

    if (editingId) {
      // Vi är i redigeringsläge
      const updatedItems = wishlist.items.map(item => 
        item.id === editingId ? { ...item, ...newWish } : item
      );
      saveWishlist({ ...wishlist, items: updatedItems });
      showToast("Önskningen har uppdaterats!");
      setEditingId(null);
    } else {
      // Skapar ny önskning
      const item = {
        id: 'wish-' + Math.random().toString(36).substring(2, 11),
        child: newWish.child || wishlist.children[0] || 'Okänd',
        name: newWish.name.trim(),
        link: newWish.link.trim(),
        price: newWish.price.trim(),
        priority: newWish.priority,
        category: newWish.category,
        notes: newWish.notes.trim(),
        reserved: false,
        reservedBy: ""
      };
      const updatedItems = [item, ...wishlist.items];
      saveWishlist({ ...wishlist, items: updatedItems });
      showToast(`Lade till önskningen "${item.name}"!`);
    }

    // Töm formuläret
    setNewWish({
      child: wishlist.children[0] || '',
      name: '',
      link: '',
      price: '',
      priority: 'Medel',
      category: 'Leksaker',
      notes: ''
    });
  };

  // Nya funktioner för att hantera klick på Redigera
  const handleEditClick = (item) => {
    setNewWish({
      child: item.child,
      name: item.name,
      link: item.link || '',
      price: item.price || '',
      priority: item.priority || 'Medel',
      category: item.category || 'Leksaker',
      notes: item.notes || ''
    });
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewWish({
      child: wishlist.children[0] || '',
      name: '',
      link: '',
      price: '',
      priority: 'Medel',
      category: 'Leksaker',
      notes: ''
    });
  };

  const handleRemoveWish = (id) => {
    const updatedItems = wishlist.items.filter(item => item.id !== id);
    saveWishlist({ ...wishlist, items: updatedItems });
    showToast("Önskningen raderades.");
  };

  const openReservationModal = (id) => {
    setReservationModal({ show: true, itemId: id, name: '' });
  };

  const handleReserve = () => {
    if (!reservationModal.name.trim()) {
      showToast("Vänligen skriv ditt namn för att reservera önskningen", "error");
      return;
    }

    const updatedItems = wishlist.items.map(item => {
      if (item.id === reservationModal.itemId) {
        return {
          ...item,
          reserved: true,
          reservedBy: reservationModal.name.trim()
        };
      }
      return item;
    });

    saveWishlist({ ...wishlist, items: updatedItems });
    setReservationModal({ show: false, itemId: null, name: '' });
    showToast("Önskningen har reserverats!");
  };

  const handleCancelReservation = (id) => {
    const updatedItems = wishlist.items.map(item => {
      if (item.id === id) {
        return {
          ...item,
          reserved: false,
          reservedBy: ""
        };
      }
      return item;
    });

    saveWishlist({ ...wishlist, items: updatedItems });
    showToast("Reserveringen har tagits bort.");
  };

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?listId=${listId}`;
    
    const tempInput = document.createElement("input");
    tempInput.value = shareUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    
    showToast("Kopierat! Skicka länken till familj och vänner! 🎁");
  };

  const filteredItems = wishlist.items.filter(item => {
    if (activeTab === 'Alla') return true;
    return item.child.toLowerCase() === activeTab.toLowerCase();
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-600 font-medium">Hämtar önskelistan...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-pink-50 text-slate-800 font-sans pb-20">
      
      {/* Toast-notiser */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`p-4 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 transform translate-y-0 flex items-center justify-between pointer-events-auto ${
            t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border-emerald-100 text-emerald-800 shadow-emerald-100/40'
          }`}>
            <div className="flex items-center gap-2">
              {t.type === 'error' ? '⚠️' : '🎉'}
              <span>{t.message}</span>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))} className="text-slate-400 hover:text-slate-600 ml-2">×</button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-white/90">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-xl shadow-md shadow-indigo-100">
              🎁
            </div>
            <div>
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Familjeportal</span>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Barnens Önskelistor</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setMode('edit')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  mode === 'edit' 
                    ? 'bg-white text-indigo-700 shadow' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>✏️</span> Föräldraläge
              </button>
              <button 
                onClick={() => {
                  setMode('view');
                  showToast("Växlade till visningsläge för släkten!");
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  mode === 'view' 
                    ? 'bg-white text-indigo-700 shadow' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>👀</span> Givarläge
              </button>
            </div>

            {/* Inloggning Google - Alltid synlig för administratörer */}
            {user ? (
              <div className="flex items-center gap-2 bg-slate-100 p-1 pl-3 rounded-xl ml-2 border border-slate-200">
                <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">
                  {user.displayName?.split(' ')[0]}
                </span>
                <button 
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold rounded-lg shadow-sm transition-all"
                >
                  Logga ut
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ml-2"
              >
                Logga in
              </button>
            )}

            {/* Inbjudningsknapp för med-admin */}
            {mode === 'edit' && isAdmin && user && (
              <button
                onClick={handleCreateInviteLink}
                className="w-full sm:w-auto px-5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                👥 Bjud in med-förälder
              </button>
            )}

            <button
              onClick={handleCopyShareLink}
              className="w-full sm:w-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 10.748a3.001 3.001 0 110 2.504m0-2.504a3.001 3.001 0 112.504-1.342m-2.504 1.342a3.001 3.001 0 112.504 1.342" />
              </svg>
              Dela
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8">
        
        {/* Säkerhetsmeddelande om man försöker redigera utan att vara admin */}
        {mode === 'edit' && !isAdmin && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl mb-6 text-sm font-medium animate-pulse">
            🔒 Du är i föräldraläge men är inte inloggad som administratör för denna lista. Logga in eller använd en inbjudningslänk för att kunna göra ändringar.
          </div>
        )}

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              {mode === 'edit' && isAdmin ? (
                <div className="group relative">
                  <input
                    type="text"
                    value={wishlist.title || ''}
                    onChange={handleTitleChange}
                    className="text-2xl md:text-3xl font-extrabold text-slate-950 bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none w-full transition-all py-1"
                    placeholder="Namnge din önskelista..."
                  />
                  <span className="absolute right-2 top-3 text-slate-400 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">Klicka för att ändra</span>
                </div>
              ) : (
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">
                  {wishlist.title || 'Barnens Önskelista'}
                </h2>
              )}
              <p className="text-slate-500 text-sm mt-1">
                {mode === 'edit' 
                  ? 'Välkommen! Lägg till önskningar och ändra till givarläget för att testa hur släktingarna ser sidan.'
                  : 'Välj önskningar nedan och reservera dem för att visa andra släktingar vad du köper!'}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-center bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 text-xs text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-full ${db && user && isAdmin ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
              <span>{db && user && isAdmin ? 'Realtidssynk aktiv' : 'Lokalt/Ej Admin'}</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Barn i familjen:</span>
              
              {wishlist.children?.map(child => (
                <div key={child} className="inline-flex items-center gap-1.5 bg-indigo-50/75 border border-indigo-100 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-800">
                  <span>👶 {child}</span>
                  {mode === 'edit' && isAdmin && (
                    <button 
                      onClick={() => handleRemoveChild(child)}
                      title={`Radera ${child}`}
                      className="text-indigo-400 hover:text-red-600 font-bold ml-1 transition-colors text-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {mode === 'edit' && isAdmin && (
                <div className="relative">
                  {!showAddChild ? (
                    <button
                      onClick={() => setShowAddChild(true)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all"
                    >
                      + Lägg till barn
                    </button>
                  ) : (
                    <form onSubmit={handleAddChild} className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow border border-slate-200">
                      <input
                        type="text"
                        placeholder="Namn..."
                        value={newChildName}
                        onChange={(e) => setNewChildName(e.target.value)}
                        className="px-2 py-1 text-xs focus:outline-none w-28 text-slate-800"
                        autoFocus
                      />
                      <button type="submit" className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg">✓</button>
                      <button type="button" onClick={() => setShowAddChild(false)} className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg">×</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

        <div className={`grid gap-8 ${mode === 'edit' && isAdmin ? 'lg:grid-cols-3' : 'grid-cols-1'}`}>
          
          {mode === 'edit' && isAdmin && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 sticky top-24">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                  <span>{editingId ? '✏️' : '✍️'}</span> {editingId ? 'Redigera önskning' : 'Lägg till en önskning'}
                </h3>
                
                <form onSubmit={handleSubmitWish} className="space-y-4">
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Vem önskar sig detta?</label>
                    <select
                      value={newWish.child}
                      onChange={(e) => setNewWish(prev => ({ ...prev, child: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {(!wishlist.children || wishlist.children.length === 0) && <option value="">Välj eller lägg till barn...</option>}
                      {wishlist.children?.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Vad önskas? *</label>
                    <input
                      type="text"
                      required
                      placeholder="T.ex. LEGO Ninjago"
                      value={newWish.name}
                      onChange={(e) => setNewWish(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Kategori</label>
                    <select
                      value={newWish.category}
                      onChange={(e) => setNewWish(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">Pris (kr)</label>
                      <input
                        type="text"
                        placeholder="899"
                        value={newWish.price}
                        onChange={(e) => setNewWish(prev => ({ ...prev, price: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">Prioritet</label>
                      <select
                        value={newWish.priority}
                        onChange={(e) => setNewWish(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Hög">🔥 Hög</option>
                        <option value="Medel">✨ Medel</option>
                        <option value="Låg">🧸 Låg</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Länk till butik</label>
                    <input
                      type="url"
                      placeholder="https://amazon.se/..."
                      value={newWish.link}
                      onChange={(e) => setNewWish(prev => ({ ...prev, link: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Anteckningar / Storlek / Färg</label>
                    <textarea
                      placeholder="Skriv t.ex. storlek eller färg..."
                      value={newWish.notes}
                      onChange={(e) => setNewWish(prev => ({ ...prev, notes: e.target.value }))}
                      rows="2"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    ></textarea>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                    >
                      {editingId ? (
                        <><span>💾</span> Uppdatera</>
                      ) : (
                        <><span>➕</span> Spara önskning</>
                      )}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all"
                      >
                        Avbryt
                      </button>
                    )}
                  </div>

                </form>
              </div>
            </div>
          )}

          <div className={mode === 'edit' && isAdmin ? 'lg:col-span-2' : 'col-span-1'}>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
              <button
                onClick={() => setActiveTab('Alla')}
                className={`px-4.5 py-2 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
                  activeTab === 'Alla'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'
                }`}
              >
                🌍 Alla barn ({wishlist.items?.length || 0})
              </button>
              
              {wishlist.children?.map(child => {
                const count = wishlist.items?.filter(item => item.child.toLowerCase() === child.toLowerCase()).length || 0;
                return (
                  <button
                    key={child}
                    onClick={() => setActiveTab(child)}
                    className={`px-4.5 py-2 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      activeTab === child
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'
                    }`}
                  >
                    <span>👶</span> {child} ({count})
                  </button>
                );
              })}
            </div>

            {(!wishlist.items || filteredItems.length === 0) ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl mb-4">
                  🧸
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">Här var det tomt!</h4>
                <p className="text-slate-500 text-sm max-w-sm">
                  {activeTab === 'Alla' 
                    ? 'Det finns inga önskningar tillagda ännu. Byt till Föräldraläget för att börja bygga listan!'
                    : `Det finns inga sparade önskningar för ${activeTab} just nu.`}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredItems.map((item) => {
                  const categoryIcon = CATEGORIES.find(c => c.name === item.category)?.icon || "✨";
                  
                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white rounded-2xl p-5 border shadow-sm transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                        item.reserved 
                          ? 'border-emerald-100 bg-emerald-50/10' 
                          : 'border-slate-100 hover:shadow-md hover:border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="px-2.5 py-1 bg-slate-100 text-[10px] font-bold text-slate-600 rounded-lg flex items-center gap-1">
                            <span>{categoryIcon}</span> {item.category}
                          </span>
                          <span className="px-2.5 py-1 bg-indigo-50 text-[10px] font-extrabold text-indigo-700 rounded-lg">
                            🧒 {item.child}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-slate-900 leading-snug mb-1">
                          {item.name}
                        </h4>

                        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                          {item.price && (
                            <span className="font-extrabold text-slate-900">{item.price} kr</span>
                          )}
                          <span className="flex items-center gap-1 text-[11px]">
                            Prioritet: 
                            <span className={`font-semibold ${
                              item.priority === 'Hög' ? 'text-rose-600' : item.priority === 'Medel' ? 'text-amber-600' : 'text-slate-500'
                            }`}>
                              {item.priority}
                            </span>
                          </span>
                        </div>

                        {item.notes && (
                          <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4 line-clamp-3">
                            {item.notes}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-50">
                        
                        {item.reserved ? (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                              <span className="text-base">✓</span>
                              <span>Inköpt/Reserverad av {item.reservedBy}</span>
                            </div>
                            
                            <button
                              onClick={() => handleCancelReservation(item.id)}
                              className="text-[10px] font-bold text-slate-400 hover:text-red-600 self-start transition-colors"
                            >
                              Ta bort reservering
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {mode === 'view' ? (
                              <button
                                onClick={() => openReservationModal(item.id)}
                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-100 transition-all flex items-center justify-center gap-1"
                              >
                                <span>🎁</span> Reservera önskning
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">Ej reserverad</span>
                                {isAdmin && (
                                  <div className="ml-auto flex items-center gap-2">
                                    <button
                                      onClick={() => handleEditClick(item)}
                                      className="text-xs font-bold text-indigo-500 hover:text-indigo-700 p-1"
                                      title="Redigera önskning"
                                    >
                                      Redigera ✏️
                                    </button>
                                    <button
                                      onClick={() => handleRemoveWish(item.id)}
                                      className="text-xs font-bold text-slate-400 hover:text-red-600 p-1"
                                      title="Ta bort önskning"
                                    >
                                      Ta bort 🗑️
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {item.link && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 block text-center text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center justify-center gap-1 py-1 hover:underline"
                          >
                            Visa i butik
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}

                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-8 bg-indigo-50/50 rounded-3xl p-6 border border-indigo-100/50">
              <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2 mb-2">
                <span>💡</span> Hur fungerar den delningsbara listan?
              </h4>
              <ul className="text-xs text-indigo-950/80 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold">1.</span>
                  <span><strong>Lägg till önskningar:</strong> Använd föräldraläget för att fylla på listan med barnens drömmar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold">2.</span>
                  <span><strong>Kopiera länk:</strong> Klicka på "Kopiera delningslänk" överst på sidan och klistra in i ett meddelande till släkten.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600 font-bold">3.</span>
                  <span><strong>Familjen reserverar:</strong> När de klickar på länken hamnar de i ett säkert givarläge där de kan markera vad de tänker köpa så att ingen köper dubbelt.</span>
                </li>
              </ul>
            </div>

          </div>

        </div>

      </main>

      {reservationModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-xl mb-4 text-emerald-600">
              🎁
            </div>
            
            <h3 className="text-lg font-bold text-slate-900 mb-1">Reservera önskning</h3>
            <p className="text-xs text-slate-500 mb-4">
              Genom att skriva ditt namn här vet andra släktingar att du köper denna present, så slipper vi dubbelköp!
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Ditt namn (t.ex. "Mormor", "Farbror Johan")</label>
              <input
                type="text"
                placeholder="Skriv ditt namn..."
                value={reservationModal.name}
                onChange={(e) => setReservationModal(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleReserve}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-100 transition-all"
              >
                Slutför reservering
              </button>
              <button
                onClick={() => setReservationModal({ show: false, itemId: null, name: '' })}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}