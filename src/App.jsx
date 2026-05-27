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
  const [mode, setMode] = useState('view');
  const [activeTab, setActiveTab] = useState('Alla');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [toasts, setToasts] = useState([]);
  const [user, setUser] = useState(null);
  const [reservationModal, setReservationModal] = useState({ show: false, itemId: null, name: '' });
  
  const [newWish, setNewWish] = useState({
    child: '',
    name: '',
    link: '',
    price: '',
    priority: 'Medel',
    category: 'Leksaker',
    notes: ''
  });

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
      let localId = localStorage.getItem('myWishlistId');
      if (!localId) {
        localId = 'list-' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('myWishlistId', localId);
      }
      setListId(localId);
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
        setWishlist(docSnap.data());
      } else {
        const initialData = {
          ...INITIAL_WISHLIST,
          id: listId,
          createdAt: new Date().toISOString()
        };
        if (user) {
          setDoc(docRef, { ...initialData, ownerId: user.uid })
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

  // HÄR ÄR DEN VIKTIGA ÄNDRINGEN FÖR SÄKERHETEN
  const saveWishlist = async (updatedList) => {
    setWishlist(updatedList);
    if (db && listId && user) {
      try {
        const docRef = doc(db, 'wishlists', listId);
        await setDoc(docRef, { 
          ...updatedList, 
          ownerId: user.uid // Kopplar listan till din användare
        });
      } catch (err) {
        console.error("Kunde inte spara:", err);
        showToast("Du har inte behörighet att ändra denna lista!", "error");
      }
    } else {
      localStorage.setItem(`wishlist_offline_${listId}`, JSON.stringify(updatedList));
    }
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
      showToast(`${name} finns redan!`, 'error');
      return;
    }
    const updated = { ...wishlist, children: [...wishlist.children, name] };
    saveWishlist(updated);
    setNewChildName('');
    setShowAddChild(false);
  };

  const handleRemoveChild = (childName) => {
    const updatedChildren = wishlist.children.filter(c => c !== childName);
    const updatedItems = wishlist.items.filter(item => item.child !== childName);
    saveWishlist({ ...wishlist, children: updatedChildren, items: updatedItems });
  };

  const handleAddWish = (e) => {
    e.preventDefault();
    if (!newWish.name.trim()) return;

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

    saveWishlist({ ...wishlist, items: [item, ...wishlist.items] });
    setNewWish({ child: wishlist.children[0] || '', name: '', link: '', price: '', priority: 'Medel', category: 'Leksaker', notes: '' });
  };

  const handleRemoveWish = (id) => {
    saveWishlist({ ...wishlist, items: wishlist.items.filter(item => item.id !== id) });
  };

  const openReservationModal = (id) => {
    setReservationModal({ show: true, itemId: id, name: '' });
  };

  const handleReserve = () => {
    if (!reservationModal.name.trim()) return;
    const updatedItems = wishlist.items.map(item => 
      item.id === reservationModal.itemId 
        ? { ...item, reserved: true, reservedBy: reservationModal.name.trim() } 
        : item
    );
    saveWishlist({ ...wishlist, items: updatedItems });
    setReservationModal({ show: false, itemId: null, name: '' });
  };

  const handleCancelReservation = (id) => {
    const updatedItems = wishlist.items.map(item => 
      item.id === id ? { ...item, reserved: false, reservedBy: "" } : item
    );
    saveWishlist({ ...wishlist, items: updatedItems });
  };

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?listId=${listId}`;
    navigator.clipboard.writeText(shareUrl);
    showToast("Länk kopierad!");
  };

  const filteredItems = wishlist.items.filter(item => activeTab === 'Alla' ? true : item.child.toLowerCase() === activeTab.toLowerCase());

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Laddar...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      {/* Här ligger din befintliga JSX, den är oförändrad förutom logiken ovan */}
      {/* ... (Din befintliga layout-kod) ... */}
      <h1 className="text-2xl font-bold">{wishlist.title}</h1>
      {/* ... resten av din kod ... */}
    </div>
  );
}